import { area, type Clipper, type Paths } from '../Clipper'
import { toPolygons, type Artwork, type Conductor, type Face } from '../Cam'
import { splitKey, type Doc } from '../Document'
import type { Netlist } from '../Netlist'

export type Rule      = 'overlap' | 'edge' | 'hole'
export type Violation = { rule: Rule, face: Face | null, owners: string[], polygons: Paths, center: [number, number] }

type Group = { name: string, conductors: Conductor[], copper: Paths, grown: Paths, box: number[] }

const MIN_AREA = 0.01    // mil², INTERSEÇÃO MENOR QUE ISSO É RUÍDO NUMÉRICO
const SLACK    = 0.01    // mil: FOLGA EXATAMENTE IGUAL A k PASSA (BORDAS ENCOSTADAS NÃO VIRAM FAIXA POR ARREDONDAMENTO)
const OBSTACLE = 'obs:'  // COBRE SEM CONECTOR: SÓ É OBSTÁCULO, NUNCA É TESTADO CONTRA OUTRO OBSTÁCULO
const CHECKED  = ['pad', 'copper', 'trace']

const boxOf = (paths: Paths) => paths.flat().reduce((box, value, i) => i % 2 ? [box[0], Math.min(box[1], value), box[2], Math.max(box[3], value)] : [Math.min(box[0], value), box[1], Math.max(box[2], value), box[3]], [Infinity, Infinity, -Infinity, -Infinity])

const overlaps = (a: number[], b: number[]) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]

const solid = (paths: Paths) => paths.reduce((sum, path) => sum + area(path), 0) > MIN_AREA

const centerOf = (paths: Paths): [number, number] => {
    const [x0, y0, x1, y1] = boxOf(paths)
    return [(x0 + x1) / 2, (y0 + y1) / 2]
}

// GRUPO ELÉTRICO DE CADA CONDUTOR NA PCB: A NET ROTEADA NA VISTA; CONECTORES ISOLADOS E COBRE SEM CONECTOR DE UMA PEÇA FORMAM UM GRUPO SÓ (SPEC 03 §7.1)
export const getGroupOf = (doc: Doc, netlist: Netlist) => {
    const routed = netlist.routed.pcbView ?? new Uint32Array()
    const owners = new Map<number, Set<string>>()
    const wired  = new Set<number>()

    netlist.keys.forEach((key, node) => {
        const owner = splitKey(key)[0]

        if (doc.instances[owner]?.moduleIdRef === 'WireModuleID')
            return void wired.add(routed[node])

        owners.set(routed[node], (owners.get(routed[node]) ?? new Set()).add(owner))
    })

    return (conductor: Conductor) => {
        const node  = conductor.key ? netlist.index.get(conductor.key) : undefined
        const label = node === undefined ? undefined : routed[node]

        if (conductor.kind === 'copper')
            return `${OBSTACLE}${conductor.owner}`

        if (label === undefined)
            return `iso:${conductor.owner}`

        return conductor.kind === 'pad' && !wired.has(label) && (owners.get(label)?.size ?? 0) <= 1 ? `iso:${conductor.owner}` : `net:${label}`
    }
}

// VERIFICAÇÃO DE REGRAS VETORIAL: FOLGA ENTRE GRUPOS POR (Q_g ⊕ k/2) ∩ (Q_h ⊕ k/2), COBRE A MENOS DE k DA BORDA, FUROS FORA DA PLACA (SPEC 03 §7.3)
export const checkRules = (clipper: Clipper, artwork: Artwork, groupOf: (conductor: Conductor) => string, keepout: number): Violation[] => {
    const { board } = artwork
    const faces: Face[] = board.layers > 1 ? ['top', 'bottom'] : ['bottom']
    const found: Violation[] = []

    for (const face of faces) {
        const named = new Map<string, Conductor[]>()

        artwork.conductors.filter(conductor => conductor.face === face && CHECKED.includes(conductor.kind)).forEach(conductor => named.set(groupOf(conductor), [...named.get(groupOf(conductor)) ?? [], conductor]))

        const groups: Group[] = [...named].map(([name, conductors]) => {
            const copper = clipper.union(conductors.flatMap(conductor => toPolygons(clipper, conductor.shape)))
            const grown  = clipper.inflate(copper, keepout / 2 - SLACK)
            return { name, conductors, copper, grown, box: boxOf(grown) }
        }).filter(group => group.copper.length)

        const culprits = (group: Group, region: Paths) => {
            const box = boxOf(region)
            return group.conductors.filter(conductor => {
                const polygons = toPolygons(clipper, conductor.shape, keepout / 2 - SLACK)
                return overlaps(boxOf(polygons), box) && solid(clipper.intersection(polygons, region))
            }).map(conductor => conductor.owner)
        }

        groups.forEach((group, i) => groups.slice(i + 1).filter(other => overlaps(group.box, other.box) && !(group.name.startsWith(OBSTACLE) && other.name.startsWith(OBSTACLE))).forEach(other => {
            const region = clipper.intersection(group.grown, other.grown)

            if (solid(region))
                found.push({ rule: 'overlap', face, owners: [...new Set([...culprits(group, region), ...culprits(other, region)])], polygons: region, center: centerOf(region) })
        }))

        groups.forEach(group => {
            const outside = clipper.difference(clipper.inflate(group.copper, keepout - 2 * SLACK), board.outline)

            if (solid(outside))
                found.push({ rule: 'edge', face, owners: [...new Set(group.conductors.map(conductor => conductor.owner))], polygons: outside, center: centerOf(outside) })
        })
    }

    artwork.holes.filter(hole => !hole.connector).forEach(hole => {
        const disk    = toPolygons(clipper, { kind: 'circle', x: hole.x, y: hole.y, r: hole.diameter / 2, w: 0, fill: true, drill: false })
        const outside = clipper.difference(disk, board.outline)

        if (solid(outside))
            found.push({ rule: 'hole', face: null, owners: [], polygons: disk, center: [hole.x, hole.y] })
    })

    return found
}
