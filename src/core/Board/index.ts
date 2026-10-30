import { apply, isInside, type Point } from '../Geometry'
import { MIL_PER_INCH, toInches } from '../Units'
import type { Artwork, Shape } from '../Cam'
import type { Doc } from '../Document'
import type { Library } from '../Library'
import type { BundleFile } from '../Sketch'
import { splitKey } from '../Document'
import { mirrorSvg } from '../Generator'

export type Side    = 'top' | 'bottom'
export type PadForm = 'circle' | 'rect' | 'oval' | 'polygon'

// PAD NO REFERENCIAL DA PLACA (mil, Y PARA BAIXO); rotation EM GRAUS NO SENTIDO DA TELA; polygon EM VOLTA DO CENTRO, JÁ GIRADO; drill 0 = SMD (SPEC 09 §2)
export type BoardPad  = { name: string, x: number, y: number, width: number, height: number, rotation: number, form: PadForm, polygon: number[] | null, drill: number, plated: boolean, side: Side | 'both', net: string }
export type Stroke    = { side: Side, points: number[], closed: boolean, width: number, fill: boolean }
// courtyard E fab: TRAÇOS DE DOCUMENTAÇÃO (ÁREA DA PEÇA E DESENHO DE MONTAGEM), SÓ NA TELA
export type Footprint = { ref: string, value: string, name: string, x: number, y: number, rotation: number, side: Side, pads: BoardPad[], silk: Stroke[], courtyard?: Stroke[], fab?: Stroke[] }
export type Track     = { side: Side, a: Point, b: Point, width: number, net: string }
export type Via       = { x: number, y: number, diameter: number, drill: number, net: string }
// ÁREA DE COBRE: fill = POLÍGONOS JÁ PREENCHIDOS (PAR-ÍMPAR), hatch = TRAÇOS DE UM PREENCHIMENTO HACHURADO, pour = CONTORNO A DESPEJAR NA IMPORTAÇÃO
// (O EAGLE NÃO GRAVA O PREENCHIMENTO): FOLGA DAS OUTRAS NETS, DA BORDA DA PLACA, LARGURA MÍNIMA DO COBRE E ALÍVIO TÉRMICO NOS PADS DA NET
export type Pour      = { outline: number[], clearance: number, edge: number, width: number, thermal: boolean }
export type Zone      = { side: Side, net: string, fill: number[][], hatch: Stroke[], pour: Pour | null }
// COBRE DAS CAMADAS INTERNAS (layer 1 = In1, DE CIMA PARA BAIXO) E VIAS CEGAS OU ENTERRADAS (from/to: 0 = CIMA, copper - 1 = BAIXO); O DOCUMENTO SÓ TEM AS DUAS FACES,
// ENTÃO ISSO FICA GUARDADO NA PLACA IMPORTADA E VOLTA NA EXPORTAÇÃO, SEM EDIÇÃO
export type InnerTrack = Omit<Track, 'side'> & { layer: number }
export type InnerZone  = Omit<Zone, 'side' | 'hatch'> & { layer: number }
export type Span       = Via & { from: number, to: number }
export type Inner      = { tracks: InnerTrack[], zones: InnerZone[], vias: Span[] }
export type BoardData  = { outline: number[][], copper: number, footprints: Footprint[], tracks: Track[], vias: Via[], zones: Zone[], silk: Stroke[], inner: Inner, dropped: number }

export const emptyBoard = (): BoardData => ({ outline: [], copper: 2, footprints: [], tracks: [], vias: [], zones: [], silk: [], inner: { tracks: [], zones: [], vias: [] }, dropped: 0 })

// NA LEITURA OS ITENS INTERNOS VÊM COM O NÚMERO DE CAMADA DO ARQUIVO; AQUI VIRAM 0 = CIMA, 1… = INTERNAS NA ORDEM DA PILHA (AS QUE SÓ APARECEM NOS ITENS ENTRAM DEPOIS,
// PELO NÚMERO), copper - 1 = BAIXO; VIA DE CIMA A BAIXO VOLTA PARA AS VIAS COMUNS
export const settleInner = (board: BoardData, top: number, bottom: number, stack: number[]) => {
    const { tracks, zones, vias } = board.inner
    const used   = [...tracks, ...zones].map(item => item.layer).concat(vias.flatMap(via => [via.from, via.to])).filter(layer => layer !== top && layer !== bottom).sort((a, b) => a - b)
    const order  = [...new Set([...stack, ...used])]
    board.copper = Math.max(board.copper, order.length + 2)
    const index  = (layer: number) => layer === top ? 0 : layer === bottom ? board.copper - 1 : order.indexOf(layer) + 1
    const spans  = vias.map(via => ({ ...via, from: Math.min(index(via.from), index(via.to)), to: Math.max(index(via.from), index(via.to)) }))
    const through = (via: Span) => via.from === 0 && via.to === board.copper - 1
    board.vias.push(...spans.filter(through).map(({ x, y, diameter, drill, net }) => ({ x, y, diameter, drill, net })))
    board.inner  = { tracks: tracks.map(track => ({ ...track, layer: index(track.layer) })), zones: zones.map(zone => ({ ...zone, layer: index(zone.layer) })), vias: spans.filter(via => !through(via)) }
    return board
}

const ARC_STEP = 10    // GRAUS POR TRECHO AO ACHATAR ARCOS

export const rotate = ([x, y]: Point, degrees: number): Point => {
    const [c, s] = [Math.cos(degrees * Math.PI / 180), Math.sin(degrees * Math.PI / 180)]
    return [x * c - y * s, x * s + y * c]
}

// PONTO DA PLACA NO REFERENCIAL DO FOOTPRINT (ANTES DE GIRAR E, EMBAIXO, DE ESPELHAR) E DE VOLTA
export const toLocal = (footprint: Footprint, x: number, y: number): Point => {
    const [lx, ly] = rotate([x - footprint.x, y - footprint.y], -footprint.rotation)
    return [footprint.side === 'bottom' ? -lx : lx, ly]
}

export const toBoard = (footprint: Footprint, x: number, y: number): Point => {
    const [bx, by] = rotate([footprint.side === 'bottom' ? -x : x, y], footprint.rotation)
    return [footprint.x + bx, footprint.y + by]
}

// ARCO EM PONTOS (ÂNGULOS EM GRAUS NO REFERENCIAL DOS PONTOS, DE start A start + sweep)
export const arcPoints = (cx: number, cy: number, r: number, start: number, sweep: number) => {
    const steps = Math.max(1, Math.ceil(Math.abs(sweep) / ARC_STEP))
    return Array.from({ length: steps + 1 }, (_, i) => rotate([r, 0], start + sweep * i / steps)).flatMap(([x, y]) => [cx + x, cy + y])
}

// CONTORNO DE UM PAD (OVAL E RETÂNGULO GIRADO VIRAM POLÍGONO) EM VOLTA DO CENTRO
export const padPolygon = (pad: BoardPad) => {
    if (pad.polygon)
        return pad.polygon

    const [w, h] = [pad.width / 2, pad.height / 2]
    const local  = pad.form === 'circle' ? arcPoints(0, 0, w, 0, 360).slice(0, -2) :
                   pad.form === 'oval'   ? (w >= h ? [...arcPoints(w - h, 0, h, -90, 180), ...arcPoints(h - w, 0, h, 90, 180)] : [...arcPoints(0, h - w, w, 0, 180), ...arcPoints(0, w - h, w, 180, 180)]) :
                   [-w, -h, w, -h, w, h, -w, h]
    return Array.from({ length: local.length / 2 }, (_, i) => rotate([local[2 * i], local[2 * i + 1]], pad.rotation)).flat()
}

export const boxOfPoints = (points: number[]) => points.reduce((box, value, i) => i % 2 ? [box[0], Math.min(box[1], value), box[2], Math.max(box[3], value)] : [Math.min(box[0], value), box[1], Math.max(box[2], value), box[3]], [Infinity, Infinity, -Infinity, -Infinity])

export const netsOf = (board: BoardData) => [...new Set([...board.footprints.flatMap(footprint => footprint.pads.map(pad => pad.net)), ...board.tracks.map(track => track.net), ...board.vias.map(via => via.net), ...board.zones.map(zone => zone.net), ...[...board.inner.tracks, ...board.inner.zones, ...board.inner.vias].map(item => item.net)])].filter(Boolean).sort()

// TRILHA QUE TERMINA NO MEIO DE OUTRA DA MESMA FACE PARTE A OUTRA NAQUELE PONTO (JUNÇÃO EM T VIRA PONTAS COMUNS)
// ponytail: O(n²) nas trilhas; placas com dezenas de milhares de trechos pedem índice espacial
export const splitTees = (tracks: Track[], tolerance = 0.5) => {
    const ends = tracks.flatMap(track => [track.a, track.b].map(point => ({ point, side: track.side })))
    return tracks.flatMap(track => {
        const [dx, dy] = [track.b[0] - track.a[0], track.b[1] - track.a[1]]
        const length   = Math.hypot(dx, dy)
        const cuts     = ends.filter(end => end.side === track.side).map(({ point }) => {
            const t = ((point[0] - track.a[0]) * dx + (point[1] - track.a[1]) * dy) / (length * length)
            const d = Math.abs((point[0] - track.a[0]) * dy - (point[1] - track.a[1]) * dx) / length
            return length > 0 && d < tolerance && t * length > tolerance && (1 - t) * length > tolerance ? t : null
        }).filter((t): t is number => t !== null).sort((a, b) => a - b)
        const marks    = [0, ...new Set(cuts), 1].map((t): Point => [track.a[0] + dx * t, track.a[1] + dy * t])
        return marks.slice(1).map((b, i) => ({ ...track, a: marks[i], b }))
    })
}

// ---------- EXPORTAÇÃO: ARTE DA PCB → PLACA NEUTRA ----------

const circleOuter = (shape: Extract<Shape, { kind: 'circle' }>) => shape.fill ? 2 * shape.r + shape.w : 2 * shape.r + shape.w

const shapeBox = (shape: Shape) => shape.kind === 'circle' ? [shape.x - shape.r - shape.w / 2, shape.y - shape.r - shape.w / 2, shape.x + shape.r + shape.w / 2, shape.y + shape.r + shape.w / 2] :
                                   shape.kind === 'rect'   ? [shape.x - shape.w / 2, shape.y - shape.w / 2, shape.x + shape.width + shape.w / 2, shape.y + shape.height + shape.w / 2] :
                                   boxOfPoints(shape.kind === 'region' ? shape.paths.flat() : shape.points)

// FORMA DE COBRE DE UM CONECTOR COMO PAD: CÍRCULO (ANEL OU CHEIO), RETÂNGULO OU POLÍGONO PELO CONTORNO; CENTRO NO FURO QUANDO HÁ
const toPad = (shape: Shape, name: string, side: Side | 'both', hole: { x: number, y: number, diameter: number, plated: boolean } | undefined, net: string): BoardPad => {
    const drill = hole?.diameter ?? 0
    const base  = { name, rotation: 0, polygon: null, drill, plated: hole?.plated ?? true, side, net }

    if (shape.kind === 'circle')
        return { ...base, x: shape.x, y: shape.y, width: circleOuter(shape), height: circleOuter(shape), form: 'circle' }

    const [x0, y0, x1, y1] = shapeBox(shape)
    const [cx, cy]         = hole ? [hole.x, hole.y] : [(x0 + x1) / 2, (y0 + y1) / 2]

    if (shape.kind === 'rect')
        return { ...base, x: cx, y: cy, width: x1 - x0, height: y1 - y0, form: 'rect' }

    const outline = shape.kind === 'region' ? shape.paths.reduce((best, path) => path.length > best.length ? path : best, [] as number[]) : shape.points
    const form    = formOf(outline, x0, y0, x1, y1)
    return { ...base, x: cx, y: cy, width: x1 - x0, height: y1 - y0, form, polygon: form === 'polygon' ? outline.map((value, i) => value - (i % 2 ? cy : cx)) : null }
}

// CONTORNO ALINHADO QUE É UM RETÂNGULO OU UM OVAL (TODOS OS PONTOS NA BORDA, TOLERÂNCIA DE 0,5 mil) VIRA A FORMA SIMPLES, QUE TODO FORMATO TEM
const formOf = (points: number[], x0: number, y0: number, x1: number, y1: number): PadForm => {
    const [cx, cy, w, h] = [(x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0]
    const r              = Math.min(w, h) / 2
    const [ax, ay]       = w >= h ? [w / 2 - r, 0] : [0, h / 2 - r]
    const onOval         = (x: number, y: number) => {
        const t = Math.max(-1, Math.min(1, ((x - cx) * ax + (y - cy) * ay) / (ax * ax + ay * ay || 1)))
        return Math.abs(Math.hypot(x - cx - t * ax, y - cy - t * ay) - r) < 0.5
    }
    const onRect         = (x: number, y: number) => Math.min(Math.abs(x - x0), Math.abs(x - x1)) < 0.5 || Math.min(Math.abs(y - y0), Math.abs(y - y1)) < 0.5
    const all            = (test: (x: number, y: number) => boolean) => Array.from({ length: points.length / 2 }, (_, i) => test(points[2 * i], points[2 * i + 1])).every(Boolean)
    return points.length === 8 && all(onRect) ? 'rect' : points.length > 8 && all(onOval) ? 'oval' : 'polygon'
}

const toStroke = (shape: Shape, side: Side): Stroke[] => {
    if (shape.kind === 'circle')
        return [{ side, points: arcPoints(shape.x, shape.y, shape.r, 0, 360), closed: true, width: shape.w, fill: shape.fill }]

    if (shape.kind === 'rect')
        return [{ side, points: [shape.x, shape.y, shape.x + shape.width, shape.y, shape.x + shape.width, shape.y + shape.height, shape.x, shape.y + shape.height], closed: true, width: shape.w, fill: shape.fill }]

    return shape.kind === 'region' ? shape.paths.map(points => ({ side, points, closed: true, width: 0, fill: true })) : [{ side, points: shape.points, closed: shape.closed, width: shape.w, fill: shape.fill }]
}

const ELECTRICAL = ['resistance', 'capacitance', 'inductance', 'voltage', 'current', 'power']
const GROUNDED   = new Set(['gnd', 'vss', 'ground'])    // OS MESMOS NOMES DO "PREENCHER COM TERRA"
const EDGE       = 30                                   // mil, MARGEM MÍNIMA DO PREENCHIMENTO À BORDA (SPEC 03 §6.2)

// ANÉIS PAR-ÍMPAR EM GRUPOS [CONTORNO, ...FUROS]: UM ANEL É FURO QUANDO FICA DENTRO DE UM NÚMERO ÍMPAR DE OUTROS; O FURO VAI PARA O MENOR CONTORNO QUE O CONTÉM
export const nestRings = (rings: number[][]) => {
    const inside = (ring: number[], other: number[]) => ring !== other && isInside(other, ring[0], ring[1])
    const depth  = rings.map(ring => rings.filter(other => inside(ring, other)).length)
    const size   = (ring: number[]) => {
        const [x0, y0, x1, y1] = boxOfPoints(ring)
        return (x1 - x0) * (y1 - y0)
    }
    const outers = rings.filter((_, i) => depth[i] % 2 === 0)
    return outers.map(outer => [outer, ...rings.filter((ring, i) => depth[i] % 2 === 1 && outers.filter(candidate => inside(ring, candidate)).sort((a, b) => size(a) - size(b))[0] === outer)])
}

// PLACA NEUTRA A PARTIR DA ARTE DA PCB: CONTORNO, UM FOOTPRINT POR PEÇA (PADS DOS CONECTORES, FURO PELO CENTRO), VIAS, TRILHAS E SERIGRAFIA; netOf DÁ O NOME DA NET DE CADA CONECTOR (SPEC 09 §3)
export const fromArtwork = (artwork: Artwork, doc: Doc, library: Library, netOf: (key: string) => string): BoardData => {
    const height  = artwork.board.height
    // FURO DO PAD: PERTO DO CENTRO (ATÉ 1/4 DO MENOR LADO); UMA VIA DENTRO DE UM PAD SMD, FORA DO CENTRO, NÃO VIRA FURO DELE
    const holeAt  = (shape: Shape) => {
        const [x0, y0, x1, y1] = shapeBox(shape)
        const reach            = Math.min(x1 - x0, y1 - y0) / 4
        return artwork.holes.find(hole => Math.abs(hole.x - (x0 + x1) / 2) <= reach && Math.abs(hole.y - (y0 + y1) / 2) <= reach)
    }
    const padsOf  = (owner: string) => {
        const found = new Map<string, { shape: Shape, faces: Set<Side> }>()

        // A MAIOR FORMA DO CONECTOR É O PAD (O ANEL FINO EM VOLTA DO FURO DE UM PAD NÃO CIRCULAR FICA DE FORA)
        const area = (shape: Shape) => {
            const [x0, y0, x1, y1] = shapeBox(shape)
            return (x1 - x0) * (y1 - y0)
        }

        artwork.conductors.filter(conductor => conductor.owner === owner && conductor.kind === 'pad' && conductor.key).forEach(conductor => {
            const seen = found.get(conductor.key as string)
            found.set(conductor.key as string, { shape: seen && area(seen.shape) >= area(conductor.shape) ? seen.shape : conductor.shape, faces: (seen?.faces ?? new Set<Side>()).add(conductor.face) })
        })

        return found
    }
    const board   = emptyBoard()
    board.outline = artwork.board.outline
    board.copper  = artwork.board.layers

    artwork.placed.forEach(placed => {
        const instance = placed.instance
        const part     = library.getPart(instance.moduleIdRef)
        const merged   = { ...part?.properties, ...instance.properties }
        const pads     = [...padsOf(instance.modelIndex)].map(([key, { shape, faces }]) => {
            const name = part?.connectors.find(connector => connector.id === splitKey(key)[1])?.name ?? splitKey(key)[1]
            const hole = holeAt(shape)
            return toPad(shape, name, hole || faces.size > 1 ? 'both' : [...faces][0], hole, netOf(key))
        })

        const docs     = (layer: 'fab' | 'courtyard') => (artwork.docs ?? []).filter(item => item.owner === instance.modelIndex && item.layer === layer).flatMap(item => toStroke(item.shape, item.face))
        board.footprints.push({ ref: instance.title, value: ELECTRICAL.map(key => merged[key]).filter(Boolean).join(' ') || part?.title || '', name: merged.package || part?.title || instance.moduleIdRef, x: placed.x, y: height - placed.y, rotation: placed.rotation, side: placed.face, pads, silk: [], courtyard: docs('courtyard'), fab: docs('fab') })
    })

    Object.values(doc.instances).filter(instance => library.getPart(instance.moduleIdRef)?.kind === 'via').forEach(instance => padsOf(instance.modelIndex).forEach(({ shape }, key) => {
        const pad  = toPad(shape, '', 'both', holeAt(shape), netOf(key))
        board.vias.push({ x: pad.x, y: pad.y, diameter: Math.max(pad.width, pad.height), drill: pad.drill, net: pad.net })
    }))

    artwork.holes.filter(hole => !hole.connector).forEach((hole, i) => board.footprints.push({ ref: `H${i + 1}`, value: '', name: 'HOLE', x: hole.x, y: hole.y, rotation: 0, side: 'top', pads: [{ name: '', x: hole.x, y: hole.y, width: hole.diameter, height: hole.diameter, rotation: 0, form: 'circle', polygon: null, drill: hole.diameter, plated: hole.plated, side: 'both', net: '' }], silk: [] }))

    artwork.conductors.filter(conductor => conductor.kind === 'trace' && conductor.shape.kind === 'path').forEach(conductor => {
        const shape = conductor.shape as Extract<Shape, { kind: 'path' }>

        for (let i = 2; i < shape.points.length; i += 2)
            board.tracks.push({ side: conductor.face, a: [shape.points[i - 2], shape.points[i - 1]], b: [shape.points[i], shape.points[i + 1]], width: shape.w, net: netOf(conductor.key ?? '') })
    })

    board.silk  = (['top', 'bottom'] as Side[]).flatMap(side => artwork.silk[side].flatMap(shape => toStroke(shape, side)))
    board.zones = zonesOf(artwork, doc, library, netOf)
    return board
}

// ÁREAS DE COBRE: UMA POR ÁREA DESENHADA (COM O CONTORNO GRAVADO) OU POR FRAGMENTO DE PREENCHIMENTO (CONTORNO = O ANEL EXTERNO), COM O COBRE JÁ CALCULADO EM fill;
// A NET É A DO CONECTOR DO PREENCHIMENTO, A DO TERMINAL netKey (ÁREA IMPORTADA) OU, PELO NOME, A DA ÁREA DESENHADA (GND, U1.7) OU A DE TERRA NO "PREENCHER COM TERRA"
// ponytail: PREENCHIMENTO "COM COBRE" SAI SEM NET (O DOCUMENTO NÃO GUARDA A NET DELE). MELHORIA: A NET DA TRILHA QUE CAI DENTRO DO FRAGMENTO
const zonesOf = (artwork: Artwork, doc: Doc, library: Library, netOf: (key: string) => string): Zone[] => {
    const keepout = (toInches(doc.settings.pcbView?.GPG_Keepout || '0.01in') ?? 0.01) * MIL_PER_INCH
    const names   = (key: string) => {
        const [owner, id] = splitKey(key)
        const instance    = doc.instances[owner]
        const name        = (library.getPart(instance?.moduleIdRef ?? '')?.connectors.find(connector => connector.id === id)?.name ?? '').trim().toLowerCase()
        return [name, `${instance?.title ?? ''}.${name}`.toLowerCase()]
    }
    const named   = (wanted: Set<string>) => artwork.conductors.find(conductor => conductor.kind === 'pad' && conductor.key && names(conductor.key).some(name => wanted.has(name)))?.key ?? ''
    const groups  = new Map<string, { side: Side, net: string, outline: number[] | null, rings: number[][] }>()

    artwork.conductors.filter(conductor => conductor.kind === 'fill').forEach(conductor => {
        const instance = doc.instances[conductor.owner]
        const drawn    = instance?.properties.zone ? JSON.parse(instance.properties.zone) as { outline: number[], net: string } : null
        const rings    = conductor.shape.kind === 'region' ? conductor.shape.paths : conductor.shape.kind === 'path' ? [conductor.shape.points] : []
        const wanted   = new Set(drawn?.net ? [drawn.net.trim().toLowerCase()] : instance?.properties.fillType === 'ground' ? GROUNDED : [])
        const net      = netOf(conductor.key ?? '') || netOf(instance?.properties.netKey ?? '') || (wanted.size ? netOf(named(wanted)) : '')
        const key      = `${conductor.face}|${net}|${instance?.properties.zone ?? ''}`
        const outline  = drawn ? Array.from({ length: drawn.outline.length / 2 }, (_, i) => apply(artwork.board.frame, drawn.outline[2 * i], drawn.outline[2 * i + 1])).flat() : null

        if (rings.length)
            groups.set(key, { side: conductor.face, net, outline, rings: [...groups.get(key)?.rings ?? [], ...rings] })
    })

    // SEM CONTORNO DESENHADO, UMA ÁREA POR CONTORNO EXTERNO DE PRIMEIRO NÍVEL (A ILHA DENTRO DO FURO DE OUTRO FRAGMENTO FICA NA ÁREA DELE, SENÃO SERIA PREENCHIDA DUAS VEZES)
    return [...groups.values()].flatMap(({ side, net, outline, rings }) => {
        const pour  = (ring: number[]) => ({ outline: ring, clearance: keepout, edge: Math.max(EDGE, keepout), width: 0, thermal: net !== '' })
        const tops  = rings.filter(ring => !rings.some(other => other !== ring && isInside(other, ring[0], ring[1])))
        return outline ? [{ side, net, fill: rings, hatch: [], pour: pour(outline) }] : tops.map(top => ({ side, net, fill: rings.filter(ring => ring === top || isInside(top, ring[0], ring[1])), hatch: [], pour: pour(top) }))
    })
}

// ---------- IMPORTAÇÃO: FOOTPRINT → PEÇA DO FRITZING ----------

const COPPER = '#F7BD13'
const SILK   = '#ffffff'
const DOCS: ['courtyard' | 'fab', string][] = [['fab', '#b4b4b4'], ['courtyard', '#ff26e2']]    // CORES DA CAMADA DE MONTAGEM E DA ÁREA DA PEÇA (AS DO KICAD)
const MARGIN = 10    // mil EM VOLTA DO DESENHO DA PEÇA

const escapeXml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const hash = (text: string) => {
    let value = 5381

    for (let i = 0; i < text.length; i++)
        value = (value * 33 + text.charCodeAt(i)) >>> 0

    return value.toString(36)
}

const fixed = (value: number) => Number(value.toFixed(3))

const pathOf = (points: number[], closed: boolean) => `M${points.slice(0, 2).map(fixed).join(' ')}${Array.from({ length: points.length / 2 - 1 }, (_, i) => `L${fixed(points[2 * i + 2])} ${fixed(points[2 * i + 3])}`).join('')}${closed ? 'Z' : ''}`

// COBRE DE UM PAD NO SVG: ANEL PARA CÍRCULO PASSANTE, RETÂNGULO ALINHADO, POLÍGONO NO RESTO; PASSANTE NÃO CIRCULAR GANHA UM ANEL FINO NO FURO
const padSvg = (pad: BoardPad, x: number, y: number, id: string) => {
    const drilled = pad.drill > 0
    const square  = pad.rotation % 90 === 0 && pad.form === 'rect'
    const [w, h]  = pad.rotation % 180 === 0 ? [pad.width, pad.height] : [pad.height, pad.width]

    if (pad.form === 'circle' && drilled && pad.width > pad.drill)
        return `<circle id="${id}" cx="${fixed(x)}" cy="${fixed(y)}" r="${fixed((pad.width + pad.drill) / 4)}" fill="none" stroke="${COPPER}" stroke-width="${fixed((pad.width - pad.drill) / 2)}"/>`

    if (pad.form === 'circle' && !drilled)
        return `<circle id="${id}" cx="${fixed(x)}" cy="${fixed(y)}" r="${fixed(pad.width / 2)}" fill="${COPPER}" drill="0"/>`

    const copper = square ? `<rect x="${fixed(x - w / 2)}" y="${fixed(y - h / 2)}" width="${fixed(w)}" height="${fixed(h)}" fill="${COPPER}"/>` : `<path d="${pathOf(padPolygon(pad).map((value, i) => value + (i % 2 ? y : x)), true)}" fill="${COPPER}"/>`
    const ring   = drilled ? `<circle cx="${fixed(x)}" cy="${fixed(y)}" r="${fixed(pad.drill / 2 + 0.5)}" fill="none" stroke="${COPPER}" stroke-width="1"/>` : ''
    return `<g id="${id}">${copper}${ring}</g>`
}

const strokeSvg = (stroke: Stroke, dx: number, dy: number, color: string) => `<path d="${pathOf(stroke.points.map((value, i) => value + (i % 2 ? dy : dx)), stroke.closed)}" fill="${stroke.fill ? color : 'none'}" stroke="${stroke.width > 0 ? color : 'none'}" stroke-width="${fixed(stroke.width)}" stroke-linecap="round" stroke-linejoin="round"/>`

export type ImportedPart = { moduleId: string, offset: Point, pins: string[] }

// PEÇA DE UM FOOTPRINT JÁ POSICIONADO: PADS E SERIGRAFIA RELATIVOS À ORIGEM DO FOOTPRINT, GIRO E FACE EMBUTIDOS (A INSTÂNCIA ENTRA SEM TRANSFORMAÇÃO);
// ESQUEMÁTICO E PROTOBOARD PELOS SÍMBOLOS DIP GERADOS; FOOTPRINTS IGUAIS NA MESMA POSIÇÃO RELATIVA COMPARTILHAM A PEÇA (SPEC 09 §4)
export const footprintPart = (footprint: Footprint, files: Map<string, BundleFile>): ImportedPart => {
    const pads     = footprint.pads.filter(pad => pad.name || pad.plated)
    const holes    = footprint.pads.filter(pad => !pad.name && !pad.plated)
    const relative = (x: number, y: number): Point => [x - footprint.x, y - footprint.y]
    const drawn    = [...footprint.silk, ...footprint.courtyard ?? [], ...footprint.fab ?? []]
    const outline  = [...footprint.pads.flatMap(pad => padPolygon(pad).map((value, i) => value + (i % 2 ? pad.y : pad.x) - (i % 2 ? footprint.y : footprint.x))), ...drawn.flatMap(stroke => stroke.points.map((value, i) => value - (i % 2 ? footprint.y : footprint.x)))]
    const [x0, y0, x1, y1] = outline.length ? boxOfPoints(outline) : [-MARGIN, -MARGIN, MARGIN, MARGIN]
    const [ox, oy] = [x0 - MARGIN, y0 - MARGIN]
    const [w, h]   = [x1 - x0 + 2 * MARGIN, y1 - y0 + 2 * MARGIN]
    const smd      = pads.length > 0 && pads.every(pad => pad.drill === 0)
    const body     = pads.map((pad, i) => {
        const [px, py] = relative(pad.x, pad.y)
        return { svg: padSvg(pad, px - ox, py - oy, `connector${i}pin`), through: pad.drill > 0 }
    })
    const drilled  = holes.map(pad => {
        const [px, py] = relative(pad.x, pad.y)
        return `<circle cx="${fixed(px - ox)}" cy="${fixed(py - oy)}" r="${fixed(pad.drill / 2)}" fill="none" stroke-width="0"/>`
    })
    const silk     = footprint.silk.map(stroke => strokeSvg(stroke, -footprint.x - ox, -footprint.y - oy, SILK)).join('')
    const docs     = DOCS.filter(([layer]) => footprint[layer]?.length)
    const docsSvg  = docs.map(([layer, color]) => `<g id="${layer}">${footprint[layer]?.map(stroke => strokeSvg(stroke, -footprint.x - ox, -footprint.y - oy, color)).join('')}</g>\n`).join('')
    const flat     = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="${fixed(w) / 1000}in" height="${fixed(h) / 1000}in" viewBox="0 0 ${fixed(w)} ${fixed(h)}">\n<g id="silkscreen">${silk}</g>\n` +
                     (smd ? '' : `<g id="copper0">${body.filter(item => item.through).map(item => item.svg).join('')}${drilled.join('')}</g>\n`) +
                     `<g id="copper1">${body.map(item => item.svg).join('')}</g>\n${docsSvg}</svg>\n`
    // EMBAIXO O DESENHO JÁ VEM ESPELHADO NA PLACA: A PEÇA GUARDA A VISTA DE CIMA E A FACE DE BAIXO DA INSTÂNCIA ESPELHA DE VOLTA
    const svg      = footprint.side === 'bottom' ? mirrorSvg(flat, [0, 0, fixed(w)]) : flat
    const moduleId = `cm-import-${hash(svg + pads.map(pad => pad.name).join('|'))}`

    if (!files.has(`part.${moduleId}.fzp`)) {
        const n      = pads.length + pads.length % 2 || 2
        const bread  = `breadboard/generic_ic_dip_${n}_300mil_bread.svg`
        const layers = [...smd ? ['silkscreen', 'copper1'] : ['silkscreen', 'copper0', 'copper1'], ...docs.map(([layer]) => layer)]
        const view   = (name: string, image: string, ids: string[]) => `<${name}><layers image="${image}">${ids.map(id => `<layer layerId="${id}"/>`).join('')}</layers></${name}>`
        const pins   = pads.map((pad, i) => `<connector id="connector${i}" name="${escapeXml(pad.name || String(i + 1))}" type="${pad.drill > 0 ? 'male' : 'pad'}"><description>${escapeXml(pad.name)}</description><views><breadboardView><p layer="breadboard" svgId="connector${i}pin"/></breadboardView><schematicView><p layer="schematic" svgId="connector${i}pin" terminalId="connector${i}terminal"/></schematicView><pcbView>${(pad.drill > 0 && !smd ? ['copper0', 'copper1'] : ['copper1']).map(layer => `<p layer="${layer}" svgId="connector${i}pin"/>`).join('')}</pcbView></views></connector>`).join('\n')
        // PADS DE MESMO NOME NO FOOTPRINT SÃO O MESMO PINO (OS VÁRIOS GND DE UM CONECTOR): BUS INTERNO, COMO NAS PEÇAS DO FRITZING
        const named  = new Map<string, number[]>()
        pads.forEach((pad, i) => pad.name && named.set(pad.name, [...named.get(pad.name) ?? [], i]))
        const buses  = [...named].filter(([, members]) => members.length > 1).map(([name, members]) => `<bus id="${escapeXml(name)}">${members.map(i => `<nodeMember connectorId="connector${i}"/>`).join('')}</bus>`).join('')
        const fzp    = `<?xml version="1.0" encoding="UTF-8"?>\n<module moduleId="${moduleId}">\n<version>1</version><author>CircuitMaster</author><title>${escapeXml(footprint.name)}</title><label>${escapeXml(footprint.ref.replace(/\d+$/, '') || 'U')}</label>\n<properties><property name="family">Imported footprint</property><property name="package">${escapeXml(footprint.name)}</property></properties>\n<views>${view('iconView', bread, ['icon'])}${view('breadboardView', bread, ['breadboard'])}${view('schematicView', `schematic/generic_ic_dip_${n}_schem.svg`, ['schematic'])}${view('pcbView', `pcb/${moduleId}.svg`, layers)}</views>\n<connectors>${pins}</connectors>\n<buses>${buses}</buses>\n</module>\n`
        files.set(`part.${moduleId}.fzp`, { name: `part.${moduleId}.fzp`, text: fzp })
        files.set(`svg.pcb.${moduleId}.svg`, { name: `svg.pcb.${moduleId}.svg`, text: svg })
    }

    return { moduleId, offset: [ox, oy], pins: pads.map((_, i) => `connector${i}`) }
}

// PLACA COM O CONTORNO DO ARQUIVO (FUROS INTERNOS PELA REGRA PAR-ÍMPAR) E A SERIGRAFIA SOLTA; DEVOLVE O CANTO DO SVG NO REFERENCIAL DA PLACA NEUTRA
export const boardPart = (board: BoardData, files: Map<string, BundleFile>): ImportedPart => {
    const points           = board.outline.flat()
    const [x0, y0, x1, y1] = points.length ? boxOfPoints(points) : [0, 0, 1000, 1000]
    const [w, h]           = [x1 - x0, y1 - y0]
    const outline          = board.outline.length ? board.outline.map(polygon => pathOf(polygon.map((value, i) => value - (i % 2 ? y0 : x0)), true)).join('') : `M0 0L${w} 0L${w} ${h}L0 ${h}Z`
    const silk             = (side: Side) => board.silk.filter(stroke => stroke.side === side).map(stroke => strokeSvg(stroke, -x0, -y0, SILK)).join('')
    const svg              = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="${fixed(w) / 1000}in" height="${fixed(h) / 1000}in" viewBox="0 0 ${fixed(w)} ${fixed(h)}">\n<g id="board"><path id="boardoutline" d="${outline}" fill="#338040" fill-rule="evenodd" stroke="none"/></g>\n<g id="silkscreen">${silk('top')}</g>\n<g id="silkscreen0">${silk('bottom')}</g>\n</svg>\n`
    const moduleId         = `cm-import-board-${hash(svg)}`
    const fzp              = `<?xml version="1.0" encoding="UTF-8"?>\n<module moduleId="${moduleId}">\n<version>1</version><author>CircuitMaster</author><title>Custom PCB (imported)</title><label>PCB</label>\n<properties><property name="layers">2</property><property name="family">Plain Vanilla PCB</property></properties>\n<views><iconView><layers image="pcb/${moduleId}.svg"><layer layerId="icon"/></layers></iconView><breadboardView><layers image="pcb/${moduleId}.svg"><layer layerId="unknown"/></layers></breadboardView><schematicView><layers image="pcb/${moduleId}.svg"><layer layerId="unknown"/></layers></schematicView><pcbView><layers image="pcb/${moduleId}.svg"><layer layerId="board" sticky="true"/><layer layerId="silkscreen" sticky="true"/><layer layerId="silkscreen0" sticky="true"/></layers></pcbView></views>\n<connectors/>\n</module>\n`
    files.set(`part.${moduleId}.fzp`, { name: `part.${moduleId}.fzp`, text: fzp })
    files.set(`svg.pcb.${moduleId}.svg`, { name: `svg.pcb.${moduleId}.svg`, text: svg })
    return { moduleId, offset: [x0, y0], pins: [] }
}
