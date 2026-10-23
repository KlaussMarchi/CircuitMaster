import { childOf, childrenOf, headOf, isList, readSexpr, unquote, type Sexpr } from '../Sexpr'
import type { Box, Point } from '../Geometry'
import { MIL, arcPath, at, boxOf, corners, num, svgOf } from '../KicadDraw'

export type KicadPad       = { number: string, type: string, shape: string, at: Point, angle: number, size: Point, drill: Point | null, offset: Point, layers: string[], ratio: number }
export type KicadFootprint = { name: string, description: string, tags: string, pads: KicadPad[], graphics: Sexpr[][] }

const COPPER  = '#F7BD13'
const SILK    = '#ffffff'
const FAB     = '#404040'
const METAL   = '#9a9a9a'
const MARGIN  = 20     // MIL EM VOLTA DO DESENHO
const DRAWN   = ['F.SilkS', 'B.SilkS', 'F.Fab', 'F.CrtYd']

// PAD DO FOOTPRINT: NÚMERO, TIPO (thru_hole, smd, np_thru_hole, connect), FORMA, CENTRO, GIRO, TAMANHO, FURO (OVAL: LARGURA E ALTURA) E CAMADAS
const readPad = (node: Sexpr[]): KicadPad => {
    const place  = childOf(node, 'at')
    const drill  = childOf(node, 'drill')
    const sizes  = (drill ?? []).slice(drill?.[1] === 'oval' ? 2 : 1).filter((item): item is string => typeof item === 'string').map(Number)
    const offset = at(childOf(drill, 'offset'))
    return {
        number: unquote(node[1]),
        type: String(node[2]),
        shape: String(node[3]),
        at: at(place),
        angle: num(place?.[3]) || 0,
        size: at(childOf(node, 'size')),
        drill: sizes[0] > 0 ? [sizes[0], sizes[1] ?? sizes[0]] : null,
        offset: offset.every(Number.isFinite) ? offset : [0, 0],
        layers: (childOf(node, 'layers') ?? []).slice(1).map(unquote),
        ratio: num(childOf(node, 'roundrect_rratio')?.[1]) || 0
    }
}

// FOOTPRINT DE UM .kicad_mod (TAMBÉM O module DOS ARQUIVOS ANTIGOS)
export const readFootprint = (text: string): KicadFootprint | null => {
    const [node] = readSexpr(text) ?? []

    if (!isList(node) || !['footprint', 'module'].includes(headOf(node)))
        return null

    return { name: unquote(node[1]), description: unquote(childOf(node, 'descr')?.[1]), tags: unquote(childOf(node, 'tags')?.[1]), pads: childrenOf(node, 'pad').map(readPad), graphics: node.filter((item): item is Sexpr[] => isList(item) && headOf(item).startsWith('fp_')) }
}

export const isTop = (pad: KicadPad) => pad.layers.some(layer => layer === 'F.Cu' || layer === '*.Cu')

export const isPlated = (pad: KicadPad) => pad.type === 'thru_hole' && pad.drill !== null

const wired = (pad: KicadPad) => pad.number !== '' && isTop(pad) && pad.type !== 'np_thru_hole'

// PADS QUE VIRAM CONECTOR: OS DE COBRE NA FACE DE CIMA (OU PASSANTES) COM NÚMERO; O PRIMEIRO DE CADA NÚMERO
export const padsOf = (footprint: KicadFootprint) => footprint.pads.filter((pad, i, list) => wired(pad) && list.findIndex(other => wired(other) && other.number === pad.number) === i)

const rotate = ([x, y]: Point, degrees: number): Point => {
    const angle = -degrees * Math.PI / 180    // GIRO DO KICAD É ANTI-HORÁRIO NA TELA, COM y PARA BAIXO
    return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)]
}

const centerOf = (pad: KicadPad): Point => {
    const shift = rotate(pad.offset, pad.angle)
    return [pad.at[0] + shift[0], pad.at[1] + shift[1]]
}

// CAIXA DO PAD EM mm, COM O GIRO
export const padBox = (pad: KicadPad): Box => {
    const [cx, cy] = centerOf(pad)
    const [w, h]   = pad.size
    const ends     = pad.shape === 'circle' ? [[-w / 2, -w / 2], [w / 2, w / 2]] as Point[] : ([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as Point[]).map(point => rotate(point, pad.angle))
    return boxOf(ends.map(([x, y]) => [cx + x, cy + y]))
}

const strokeOf = (node: Sexpr[]) => num(childOf(childOf(node, 'stroke'), 'width')?.[1]) || num(childOf(node, 'width')?.[1]) || 0.12

const filled = (node: Sexpr[]) => ['solid', 'yes'].includes(unquote(childOf(node, 'fill')?.[1]))

// DESENHO DE UM fp_line, fp_rect, fp_circle, fp_arc OU fp_poly EM mm: CAIXA E O SVG NUMA COR, COM AS COORDENADAS JÁ DESLOCADAS
const drawGraphic = (node: Sexpr[], place: (point: Point) => Point, color: string): [Box, string] | null => {
    const kind  = headOf(node)
    const width = strokeOf(node)
    const fill  = filled(node) ? color : 'none'
    const style = `fill="${fill}" stroke="${color}" stroke-width="${width * MIL}" stroke-linecap="round" stroke-linejoin="round"`
    const point = (key: string) => at(childOf(node, key))

    if (kind === 'fp_line') {
        const [a, b] = [place(point('start')), place(point('end'))]
        return [boxOf([point('start'), point('end')], width / 2), `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" ${style}/>`]
    }

    if (kind === 'fp_rect') {
        const box = boxOf([point('start'), point('end')])
        const [a, b] = [place([box[0], box[1]]), place([box[2], box[3]])]
        return [boxOf(corners(box), width / 2), `<rect x="${a[0]}" y="${a[1]}" width="${b[0] - a[0]}" height="${b[1] - a[1]}" ${style}/>`]
    }

    if (kind === 'fp_circle') {
        const [c, e] = [point('center'), point('end')]
        const r      = Math.hypot(e[0] - c[0], e[1] - c[1])
        const p      = place(c)
        return [boxOf([c], r + width / 2), `<circle cx="${p[0]}" cy="${p[1]}" r="${r * MIL}" ${style}/>`]
    }

    if (kind === 'fp_arc') {
        const ends = ['start', 'mid', 'end'].map(point)
        const [a, m, b] = ends.map(place)
        return [boxOf(ends, width / 2), `<path d="${arcPath(a, m, b)}" ${style.replace(/fill="[^"]*"/, 'fill="none"')}/>`]
    }

    if (kind === 'fp_poly') {
        const points = childrenOf(childOf(node, 'pts'), 'xy').map(item => at(item))
        return points.length ? [boxOf(points, width / 2), `<path d="M${points.map(item => place(item).join(' ')).join('L')}Z" ${style}/>`] : null
    }

    return null
}

const layerOf = (node: Sexpr[]) => unquote(childOf(node, 'layer')?.[1])

// CORPO DO PAD: CÍRCULO, OU RETÂNGULO COM CANTO (oval E roundrect) GIRADO; trapezoid E custom FICAM NO RETÂNGULO DO TAMANHO
const padShape = (pad: KicadPad, place: (point: Point) => Point, color: string, id = '') => {
    const [x, y] = place(centerOf(pad))
    const [w, h] = pad.size.map(value => value * MIL)
    const corner = pad.shape === 'oval' ? Math.min(w, h) / 2 : pad.shape === 'roundrect' ? pad.ratio * Math.min(w, h) : 0
    const turn   = pad.angle ? ` transform="rotate(${-pad.angle} ${x} ${y})"` : ''
    return pad.shape === 'circle' ? `<circle${id} cx="${x}" cy="${y}" r="${w / 2}" fill="${color}"/>` : `<rect${id} x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${corner}" ry="${corner}" fill="${color}"${turn}/>`
}

// FURO METALIZADO COMO O FRITZING DESENHA: ANEL COM DIÂMETRO DE FURO 2r − largura, DENTRO DA MENOR MEDIDA DO PAD (O CAM TIRA O FURO DAÍ, SPEC 03 §2.3)
const ring = (pad: KicadPad, place: (point: Point) => Point, id = '') => {
    const [x, y] = place(pad.at)
    const drill  = Math.min(...pad.drill as Point) * MIL
    const outer  = Math.min(...pad.size) * MIL
    const width  = Math.max(0, (outer - drill) / 2)
    return `<circle${id} cx="${x}" cy="${y}" r="${(drill + width) / 2}" fill="none" stroke="${width ? COPPER : 'none'}" stroke-width="${width}"/>`
}

// QUADRO DO DESENHO EM mm: PADS, SERIGRAFIA, FABRICAÇÃO E CERCA
const frameOf = (footprint: KicadFootprint) => {
    const boxes = [...footprint.pads.map(padBox), ...footprint.graphics.filter(node => DRAWN.includes(layerOf(node))).flatMap(node => drawGraphic(node, point => point, '')?.slice(0, 1) as Box[] ?? [])]
    return boxOf(boxes.flatMap(corners), MARGIN / MIL)
}

const placer = (frame: Box) => ([x, y]: Point): Point => [(x - frame[0]) * MIL, (y - frame[1]) * MIL]

// PCB DA PEÇA NO PADRÃO DO FRITZING (mil): SERIGRAFIA DE CIMA E DE BAIXO, COBRE DE CIMA COM OS SMD E, DENTRO DELE, O DE BAIXO COM OS PASSANTES (OS DOIS ACHAM O MESMO PAD); ids PELO NÚMERO DO PAD (SPEC 08 §3)
export const footprintSvg = (footprint: KicadFootprint, ids: Map<string, number>) => {
    const frame  = frameOf(footprint)
    const place  = placer(frame)
    const owned  = new Set(padsOf(footprint).filter(pad => ids.has(pad.number)))
    const silk   = (layer: string) => footprint.graphics.filter(node => layerOf(node) === layer).map(node => drawGraphic(node, place, SILK)?.[1] ?? '').join('')
    const smd    = footprint.pads.filter(pad => !pad.drill && isTop(pad) && pad.type !== 'np_thru_hole').map(pad => padShape(pad, place, COPPER, owned.has(pad) ? ` id="connector${ids.get(pad.number)}pad"` : ''))
    const tht    = footprint.pads.filter(isPlated).map(pad => {
        const id = owned.has(pad) ? ` id="connector${ids.get(pad.number)}pin"` : ''
        return pad.shape === 'circle' && !pad.offset.some(Boolean) ? ring(pad, place, id) : `<g${id}>${padShape(pad, place, COPPER)}${ring(pad, place)}</g>`
    })
    const holes  = footprint.pads.filter(pad => pad.type === 'np_thru_hole' && pad.drill).map(pad => ring({ ...pad, size: [0, 0] }, place))
    const [w, h] = [(frame[2] - frame[0]) * MIL, (frame[3] - frame[1]) * MIL]
    return svgOf(w, h, `<g id="silkscreen">${silk('F.SilkS')}</g>\n<g id="silkscreen0">${silk('B.SilkS')}</g>\n<g id="copper1">${smd.join('')}<g id="copper0">${tht.join('')}${holes.join('')}</g></g>`)
}

// PROTOBOARD DA PEÇA: O CONTORNO DE FABRICAÇÃO (F.Fab) E OS PADS EM METAL, CADA UM O connectorNpin NO MESMO LUGAR DA PCB (AS PEÇAS PASSANTES DE 0,1 in ENCAIXAM NOS FUROS)
export const breadboardSvg = (footprint: KicadFootprint, ids: Map<string, number>) => {
    const frame  = frameOf(footprint)
    const place  = placer(frame)
    const owned  = new Set(padsOf(footprint).filter(pad => ids.has(pad.number)))
    const fab    = footprint.graphics.filter(node => layerOf(node) === 'F.Fab').map(node => drawGraphic(node, place, FAB)?.[1] ?? '').join('')
    const pads   = footprint.pads.filter(pad => isTop(pad) && pad.type !== 'np_thru_hole').map(pad => padShape(pad, place, METAL, owned.has(pad) ? ` id="connector${ids.get(pad.number)}pin"` : ''))
    const [w, h] = [(frame[2] - frame[0]) * MIL, (frame[3] - frame[1]) * MIL]
    return svgOf(w, h, `<g id="breadboard">${fab}${pads.join('')}</g>`)
}
