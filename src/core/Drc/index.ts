import { area, type Clipper, type Paths } from '../Clipper'
import { solidOf, toPolygons, type Artwork, type Conductor, type Face } from '../Cam'
import { splitKey, type Doc } from '../Document'
import type { Netlist } from '../Netlist'
import type { Library } from '../Library'

export type Rule      = 'overlap' | 'edge' | 'hole' | 'width' | 'ring' | 'drill'
export type Violation = { rule: Rule, face: Face | null, owners: string[], polygons: Paths, center: [number, number], measured?: number, limit?: number }
// CLASSE DE NET (mil; 0 = VALE A REGRA GERAL): A NET ENTRA NA CLASSE SE ALGUM TERMINAL DELA TEM UM DOS NOMES (GND, VCC…), COMO AS CLASSES DO KICAD E DO ALTIUM
export type NetClass  = { name: string, nets: string[], width: number, clearance: number }
export type Rules     = { keepout: number, minWidth: number, minRing: number, minDrill: number, classes: NetClass[] }

type Group = { name: string, conductors: Conductor[], copper: Paths, clearance: number, grown: Map<number, Paths>, box: number[] }

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

export const basicRules = (keepout: number): Rules => ({ keepout, minWidth: 0, minRing: 0, minDrill: 0, classes: [] })

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

// VERIFICAÇÃO DE REGRAS VETORIAL: FOLGA ENTRE GRUPOS POR (Q_g ⊕ c/2) ∩ (Q_h ⊕ c/2) COM c A MAIOR FOLGA DAS CLASSES DOS DOIS, COBRE A MENOS DE k DA BORDA, FUROS FORA DA
// PLACA, TRILHA MAIS FINA QUE O MÍNIMO (DA CLASSE OU GERAL), ANEL MENOR QUE O MÍNIMO (O DISCO DO FURO + ANEL TEM DE CABER NO PAD EM CADA FACE) E FURO MENOR QUE O MÍNIMO (SPEC 03 §7.3)
export const checkRules = (clipper: Clipper, artwork: Artwork, groupOf: (conductor: Conductor) => string, rules: Rules, classOf: (conductor: Conductor) => number = () => -1): Violation[] => {
    const { board } = artwork
    const { keepout } = rules
    const faces: Face[] = board.layers > 1 ? ['top', 'bottom'] : ['bottom']
    const found: Violation[] = []
    const ruleOf = (conductor: Conductor): NetClass | undefined => rules.classes[classOf(conductor)]
    const disk   = (x: number, y: number, r: number) => toPolygons(clipper, { kind: 'circle', x, y, r, w: 0, fill: true, drill: false })

    for (const face of faces) {
        const named = new Map<string, Conductor[]>()

        artwork.conductors.filter(conductor => conductor.face === face && CHECKED.includes(conductor.kind)).forEach(conductor => named.set(groupOf(conductor), [...named.get(groupOf(conductor)) ?? [], conductor]))

        // O DILATADO DE CADA GRUPO SAI UMA VEZ POR FOLGA USADA (SÓ HÁ MAIS DE UMA COM CLASSES DE NET)
        const grownBy = (group: Group, clearance: number) => {
            if (!group.grown.has(clearance))
                group.grown.set(clearance, clipper.inflate(group.copper, clearance / 2 - SLACK))

            return group.grown.get(clearance) as Paths
        }

        const groups: Group[] = [...named].map(([name, conductors]) => {
            const copper    = clipper.union(conductors.flatMap(conductor => toPolygons(clipper, conductor.shape)))
            const clearance = Math.max(keepout, ...conductors.map(conductor => ruleOf(conductor)?.clearance ?? 0))
            const group     = { name, conductors, copper, clearance, grown: new Map<number, Paths>(), box: [] as number[] }
            return { ...group, box: boxOf(grownBy(group, clearance)) }
        }).filter(group => group.copper.length)

        const culprits = (group: Group, region: Paths, clearance: number) => {
            const box = boxOf(region)
            return group.conductors.filter(conductor => {
                const polygons = toPolygons(clipper, conductor.shape, clearance / 2 - SLACK)
                return overlaps(boxOf(polygons), box) && solid(clipper.intersection(polygons, region))
            }).map(conductor => conductor.owner)
        }

        groups.forEach((group, i) => groups.slice(i + 1).filter(other => overlaps(group.box, other.box) && !(group.name.startsWith(OBSTACLE) && other.name.startsWith(OBSTACLE))).forEach(other => {
            const clearance = Math.max(group.clearance, other.clearance)
            const region    = clipper.intersection(grownBy(group, clearance), grownBy(other, clearance))

            if (solid(region))
                found.push({ rule: 'overlap', face, owners: [...new Set([...culprits(group, region, clearance), ...culprits(other, region, clearance)])], polygons: region, center: centerOf(region), limit: clearance })
        }))

        artwork.conductors.filter(conductor => conductor.face === face && conductor.kind === 'trace').forEach(conductor => {
            const limit = Math.max(rules.minWidth, ruleOf(conductor)?.width ?? 0)
            const width = conductor.shape.kind === 'path' ? conductor.shape.w : Infinity

            if (width < limit - SLACK) {
                const polygons = toPolygons(clipper, conductor.shape)
                found.push({ rule: 'width', face, owners: [conductor.owner], polygons, center: centerOf(polygons), measured: width, limit })
            }
        })

        if (rules.minRing > 0) {
            const pads = artwork.conductors.filter(conductor => conductor.face === face && conductor.kind === 'pad').map(conductor => ({ conductor, polygons: toPolygons(clipper, solidOf(conductor.shape)) }))

            artwork.holes.filter(hole => hole.connector && hole.plated).forEach(hole => {
                const near   = pads.filter(pad => overlaps(boxOf(pad.polygons), [hole.x, hole.y, hole.x, hole.y]))
                const needed = disk(hole.x, hole.y, hole.diameter / 2 + rules.minRing - SLACK)

                if (near.length && solid(clipper.difference(needed, clipper.union(near.flatMap(pad => pad.polygons)))))
                    found.push({ rule: 'ring', face, owners: [...new Set(near.map(pad => pad.conductor.owner))], polygons: needed, center: [hole.x, hole.y], limit: rules.minRing })
            })
        }

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

    artwork.holes.filter(hole => hole.diameter < rules.minDrill - SLACK).forEach(hole => found.push({ rule: 'drill', face: null, owners: [], polygons: disk(hole.x, hole.y, hole.diameter / 2), center: [hole.x, hole.y], measured: hole.diameter, limit: rules.minDrill }))

    return found
}

// CLASSE DE CADA CONDUTOR PELA NET LÓGICA DA PCB: A PRIMEIRA CLASSE QUE TEM O NOME DE UM TERMINAL DA NET (GND) OU PEÇA.TERMINAL (U1.7), SEM DIFERENÇA DE CAIXA; -1 SEM CLASSE
export const getClassOf = (doc: Doc, library: Library, netlist: Netlist, classes: NetClass[]) => {
    const labels = netlist.nets.pcbView ?? new Uint32Array()
    const found  = new Map<number, number>()
    const wanted = classes.map(netClass => new Set(netClass.nets.map(net => net.trim().toLowerCase())))

    netlist.keys.forEach((key, node) => {
        const [owner, id] = splitKey(key)
        const instance    = doc.instances[owner]
        const name        = library.getPart(instance?.moduleIdRef ?? '')?.connectors.find(connector => connector.id === id)?.name.trim().toLowerCase()
        const index       = name ? wanted.findIndex(names => names.has(name) || names.has(`${instance?.title ?? ''}.${name}`.toLowerCase())) : -1

        if (index >= 0 && !found.has(labels[node]))
            found.set(labels[node], index)
    })

    return (conductor: Conductor) => {
        const node = conductor.key ? netlist.index.get(conductor.key) : undefined
        return node === undefined ? -1 : found.get(labels[node]) ?? -1
    }
}
