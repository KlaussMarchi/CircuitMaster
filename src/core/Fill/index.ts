import { area, END, FILL, JOIN, type Clipper, type Paths } from '../Clipper'
import { arcPoints, padPolygon, type BoardData, type BoardPad, type Stroke, type Zone } from '../Board'
import { shapeBox, toPolygons, type Artwork, type Conductor, type Face } from '../Cam'
import { isInside } from '../Geometry'

export { isInside }

export type FillMode     = 'ground' | 'plain'
export type FillFragment = { face: Face, layer: string, x: number, y: number, svg: string, polygons: Paths }

const EDGE_MARGIN   = 30                     // mil, FAIXA MÍNIMA LIVRE NA BORDA DA PLACA
const MIN_SIDE      = 50                     // mil, FRAGMENTO MENOR NOS DOIS EIXOS É DESCARTADO
const MIN_THICKNESS = 1000 / 90              // mil, FRAGMENTO MAIS FINO QUE 1 px NUM EIXO É DESCARTADO
const UNITS         = 30                     // UNIDADES DO viewBox POR mil (30.000 POR POLEGADA)
const PAD_DIAMETER  = 75                     // mil, CONECTOR DO PREENCHIMENTO
const PAD_EROSION   = 1.25 * PAD_DIAMETER / 2
const COLORS: Record<Face, [string, string]> = { bottom: ['groundplane', '#f9a435'], top: ['groundplane1', '#fdde68'] }

const boxOf = (paths: Paths) => paths.flat().reduce((box, value, i) => i % 2 ? [box[0], Math.min(box[1], value), box[2], Math.max(box[3], value)] : [Math.min(box[0], value), box[1], Math.max(box[2], value), box[3]], [Infinity, Infinity, -Infinity, -Infinity])


// CONTORNOS EXTERNOS (ÁREA POSITIVA) COM OS FUROS QUE CONTÊM; ILHAS DENTRO DE FUROS VIRAM FRAGMENTOS PRÓPRIOS
const splitFragments = (polygons: Paths) => {
    const outers = polygons.filter(polygon => area(polygon) > 0)
    const holes  = polygons.filter(polygon => area(polygon) < 0)
    const owner  = (hole: number[]) => outers.filter(outer => isInside(outer, hole[0], hole[1])).sort((a, b) => area(a) - area(b))[0]
    return outers.map(outer => [outer, ...holes.filter(hole => owner(hole) === outer)])
}

// RAIOS DO ALÍVIO TÉRMICO: DOIS VERTICAIS E DOIS HORIZONTAIS DA METADE DO PAD ATÉ ALÉM DA FOLGA (SPEC 03 §6.2, PASSO 5)
const spokes = (box: number[], keepout: number): Paths => {
    const [cx, cy] = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]
    const [a, b]   = [(box[2] - box[0]) / 2, (box[3] - box[1]) / 2]
    const t        = Math.max(Math.min(a, b) / 3, keepout / 2)
    const rect     = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1]
    return [rect(cx - t, cy - b - keepout, cx + t, cy - b / 2), rect(cx - t, cy + b / 2, cx + t, cy + b + keepout), rect(cx + a / 2, cy - t, cx + a + keepout, cy + t), rect(cx - a - keepout, cy - t, cx - a / 2, cy + t)]
}

// SVG DO FRAGMENTO EM 1/30.000 in A PARTIR DO CANTO, COM O CONECTOR DE 75 mil NO VÉRTICE DE MENOR x + y DO FRAGMENTO ERODIDO (SPEC 03 §6.2, PASSOS 9–10)
const fragmentSvg = (clipper: Clipper, fragment: Paths, face: Face) => {
    const [x0, y0, x1, y1] = boxOf(fragment)
    const [layer, color]   = COLORS[face]
    const units            = (value: number, origin: number) => Math.round((value - origin) * UNITS)
    const d                = fragment.map(polygon => `M${Array.from({ length: polygon.length / 2 }, (_, i) => `${units(polygon[2 * i], x0)},${units(polygon[2 * i + 1], y0)}`).join(' L')} Z`).join(' ')
    const eroded           = clipper.inflate(fragment, -PAD_EROSION)
    const corner           = eroded.flatMap(polygon => Array.from({ length: polygon.length / 2 }, (_, i) => [polygon[2 * i], polygon[2 * i + 1]])).sort((a, b) => a[0] + a[1] - b[0] - b[1])[0]
    const pad              = corner ? `<g id='connector0pad'><circle cx='${units(corner[0], x0)}' cy='${units(corner[1], y0)}' r='${PAD_DIAMETER / 2 * UNITS}' fill='${color}' stroke='none'/></g>` : ''
    const [w, h]           = [x1 - x0, y1 - y0]
    return { x: x0, y: y0, svg: `<svg xmlns='http://www.w3.org/2000/svg' width='${(w / 1000).toFixed(5)}in' height='${(h / 1000).toFixed(5)}in' viewBox='0 0 ${Math.round(w * UNITS)} ${Math.round(h * UNITS)}' >\n<g id='${layer}'>\n<path fill='${color}' stroke='none' stroke-width='0' d='${d}'/>\n${pad}\n</g>\n</svg>` }
}

const toFragments = (clipper: Clipper, fragments: Paths[], face: Face): FillFragment[] => fragments.map(fragment => ({ face, layer: COLORS[face][0], ...fragmentSvg(clipper, fragment, face), polygons: fragment }))

// PREENCHIMENTO DE COBRE DE UMA FACE: N = P \ (C' ∪ E), F = abertura(N ⊖ k) \ T COM ALÍVIO TÉRMICO NAS SEMENTES DE TERRA (SPEC 03 §6.2); COM limit (ÁREA DESENHADA,
// mil DA PLACA), P VIRA P ∩ limit
export const getFill = (clipper: Clipper, artwork: Artwork, face: Face, mode: FillMode, grounded: (conductor: Conductor) => boolean, keepout: number, limit: number[] | null = null): FillFragment[] => {
    const { board } = artwork
    const seeds     = mode === 'ground' ? artwork.conductors.filter(conductor => conductor.face === face && conductor.kind === 'pad' && grounded(conductor)) : []
    const copper    = clipper.union(artwork.conductors.filter(conductor => conductor.face === face && !(mode === 'ground' && conductor.kind === 'trace' && grounded(conductor))).flatMap(conductor => toPolygons(clipper, conductor.kind === 'blocker' && (conductor.shape.kind === 'rect' || conductor.shape.kind === 'circle') ? { ...conductor.shape, fill: true } : conductor.shape)))
    const zones     = seeds.map(seed => shapeBox(seed.shape))
    const rects     = zones.map(([x0, y0, x1, y1]) => [x0, y0, x1, y0, x1, y1, x0, y1])
    const ground    = clipper.intersection(copper, rects)
    const others    = clipper.difference(copper, rects)
    const edge      = keepout < EDGE_MARGIN ? clipper.inflate(board.outline, EDGE_MARGIN - keepout, JOIN.round, END.joined) : []
    const free      = clipper.difference(limit ? clipper.intersection(board.outline, [limit]) : board.outline, clipper.union([...others, ...edge]))
    const relief    = clipper.difference(clipper.inflate(ground, keepout), zones.flatMap(zone => spokes(zone, keepout)))
    const rho       = Math.max(keepout / 4, 1)
    const opened    = clipper.inflate(clipper.inflate(clipper.inflate(free, -keepout), -rho), rho)
    const filled    = clipper.difference(opened, relief)
    const fragments = splitFragments(filled).filter(fragment => {
        const [x0, y0, x1, y1] = boxOf(fragment)
        const [dx, dy]         = [x1 - x0, y1 - y0]
        return !(dx < MIN_SIDE && dy < MIN_SIDE) && dx >= MIN_THICKNESS && dy >= MIN_THICKNESS
    })
    return toFragments(clipper, fragments, face)
}

// TRAÇOS ENGROSSADOS PELA METADE DA LARGURA (PONTAS REDONDAS), UMA CHAMADA POR LARGURA
const strokesOf = (clipper: Clipper, strokes: Stroke[]) => {
    const widths = new Map<string, Stroke[]>()
    strokes.filter(stroke => stroke.width > 0).forEach(stroke => widths.set(`${stroke.width}|${stroke.closed}`, [...widths.get(`${stroke.width}|${stroke.closed}`) ?? [], stroke]))
    return clipper.union([...widths.values()].flatMap(group => clipper.inflate(group.map(stroke => stroke.points), group[0].width / 2, JOIN.round, group[0].closed ? END.joined : END.round)))
}

// COBRE DE UMA ÁREA IMPORTADA, EM FRAGMENTOS: O PREENCHIMENTO GRAVADO E O HACHURADO ENGROSSADO; COM pour (EAGLE), O DESPEJO
// abertura((CONTORNO ∩ PLACA ⊖ edge) \ (COBRE DAS OUTRAS NETS ⊕ clearance), width / 2) \ ALÍVIO TÉRMICO DOS PADS DA NET, SEM AS ILHAS QUE NÃO TOCAM COBRE DA NET (SPEC 09 §4)
// ponytail: RAIOS DO ALÍVIO COMO OS DO PREENCHIMENTO DO FRITZING (NÃO OS DO EAGLE) E CONTORNO SEM O TRAÇO DE width EM VOLTA (A BORDA FICA MEIA LARGURA PARA DENTRO)
export const getZoneFill = (clipper: Clipper, zone: Zone, board: BoardData): FillFragment[] => {
    const { pour } = zone

    if (!pour)
        return toFragments(clipper, splitFragments(clipper.union([...clipper.union(zone.fill, FILL.evenOdd), ...strokesOf(clipper, zone.hatch)])), zone.side)

    const faced   = <T extends { side: string },>(items: T[]) => items.filter(item => item.side === zone.side || item.side === 'both')
    const pads    = faced(board.footprints.flatMap(footprint => footprint.pads))
    const shape   = (pad: BoardPad) => padPolygon(pad).map((value, i) => value + (i % 2 ? pad.y : pad.x))
    // COBRE DA FACE DA PRÓPRIA NET (mine) OU DAS OUTRAS
    const copper  = (mine: boolean) => clipper.union([
        ...pads.filter(pad => (pad.net === zone.net) === mine).map(shape),
        ...board.vias.filter(via => (via.net === zone.net) === mine).map(via => arcPoints(via.x, via.y, via.diameter / 2, 0, 360)),
        ...strokesOf(clipper, faced(board.tracks).filter(track => (track.net === zone.net) === mine).map(track => ({ side: track.side, points: [...track.a, ...track.b], closed: false, width: track.width, fill: false })))
    ])
    const own     = pour.thermal ? pads.filter(pad => pad.net === zone.net) : []
    const rays    = own.flatMap(pad => spokes(boxOf([shape(pad)]), pour.clearance))
    const relief  = clipper.difference(clipper.inflate(clipper.union(own.map(shape)), pour.clearance), rays)
    const area    = clipper.intersection(clipper.inflate(clipper.union(board.outline, FILL.evenOdd), -pour.edge), [pour.outline])
    const free    = clipper.difference(area, clipper.inflate(copper(false), pour.clearance))
    const cut     = clipper.difference(free, relief)
    const poured  = pour.width > 0 ? clipper.inflate(clipper.inflate(cut, -pour.width / 2), pour.width / 2) : cut
    const anchor  = clipper.union([...copper(true), ...rays])    // O PAD COM ALÍVIO SÓ TOCA A ÁREA PELOS RAIOS
    return toFragments(clipper, splitFragments(poured).filter(fragment => clipper.intersection(fragment, anchor).length > 0), zone.side)
}
