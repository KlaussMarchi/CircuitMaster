import { apply, multiply, type Matrix } from '../Geometry'
import { flattenPath, SvgFile } from '../SvgFile'
import { childrenOf, tagOf, walk, type XmlElement } from '../Xml'
import { keyOf, WIRE_FLAGS, type Doc } from '../Document'
import type { Library } from '../Library'
import type { Part } from '../Part'
import type { Instance } from '../Sketch'
import { MIL_PER_INCH, PX_PER_INCH } from '../Units'
import { Clipper, END, FILL, JOIN, type Paths } from '../Clipper'
import { getTextRuns } from '../Font'

export type Shape =
    { kind: 'circle', x: number, y: number, r: number, w: number, fill: boolean, drill: boolean } |
    { kind: 'rect', x: number, y: number, width: number, height: number, w: number, fill: boolean } |
    { kind: 'path', points: number[], closed: boolean, w: number, fill: boolean, cap: string } |
    { kind: 'region', paths: Paths, evenOdd: boolean }

export type Placement = { getMatrix: (modelIndex: string) => Matrix | null, isShown: (instance: Instance) => boolean, getLabelLines: (modelIndex: string) => string[], getLabelMatrix: (modelIndex: string) => Matrix | null }

export type Face    = 'top' | 'bottom'
export type Pad     = { shape: Shape, face: Face, smd: boolean }
export type Hole    = { x: number, y: number, diameter: number, plated: boolean, connector: boolean }
export type Placed  = { instance: Instance, x: number, y: number, rotation: number, face: Face }
export type Board   = { instance: Instance, width: number, height: number, outline: Paths, layers: number, frame: Matrix }
export type Conductor = { face: Face, shape: Shape, owner: string, key: string | null, kind: 'pad' | 'copper' | 'trace' | 'fill' | 'blocker' }
export type Artwork   = { board: Board, copper: Record<Face, Shape[]>, pads: Pad[], silk: Record<Face, Shape[]>, holes: Hole[], placed: Placed[], conductors: Conductor[], skipped: number }

const SCALE           = MIL_PER_INCH / PX_PER_INCH
const POINTS_PER_INCH = 72
const TRACE_MILS  = 24
const ARC_STEPS   = 64
const NO_DRILL    = new Set(['0', 'no', 'false'])
const DRAWN       = new Set(['circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'path', 'text'])
const SKIPPED     = new Set(['image', 'use', 'tspan'])
const BOARD_KINDS = ['board', 'resizableBoard']
const LABEL_FONT  = 'ocrfritzingmono'
const FACES: [string, Face, 'copper' | 'silk'][] = [['groundplane1', 'top', 'copper'], ['groundplane', 'bottom', 'copper'], ['copper1', 'top', 'copper'], ['copper0', 'bottom', 'copper'], ['silkscreen', 'top', 'silk'], ['silkscreen0', 'bottom', 'silk']]

const other = (face: Face): Face => face === 'top' ? 'bottom' : 'top'

// FURO DESENHADO SÓ PARA A TELA (VIA E FURO GERADOS): CÍRCULO PRETO COM drill="0" NÃO É COBRE NEM FURO (SPEC 01 §8.11)
const isHoleMark = (element: XmlElement) => tagOf(element) === 'circle' && NO_DRILL.has(element.getAttribute('drill') ?? '') && ['black', '#000000'].includes(element.getAttribute('fill') ?? '')

const sampleEllipse = (cx: number, cy: number, rx: number, ry: number) => Array.from({ length: ARC_STEPS }, (_, i) => [cx + rx * Math.cos(2 * Math.PI * i / ARC_STEPS), cy + ry * Math.sin(2 * Math.PI * i / ARC_STEPS)]).flat()

const transform = (m: Matrix, points: number[]) => Array.from({ length: points.length / 2 }, (_, i) => apply(m, points[2 * i], points[2 * i + 1])).flat()

const pxMatrix = (svg: SvgFile): Matrix => [svg.sx, 0, 0, svg.sy, -svg.viewBox[0] * svg.sx, -svg.viewBox[1] * svg.sy]

const leaves = (element: XmlElement | undefined, svg: SvgFile): XmlElement[] => {
    if (!element || svg.getStyle(element, 'display') === 'none')
        return []

    const children = childrenOf(element)
    return DRAWN.has(tagOf(element)) || SKIPPED.has(tagOf(element)) || !children.length ? [element] : children.flatMap(child => leaves(child, svg))
}

// UM ELEMENTO SVG EM PRIMITIVAS NO REFERENCIAL DA PLACA (mil): CÍRCULO E RETÂNGULO ALINHADO VIRAM FLASH, PATH PREENCHIDO VIRA REGIÃO COM TODOS OS SUBCAMINHOS, TEXTO VIRA REGIÃO COM OS GLIFOS (SPEC 03 §2.3)
export const toShapes = (svg: SvgFile, element: XmlElement, m: Matrix, library: Library): Shape[] => {
    const tag   = tagOf(element)
    const full  = multiply(m, multiply(pxMatrix(svg), svg.getMatrix(element)))
    const scale = Math.sqrt(Math.abs(full[0] * full[3] - full[1] * full[2]))
    const value = (name: string) => svg.length(element, name)
    const w     = svg.getStroke(element) * scale
    const fill  = svg.getStyle(element, 'fill') !== 'none'
    const cap   = svg.getStyle(element, 'stroke-linecap') ?? 'butt'
    const even  = Math.abs(Math.abs(full[0]) - Math.abs(full[3])) < 1e-9 && Math.abs(full[1]) < 1e-9 && Math.abs(full[2]) < 1e-9
    const path  = (points: number[], closed: boolean): Shape => ({ kind: 'path', points: transform(full, points), closed, w, fill: fill && closed, cap })

    if (tag === 'text') {
        const paths = getTextRuns(svg, element, library.fonts).flatMap(run => flattenPath(run.d).map(subpath => transform(full, subpath.points.flat())))
        return fill && paths.length ? [{ kind: 'region', paths, evenOdd: false }] : []
    }

    if (tag === 'path') {
        const subpaths = flattenPath(element.getAttribute('d') ?? '').map(subpath => ({ points: transform(full, subpath.points.flat()), closed: subpath.closed }))
        const region: Shape[] = fill && subpaths.length ? [{ kind: 'region', paths: subpaths.map(subpath => subpath.points), evenOdd: svg.getStyle(element, 'fill-rule') === 'evenodd' }] : []
        return [...region, ...w > 0 ? subpaths.map((subpath): Shape => ({ kind: 'path', points: subpath.points, closed: subpath.closed, w, fill: false, cap })) : []]
    }

    if (tag === 'circle' && even) {
        const [x, y] = apply(full, value('cx'), value('cy'))
        return [{ kind: 'circle', x, y, r: value('r') * scale, w, fill, drill: !NO_DRILL.has(element.getAttribute('drill') ?? '') }]
    }

    if (tag === 'circle' || tag === 'ellipse')
        return [path(sampleEllipse(value('cx'), value('cy'), tag === 'circle' ? value('r') : value('rx'), tag === 'circle' ? value('r') : value('ry')), true)]

    if (tag === 'rect' && !value('rx') && !value('ry') && Math.abs(full[1]) < 1e-9 && Math.abs(full[2]) < 1e-9) {
        const [x0, y0] = apply(full, value('x'), value('y'))
        const [x1, y1] = apply(full, value('x') + value('width'), value('y') + value('height'))
        return [{ kind: 'rect', x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0), w, fill }]
    }

    if (tag === 'rect') {
        const [x, y, width, height] = [value('x'), value('y'), value('width'), value('height')]
        return [path([x, y, x + width, y, x + width, y + height, x, y + height], true)]
    }

    if (tag === 'line')
        return [path([value('x1'), value('y1'), value('x2'), value('y2')], false)]

    return tag === 'polyline' || tag === 'polygon' ? [path((element.getAttribute('points') ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number), tag === 'polygon')] : []
}

// PRIMITIVA EM POLÍGONOS: TRAÇO POR OFFSET ABERTO COM A TERMINAÇÃO DO SVG, PREENCHIMENTO PELO PRÓPRIO CONTORNO (SPEC 03 §2.3)
export const toPolygons = (clipper: Clipper, shape: Shape, grow = 0): Paths => {
    const inner = shape.kind === 'circle' ? shape.r - shape.w / 2 - grow : 0

    if (shape.kind === 'region') {
        const filled = clipper.union(shape.paths, shape.evenOdd ? FILL.evenOdd : FILL.nonZero)
        return grow > 0 ? clipper.inflate(filled, grow) : filled
    }

    if (shape.kind === 'circle' && !shape.fill && inner > 0)
        return clipper.difference([sampleEllipse(shape.x, shape.y, shape.r + shape.w / 2 + grow, shape.r + shape.w / 2 + grow)], [sampleEllipse(shape.x, shape.y, inner, inner)])

    if (shape.kind === 'circle')
        return [sampleEllipse(shape.x, shape.y, shape.r + shape.w / 2 + grow, shape.r + shape.w / 2 + grow)]

    if (shape.kind === 'rect') {
        const box   = (pad: number) => [shape.x - pad, shape.y - pad, shape.x + shape.width + pad, shape.y - pad, shape.x + shape.width + pad, shape.y + shape.height + pad, shape.x - pad, shape.y + shape.height + pad]
        const inner = shape.w / 2 - grow
        const ring  = !shape.fill && 2 * inner < Math.min(shape.width, shape.height)

        if (!shape.fill && shape.w + 2 * grow <= 0)
            return []

        return ring ? clipper.difference([box(shape.w / 2 + grow)], [box(-inner)]) : [box(shape.w / 2 + grow)]
    }

    const end    = shape.closed ? END.joined : shape.cap === 'round' ? END.round : shape.cap === 'square' ? END.square : END.butt
    const filled = shape.fill && shape.closed ? clipper.union([shape.points]) : []
    const traced = shape.w + 2 * grow > 0 ? clipper.inflate([shape.points], shape.w / 2 + grow, JOIN.round, end) : []
    return clipper.union([...filled.flatMap(polygon => grow > 0 ? clipper.inflate([polygon], grow) : [polygon]), ...traced])
}

const boxOf = (points: number[]) => {
    const xs = points.filter((_, i) => i % 2 === 0)
    const ys = points.filter((_, i) => i % 2 === 1)
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

// CONTORNO DA PLACA: FOLHA boardoutline DO GRUPO board, SENÃO A DE MAIOR CAIXA; CADA SUBCAMINHO É UM CONTORNO E OS INTERNOS SÃO RECORTES (SPEC 03 §2.6)
const getOutline = (clipper: Clipper, svg: SvgFile, m: Matrix, library: Library) => {
    const group  = svg.findFirst('board') ?? svg.root ?? undefined
    const shapes = leaves(group, svg).filter(leaf => DRAWN.has(tagOf(leaf)) && tagOf(leaf) !== 'text')
    const solid  = (leaf: XmlElement) => {
        const found    = toShapes(svg, leaf, m, library)
        const regions  = found.flatMap(shape => shape.kind === 'region' ? shape.paths : [])
        const contours = regions.length ? regions : found.flatMap(shape => shape.kind === 'path' ? [shape.points] : shape.kind === 'region' ? [] : toPolygons(clipper, { ...shape, w: 0, fill: true }))
        return clipper.union(contours, FILL.evenOdd)
    }
    const chosen = shapes.find(leaf => leaf.getAttribute('id') === 'boardoutline') ?? shapes.map(leaf => [leaf, solid(leaf).flat()] as const).sort((a, b) => {
        const [ax0, ay0, ax1, ay1] = boxOf(a[1])
        const [bx0, by0, bx1, by1] = boxOf(b[1])
        return (bx1 - bx0) * (by1 - by0) - (ax1 - ax0) * (ay1 - ay0)
    })[0]?.[0]

    return chosen ? solid(chosen) : []
}

// GRUPO DA CAMADA NO SVG; THT SEM GRUPO copper1 USA O copper0 TAMBÉM EM CIMA (SPEC 01 §2.5)
const getGroup = (svg: SvgFile, part: Part, id: string) => svg.findFirst(id) ?? (id === 'copper1' && part.views.pcbView?.layers.includes('copper1') ? svg.findFirst('copper0') : undefined)

export const shapeBox = (shape: Shape) => {
    if (shape.kind === 'circle')
        return [shape.x - shape.r - shape.w / 2, shape.y - shape.r - shape.w / 2, shape.x + shape.r + shape.w / 2, shape.y + shape.r + shape.w / 2]

    if (shape.kind === 'rect')
        return [shape.x - shape.w / 2, shape.y - shape.w / 2, shape.x + shape.width + shape.w / 2, shape.y + shape.height + shape.w / 2]

    const pad = shape.kind === 'region' ? 0 : shape.w / 2
    return (shape.kind === 'region' ? shape.paths.flat() : shape.points).reduce((box, value, i) => i % 2 ? [box[0], Math.min(box[1], value - pad), box[2], Math.max(box[3], value + pad)] : [Math.min(box[0], value - pad), box[1], Math.max(box[2], value + pad), box[3]], [Infinity, Infinity, -Infinity, -Infinity])
}

export const solidOf = (shape: Shape): Shape => shape.kind === 'circle' || shape.kind === 'rect' ? { ...shape, fill: true } : shape

const boxArea = (box: number[]) => Math.max(0, box[2] - box[0]) * Math.max(0, box[3] - box[1])

// COBRE SEM CONECTOR QUE COBRE QUASE TODO UM PINO (OU METADE DELE, SENDO NO MÁXIMO O DOBRO) É PARTE DO PINO; O RESTO É SÓ OBSTÁCULO
const absorb = (conductors: Conductor[]) => {
    const pins = new Map<string, number[]>()

    conductors.filter(conductor => conductor.kind === 'pad' && conductor.key).forEach(conductor => {
        const box  = shapeBox(conductor.shape)
        const seen = pins.get(`${conductor.face}|${conductor.key}`) ?? box
        pins.set(`${conductor.face}|${conductor.key}`, [Math.min(seen[0], box[0]), Math.min(seen[1], box[1]), Math.max(seen[2], box[2]), Math.max(seen[3], box[3])])
    })

    return conductors.map(conductor => {
        const box   = shapeBox(conductor.shape)
        const found = conductor.kind !== 'copper' ? undefined : [...pins].find(([name, pin]) => {
            const shared = boxArea([Math.max(box[0], pin[0]), Math.max(box[1], pin[1]), Math.min(box[2], pin[2]), Math.min(box[3], pin[3])])
            return name.startsWith(`${conductor.face}|`) && (shared > 0.9 * boxArea(pin) || (shared > 0.5 * boxArea(pin) && 2 * boxArea(pin) > boxArea(box)))
        })
        return found ? { ...conductor, kind: 'pad' as const, key: found[0].slice(found[0].indexOf('|') + 1) } : conductor
    })
}

// ELEMENTOS DO SVG QUE PERTENCEM A CADA CONECTOR NA CAMADA: O ELEMENTO DO PINO E TODA A SUA SUBÁRVORE
const getOwners = (svg: SvgFile, part: Part, layer: string, modelIndex: string) => {
    const scope  = (part.views.pcbView?.layers.length ?? 0) > 1 ? layer : null
    const owners = new Map<XmlElement, string>()

    part.connectors.forEach(connector => (connector.views.pcbView ?? []).filter(pin => pin.layer === layer).forEach(pin => {
        const element = svg.find(pin.svgId, scope)

        if (element)
            walk(element, node => void owners.set(node, keyOf(modelIndex, connector.id)))
    }))

    return owners
}

// RÓTULO DA PEÇA NA SERIGRAFIA: LINHAS EM OCR-Fritzing-mono NO TAMANHO DO RÓTULO, NA FACE DA PEÇA (SPEC 03 §2.1)
const getLabelShape = (library: Library, placement: Placement, instance: Instance, frame: Matrix): Shape | null => {
    const label = instance.views.pcbView?.label
    const font  = library.fonts.get(LABEL_FONT)

    if (!label?.visible || !font)
        return null

    const size  = label.size * PX_PER_INCH / POINTS_PER_INCH
    const turn  = placement.getLabelMatrix(instance.modelIndex)
    const paths = placement.getLabelLines(instance.modelIndex).flatMap((line, i) => flattenPath(font.getPath(line, label.x, label.y + size * (i + 1), size)).map(subpath => transform(turn ? multiply(frame, turn) : frame, subpath.points.flat())))
    return paths.length ? { kind: 'region', paths, evenOdd: false } : null
}

// PLACA DAS OPERAÇÕES DE PCB: A ÚNICA DA VISTA OU, HAVENDO VÁRIAS, A ÚNICA SELECIONADA (SPEC 03 §2.1)
export const pickBoard = (doc: Doc, library: Library, placement: Placement, selection: string[]) => {
    const boards = Object.values(doc.instances).filter(instance => placement.isShown(instance) && BOARD_KINDS.includes(library.getPart(instance.moduleIdRef)?.kind ?? ''))
    const chosen = boards.length === 1 ? boards : boards.filter(instance => selection.includes(instance.modelIndex))
    return { host: chosen.length === 1 ? chosen[0] : null, boards }
}

// ARTE DA PCB NO REFERENCIAL DA PLACA (mil, ORIGEM NO CANTO SUPERIOR ESQUERDO): COBRE, PLANOS, PADS, SERIGRAFIA COM RÓTULOS, FUROS E POSIÇÕES (SPEC 03 §1–§2)
export const getArtwork = (doc: Doc, library: Library, clipper: Clipper, placement: Placement, selection: string[] = []): Artwork | null => {
    const shown  = Object.values(doc.instances).filter(instance => placement.isShown(instance))
    const host   = pickBoard(doc, library, placement, selection).host
    const hostM  = host ? placement.getMatrix(host.modelIndex) : null
    const hostS  = host ? library.getInstanceSvg(host, 'pcbView') : undefined

    if (!host || !hostM || !hostS)
        return null

    const scenePolygons = getOutline(clipper, hostS, hostM, library)
    const [bx0, by0, bx1, by1] = boxOf(scenePolygons.flat())
    const frame: Matrix        = [SCALE, 0, 0, SCALE, -bx0 * SCALE, -by0 * SCALE]
    const outline              = scenePolygons.map(polygon => transform(frame, polygon))
    const board: Board         = { instance: host, width: (bx1 - bx0) * SCALE, height: (by1 - by0) * SCALE, outline, layers: Number(library.getPart(host.moduleIdRef)?.properties.layers ?? host.properties.layers ?? 2) || 2, frame }
    const artwork: Artwork     = { board, copper: { top: [], bottom: [] }, pads: [], silk: { top: [], bottom: [] }, holes: [], placed: [], conductors: [], skipped: 0 }
    const inside               = (points: number[]) => {
        const [x0, y0, x1, y1] = boxOf(points)
        return x1 >= 0 && y1 >= 0 && x0 <= board.width && y0 <= board.height
    }

    for (const instance of shown) {
        const part  = library.getPart(instance.moduleIdRef)
        const m     = placement.getMatrix(instance.modelIndex)
        const svg   = library.getInstanceSvg(instance, 'pcbView')
        const state = instance.views.pcbView

        if (!part || !m || !svg?.root || !state || part.kind === 'wire')
            continue

        const full   = multiply(frame, m)
        const bounds = transform(full, [0, 0, svg.width, 0, svg.width, svg.height, 0, svg.height])
        const flip   = state.bottom && part.kind === 'part'    // PLANO, LOGO E VIA JÁ TRAZEM A FACE NO GRUPO DA CAMADA

        if (!inside(bounds))
            continue

        const first = artwork.conductors.length

        for (const [id, face, role] of FACES) {
            const side    = flip ? other(face) : face
            const drill   = id.startsWith('copper')
            const owners  = role === 'copper' ? getOwners(svg, part, id, instance.modelIndex) : new Map<XmlElement, string>()
            const blocked = part.kind === 'blocker'

            for (const leaf of leaves(getGroup(svg, part, id), svg)) {
                if (SKIPPED.has(tagOf(leaf))) {
                    artwork.skipped += 1
                    continue
                }

                if ((leaf.getAttribute('id') ?? '').endsWith('terminal') || isHoleMark(leaf))
                    continue

                for (const shape of toShapes(svg, leaf, full, library)) {
                    const hole = shape.kind === 'circle' && shape.w === 0 && !shape.fill
                    const key  = owners.get(leaf) ?? (part.kind === 'copperFill' ? keyOf(instance.modelIndex, 'connector0') : null)
                    const kind = blocked ? 'blocker' : part.kind === 'copperFill' ? 'fill' : owners.has(leaf) ? 'pad' : 'copper'

                    if (role === 'silk' && !blocked)
                        artwork.silk[side].push(shape)

                    if (role === 'copper' && !hole && !blocked)
                        artwork.copper[side].push(shape)

                    if (role === 'copper' && !hole)
                        artwork.conductors.push({ face: side, shape, owner: instance.modelIndex, key, kind })

                    if (role === 'copper' && !hole && !blocked && !['copperFill', 'logo'].includes(part.kind))
                        artwork.pads.push({ shape, face: side, smd: part.flippedSMD })

                    if (drill && !blocked && shape.kind === 'circle' && shape.drill && 2 * shape.r - shape.w > 0)
                        artwork.holes.push({ x: shape.x, y: shape.y, diameter: 2 * shape.r - shape.w, plated: shape.w > 0, connector: owners.has(leaf) })
                }
            }
        }

        artwork.conductors.splice(first, Infinity, ...absorb(artwork.conductors.slice(first)))
        const label = getLabelShape(library, placement, instance, frame)

        if (label)
            artwork.silk[flip ? 'bottom' : 'top'].push(label)

        if (part.connectors.length && !['copperFill', 'via', 'hole'].includes(part.kind) && !BOARD_KINDS.includes(part.kind)) {
            const [x0, y0, x1, y1] = boxOf(bounds)
            artwork.placed.push({ instance, x: (x0 + x1) / 2, y: board.height - (y0 + y1) / 2, rotation: (Math.atan2(m[1], m[0]) * 180 / Math.PI + 360) % 360, face: flip ? 'bottom' : 'top' })
        }
    }

    for (const wire of Object.values(doc.instances).filter(instance => instance.moduleIdRef === 'WireModuleID')) {
        const state = wire.views.pcbView

        if (!state?.geometry.line || !(state.geometry.wireFlags & WIRE_FLAGS.pcbView))
            continue

        const { x, y, line } = state.geometry
        const bezier         = state.wire?.bezier
        const points         = bezier ? flattenPath(`M${x + line[0]} ${y + line[1]}C${x + bezier[0]} ${y + bezier[1]} ${x + bezier[2]} ${y + bezier[3]} ${x + line[2]} ${y + line[3]}`)[0]?.points.flat() ?? [] : [x + line[0], y + line[1], x + line[2], y + line[3]]
        const shape: Shape   = { kind: 'path', points: transform(frame, points), closed: false, w: state.wire?.mils ?? TRACE_MILS, fill: false, cap: 'round' }
        const face: Face     = state.layer === 'copper0trace' ? 'bottom' : 'top'

        if (!inside(shape.points))
            continue

        artwork.copper[face].push(shape)
        artwork.conductors.push({ face, shape, owner: wire.modelIndex, key: keyOf(wire.modelIndex, 'connector0'), kind: 'trace' })
    }

    const unique = new Map(artwork.holes.map(hole => [`${hole.x.toFixed(2)}|${hole.y.toFixed(2)}|${hole.diameter.toFixed(2)}`, hole]))
    return { ...artwork, holes: [...unique.values()] }
}
