import { arcPoints, emptyBoard, netsOf, rotate, settleInner, type BoardData, type BoardPad, type Footprint, type InnerZone, type PadForm, type Side, type Stroke } from '../Board'
import type { Point } from '../Geometry'
import { isList, prettify, quote, readSexpr, unquote, type Sexpr } from '../Sexpr'

// LEITURA E ESCRITA DO .kicad_pcb (S-EXPRESSION, mm, Y PARA BAIXO, ÂNGULOS ANTI-HORÁRIOS NA TELA) (SPEC 09 §5)

type Node = string | Node[]

const MIL_PER_MM = 1000 / 25.4

// ÁRVORE DO core/Sexpr COM OS TEXTOS JÁ SEM ASPAS E ESCAPES; TEXTO MAL FORMADO VIRA LISTA VAZIA
const parseSexpr = (text: string): Node => {
    const plain = (node: Sexpr): Node => isList(node) ? node.map(plain) : unquote(node)
    return plain(readSexpr(text)?.[0] ?? [])
}

const list = (node: Node | undefined): Node[] => Array.isArray(node) ? node : []
const children = (node: Node | undefined, name: string) => list(node).filter((child): child is Node[] => Array.isArray(child) && child[0] === name)
const child = (node: Node | undefined, name: string) => children(node, name)[0]
const num = (node: Node | undefined, index: number, fallback = 0) => {
    const value = Number(list(node)[index])
    return Number.isFinite(value) ? value : fallback
}
const mils = (value: number) => value * MIL_PER_MM
const pointOf = (node: Node | undefined): Point => [mils(num(node, 1)), mils(num(node, 2))]

const SILK: Record<string, Side> = { 'F.SilkS': 'top', 'B.SilkS': 'bottom' }
const COPPER: Record<string, Side> = { 'F.Cu': 'top', 'B.Cu': 'bottom' }
const DOCS: Record<string, ['courtyard' | 'fab', Side]> = { 'F.CrtYd': ['courtyard', 'top'], 'B.CrtYd': ['courtyard', 'bottom'], 'F.Fab': ['fab', 'top'], 'B.Fab': ['fab', 'bottom'] }

const layerOf = (node: Node | undefined) => String(list(child(node, 'layer'))[1] ?? '')
// NÚMERO DA CAMADA DE COBRE NA NUMERAÇÃO DO KICAD (F.Cu = 0, InN.Cu = N, B.Cu = 31); innerOf DÁ 0 PARA O QUE NÃO É INTERNA
const innerOf = (layer: string) => Number(/^In(\d+)\.Cu$/.exec(layer)?.[1] ?? 0)
const copperOf = (layer: string) => layer === 'B.Cu' ? 31 : innerOf(layer)
const widthOf = (node: Node | undefined) => mils(num(child(child(node, 'stroke'), 'width') ?? child(node, 'width'), 1))

// LINHA, ARCO (TRÊS PONTOS), CÍRCULO, RETÂNGULO E POLÍGONO GRÁFICOS COMO TRAÇO; at E angle LEVAM O LOCAL DO FOOTPRINT À PLACA
const graphicOf = (node: Node[], place: (point: Point) => Point): Stroke | null => {
    const side = SILK[layerOf(node)] ?? DOCS[layerOf(node)]?.[1] ?? (layerOf(node) === 'Edge.Cuts' ? 'top' : null)

    if (!side)
        return null

    const kind  = String(node[0]).replace(/^(fp|gr)_/, '')
    const width = widthOf(node)
    const fill  = ['yes', 'solid'].includes(String(list(child(node, 'fill'))[1] ?? ''))
    const flat  = (points: Point[]) => points.map(place).flat()

    if (kind === 'line')
        return { side, points: flat([pointOf(child(node, 'start')), pointOf(child(node, 'end'))]), closed: false, width, fill: false }

    if (kind === 'rect') {
        const [[x0, y0], [x1, y1]] = [pointOf(child(node, 'start')), pointOf(child(node, 'end'))]
        return { side, points: flat([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]), closed: true, width, fill }
    }

    if (kind === 'circle') {
        const [center, end] = [pointOf(child(node, 'center')), pointOf(child(node, 'end'))]
        const points        = arcPoints(center[0], center[1], Math.hypot(end[0] - center[0], end[1] - center[1]), 0, 360)
        return { side, points: flat(Array.from({ length: points.length / 2 }, (_, i): Point => [points[2 * i], points[2 * i + 1]])), closed: true, width, fill }
    }

    if (kind === 'arc') {
        const [a, m, b] = [pointOf(child(node, 'start')), pointOf(child(node, 'mid')), pointOf(child(node, 'end'))]
        const arc       = throughThree(a, m, b)
        return { side, points: flat(arc), closed: false, width, fill: false }
    }

    if (kind === 'poly') {
        const points = children(child(node, 'pts'), 'xy').map(pointOf)
        return { side, points: flat(points), closed: true, width, fill }
    }

    return null
}

// ARCO PELOS TRÊS PONTOS: CENTRO DO CÍRCULO CIRCUNSCRITO, VARREDURA NO SENTIDO QUE PASSA PELO MEIO
export const throughThree = (a: Point, m: Point, b: Point): Point[] => {
    const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]))

    if (Math.abs(d) < 1e-9)
        return [a, b]

    const sq     = (p: Point) => p[0] * p[0] + p[1] * p[1]
    const cx     = (sq(a) * (m[1] - b[1]) + sq(m) * (b[1] - a[1]) + sq(b) * (a[1] - m[1])) / d
    const cy     = (sq(a) * (b[0] - m[0]) + sq(m) * (a[0] - b[0]) + sq(b) * (m[0] - a[0])) / d
    const angle  = (p: Point) => Math.atan2(p[1] - cy, p[0] - cx) * 180 / Math.PI
    const norm   = (value: number) => ((value % 360) + 360) % 360
    const [s, e] = [angle(a), angle(b)]
    const ccw    = norm(angle(m) - s) < norm(e - s)
    const sweep  = ccw ? norm(e - s) : norm(e - s) - 360
    const flat   = arcPoints(cx, cy, Math.hypot(a[0] - cx, a[1] - cy), s, sweep)
    return Array.from({ length: flat.length / 2 }, (_, i) => [flat[2 * i], flat[2 * i + 1]])
}

const PAD_FORMS: Record<string, PadForm> = { circle: 'circle', rect: 'rect', oval: 'oval', roundrect: 'rect', trapezoid: 'rect', custom: 'polygon' }

const netName = (node: Node | undefined, names: Map<string, string>) => {
    const net = list(child(node, 'net'))
    return net.length > 2 ? String(net[2]) : names.get(String(net[1] ?? '')) ?? String(net[1] ?? '')
}

// PLACA NEUTRA DO .kicad_pcb: CONTORNO (Edge.Cuts), FOOTPRINTS (PADS EM POSIÇÃO ABSOLUTA, SERIGRAFIA, COURTYARD E FAB), TRILHAS E ARCOS DE COBRE EXTERNO, VIAS,
// SERIGRAFIA E ÁREAS DE COBRE PREENCHIDAS; O COBRE DAS CAMADAS InN.Cu E AS VIAS CEGAS VÃO PARA inner
export const readKicad = (text: string): BoardData => {
    const root   = parseSexpr(text)
    const board  = emptyBoard()
    const names  = new Map(children(root, 'net').map(net => [String(net[1]), String(net[2] ?? '')]))
    const edges: Stroke[] = []
    const stack  = list(child(root, 'layers')).map(layer => Array.isArray(layer) ? innerOf(String(layer[1])) : 0).filter(Boolean)

    board.copper = list(child(root, 'layers')).filter(layer => Array.isArray(layer) && /\.Cu$/.test(String(layer[1]))).length || 2

    for (const node of children(root, 'footprint').concat(children(root, 'module'))) {
        const at       = child(node, 'at')
        const origin   = pointOf(at)
        const angle    = num(at, 3)
        const place    = (point: Point): Point => {
            const [x, y] = rotate(point, -angle)
            return [origin[0] + x, origin[1] + y]
        }
        const property = (name: string) => String(list(children(node, 'property').find(item => item[1] === name))[2] ?? list(children(node, 'fp_text').find(item => item[1] === name.toLowerCase()))[2] ?? '')
        const side     = layerOf(node) === 'B.Cu' ? 'bottom' : 'top'
        const pads     = children(node, 'pad').map((pad): BoardPad => {
            const [kind, shape] = [String(pad[2]), String(pad[3])]
            const padAt         = child(pad, 'at')
            const [x, y]        = place(pointOf(padAt))
            const size          = child(pad, 'size')
            const drill         = child(pad, 'drill')
            const oval          = list(drill)[1] === 'oval'
            const layers        = list(child(pad, 'layers')).slice(1).map(String)
            const form          = PAD_FORMS[shape] ?? 'rect'
            const rotation      = -num(padAt, 3)
            const primitives    = children(child(child(pad, 'primitives'), 'gr_poly'), 'pts').flatMap(pts => children(pts, 'xy').map(pointOf))
            const polygon       = form === 'polygon' && primitives.length > 2 ? primitives.flatMap(point => rotate(point, rotation)) : null
            const padSide       = layers.some(layer => layer === '*.Cu' || layer === 'F&B.Cu') || kind !== 'smd' ? 'both' : layers.includes('B.Cu') ? 'bottom' : 'top'
            return { name: String(pad[1] ?? ''), x, y, width: mils(num(size, 1)), height: mils(num(size, 2)), rotation, form: polygon ? 'polygon' : form === 'polygon' ? 'rect' : form, polygon, drill: kind === 'smd' || kind === 'connect' ? 0 : mils(num(drill, oval ? 2 : 1)), plated: kind !== 'np_thru_hole', side: padSide, net: netName(pad, names) }
        })
        const drawn    = list(node).filter((item): item is Node[] => Array.isArray(item) && /^fp_/.test(String(item[0])))
        const strokes  = (keep: (layer: string) => boolean) => drawn.filter(item => keep(layerOf(item))).flatMap(item => graphicOf(item, place) ?? [])
        const silk     = strokes(layer => layer in SILK)
        const footprint: Footprint = { ref: property('Reference'), value: property('Value'), name: String(node[1] ?? '').split(':').pop() ?? '', x: origin[0], y: origin[1], rotation: -angle, side, pads, silk, courtyard: strokes(layer => DOCS[layer]?.[0] === 'courtyard'), fab: strokes(layer => DOCS[layer]?.[0] === 'fab') }

        board.footprints.push(footprint)
    }

    for (const node of list(root).filter((item): item is Node[] => Array.isArray(item) && /^gr_/.test(String(item[0])))) {
        const stroke = graphicOf(node, point => point)

        if (stroke)
            (layerOf(node) === 'Edge.Cuts' ? edges : layerOf(node) in SILK ? board.silk : []).push(stroke)
    }

    for (const node of children(root, 'segment').concat(children(root, 'arc'))) {
        const side  = COPPER[layerOf(node)]
        const inner = innerOf(layerOf(node))

        if (!side && !inner) {
            board.dropped++
            continue
        }

        const width  = mils(num(child(node, 'width'), 1))
        const net    = netName(node, names)
        const points = node[0] === 'arc' ? throughThree(pointOf(child(node, 'start')), pointOf(child(node, 'mid')), pointOf(child(node, 'end'))) : [pointOf(child(node, 'start')), pointOf(child(node, 'end'))]
        points.slice(1).forEach((b, i) => side ? board.tracks.push({ side, a: points[i], b, width, net }) : board.inner.tracks.push({ layer: inner, a: points[i], b, width, net }))
    }

    for (const node of children(root, 'via')) {
        const [x, y]   = pointOf(child(node, 'at'))
        const [from, to] = list(child(node, 'layers')).slice(1).map(String)
        board.inner.vias.push({ x, y, diameter: mils(num(child(node, 'size'), 1)), drill: mils(num(child(node, 'drill'), 1)), net: netName(node, names), from: copperOf(from ?? 'F.Cu'), to: copperOf(to ?? 'B.Cu') })
    }

    // ÁREAS DE COBRE COM O PREENCHIMENTO GRAVADO (filled_polygon) POR FACE; SEM PREENCHIMENTO (A ÁREA QUE O PRÓPRIO CIRCUITMASTER EXPORTA), O CONTORNO É DESPEJADO NA
    // IMPORTAÇÃO COM A FOLGA (TAMBÉM NA BORDA: A DA BORDA FICA NO .kicad_pro), A LARGURA MÍNIMA E O ALÍVIO DA ZONA, COMO O POLÍGONO DO EAGLE; ÁREA PROIBIDA (keepout) NÃO É COBRE
    for (const node of children(root, 'zone').filter(zone => !child(zone, 'keepout'))) {
        const net     = netName(node, names) || String(list(child(node, 'net_name'))[1] ?? '')
        const layers  = [layerOf(node), ...list(child(node, 'layers')).slice(1).map(String)].filter(Boolean)
        const sides   = (['top', 'bottom'] as Side[]).filter(side => layers.some(layer => COPPER[layer] === side || layer === '*.Cu' || layer === 'F&B.Cu'))
        const filled  = children(node, 'filled_polygon')
        const connect = child(node, 'connect_pads')
        const outline = children(child(child(node, 'polygon'), 'pts'), 'xy').flatMap(pointOf)
        const pour    = !filled.length && outline.length >= 6 ? { outline, clearance: mils(num(child(connect, 'clearance'), 1)), edge: mils(num(child(connect, 'clearance'), 1)), width: mils(num(child(node, 'min_thickness'), 1)), thermal: list(connect)[1] !== 'no' } : null

        const inners  = layers.some(layer => layer === '*.Cu') ? stack : layers.map(innerOf).filter(Boolean)
        const fillOf  = (keep: (layer: string) => boolean) => filled.filter(fill => keep(layerOf(fill))).map(fill => children(child(fill, 'pts'), 'xy').flatMap(pointOf))

        sides.forEach(side => board.zones.push({ side, net, fill: fillOf(layer => COPPER[layer] === side), hatch: [], pour }))
        inners.forEach(layer => board.inner.zones.push({ layer, net, fill: fillOf(name => innerOf(name) === layer), pour }))
    }

    board.outline = chain(edges)
    return settleInner(board, 0, 31, stack)
}

// TRAÇOS DO CONTORNO EM POLÍGONOS FECHADOS: JUNTA PELAS PONTAS (TOLERÂNCIA DE 1 mil); TRAÇO JÁ FECHADO É UM POLÍGONO
export const chain = (strokes: Stroke[], tolerance = 1) => {
    const polygons: number[][] = strokes.filter(stroke => stroke.closed).map(stroke => stroke.points)
    const open = strokes.filter(stroke => !stroke.closed).map(stroke => stroke.points)
    const near = (points: number[], x: number, y: number) => Math.hypot(points[0] - x, points[1] - y) < tolerance

    while (open.length) {
        let current = open.shift() as number[]

        for (let found = true; found;) {
            const [x, y] = current.slice(-2)
            const index  = open.findIndex(points => near(points, x, y) || near(points.slice(-2), x, y))
            found        = index >= 0

            if (!found)
                break

            const next = open.splice(index, 1)[0]
            current    = [...current, ...(near(next, x, y) ? next : reverse(next)).slice(2)]
        }

        polygons.push(current)
    }

    return polygons.filter(points => points.length >= 6)
}

const reverse = (points: number[]) => Array.from({ length: points.length / 2 }, (_, i) => points.slice(points.length - 2 * i - 2, points.length - 2 * i)).flat()

// ---------- ESCRITA ----------

const mm = (value: number) => Number((value / MIL_PER_MM).toFixed(4))
const angleOf = (degrees: number) => Number(((-degrees % 360 + 360) % 360).toFixed(3))

const padText = (pad: BoardPad, footprint: Footprint, nets: Map<string, number>) => {
    const [lx, ly] = rotate([pad.x - footprint.x, pad.y - footprint.y], -footprint.rotation)
    const kind     = pad.drill === 0 ? 'smd' : pad.plated ? 'thru_hole' : 'np_thru_hole'
    const shape    = pad.form === 'polygon' ? 'custom' : pad.form
    const layers   = pad.drill > 0 ? '"*.Cu" "*.Mask"' : pad.side === 'bottom' ? '"B.Cu" "B.Paste" "B.Mask"' : '"F.Cu" "F.Paste" "F.Mask"'
    const net      = pad.net ? ` (net ${nets.get(pad.net)} ${quote(pad.net)})` : ''
    const custom   = pad.polygon ? ` (options (clearance outline) (anchor circle)) (primitives (gr_poly (pts ${Array.from({ length: pad.polygon.length / 2 }, (_, i) => rotate([pad.polygon?.[2 * i] ?? 0, pad.polygon?.[2 * i + 1] ?? 0], -pad.rotation)).map(([x, y]) => `(xy ${mm(x)} ${mm(y)})`).join(' ')}) (width 0) (fill yes)))` : ''
    const size     = pad.polygon ? [Math.min(pad.width, pad.height) / 4, Math.min(pad.width, pad.height) / 4] : [pad.width, pad.height]
    return `    (pad ${quote(pad.name)} ${kind} ${shape} (at ${mm(lx)} ${mm(ly)} ${angleOf(pad.rotation)}) (size ${mm(size[0])} ${mm(size[1])})${pad.drill > 0 ? ` (drill ${mm(pad.drill)})` : ''} (layers ${layers})${net}${custom})`
}

const strokeText = (stroke: Stroke, layer: string, prefix: string) => stroke.closed ? `  (${prefix}_poly (pts ${Array.from({ length: stroke.points.length / 2 }, (_, i) => `(xy ${mm(stroke.points[2 * i])} ${mm(stroke.points[2 * i + 1])})`).join(' ')}) (stroke (width ${mm(stroke.width)}) (type solid)) (fill ${stroke.fill ? 'yes' : 'no'}) (layer ${quote(layer)}))` :
    Array.from({ length: stroke.points.length / 2 - 1 }, (_, i) => `  (${prefix}_line (start ${mm(stroke.points[2 * i])} ${mm(stroke.points[2 * i + 1])}) (end ${mm(stroke.points[2 * i + 2])} ${mm(stroke.points[2 * i + 3])}) (stroke (width ${mm(stroke.width)}) (type solid)) (layer ${quote(layer)}))`).join('\n')

const points = (ring: number[]) => Array.from({ length: ring.length / 2 }, (_, i) => `(xy ${mm(ring[2 * i])} ${mm(ring[2 * i + 1])})`).join(' ')

// ÁREA DE COBRE SÓ COM O CONTORNO, A NET, A FOLGA E O ALÍVIO TÉRMICO: O KICAD PREENCHE (TECLA B) COM AS PRÓPRIAS REGRAS
// ponytail: O PREENCHIMENTO CALCULADO NÃO VAI (O filled_polygon DO KICAD NÃO TEM FUROS; SERIA PRECISO FRATURAR CADA FURO ATÉ A BORDA)
const zoneText = (zone: Omit<InnerZone, 'layer'>, layer: string, nets: Map<string, number>) => {
    const pour  = zone.pour ?? { outline: zone.fill[0] ?? [], clearance: 10, edge: 30, width: 0, thermal: false }
    return `  (zone (net ${nets.get(zone.net) ?? 0}) (net_name ${quote(zone.net)}) (layer ${quote(layer)}) (hatch edge 0.508) (connect_pads${pour.thermal ? '' : ' no'} (clearance ${mm(pour.clearance)})) (min_thickness ${mm(Math.max(pour.width, 10))}) (filled_areas_thickness no) (fill yes (thermal_gap ${mm(pour.clearance)}) (thermal_bridge_width ${mm(Math.max(pour.clearance, 10))})) (polygon (pts ${points(pour.outline)})))`
}

// .kicad_pcb (FORMATO 20240108, QUE O KICAD 8 EM DIANTE ABRE) COM AS CAMADAS DE COBRE DA PLACA (InN.Cu ENTRE F.Cu E B.Cu), CONTORNO EM Edge.Cuts, FOOTPRINTS COM PADS
// LOCAIS, SERIGRAFIA E DOCUMENTAÇÃO, TRILHAS, VIAS (AS CEGAS E ENTERRADAS COMO blind) E ÁREAS DE COBRE
export const writeKicad = (board: BoardData) => {
    const nets  = new Map(netsOf(board).map((name, i) => [name, i + 1]))
    const netOf = (name: string) => name ? ` (net ${nets.get(name)})` : ' (net 0)'
    const silk  = (side: Side) => side === 'top' ? 'F.SilkS' : 'B.SilkS'
    const cu    = (layer: number) => layer === 0 ? 'F.Cu' : layer === board.copper - 1 ? 'B.Cu' : `In${layer}.Cu`
    const inner = Array.from({ length: board.copper - 2 }, (_, i) => ` (${i + 1} "In${i + 1}.Cu" signal)`).join('')
    const head  = ['(kicad_pcb (version 20240108) (generator "circuitmaster") (generator_version "1.0")', '  (general (thickness 1.6) (legacy_teardrops no))', '  (paper "A4")',
                   `  (layers (0 "F.Cu" signal)${inner} (31 "B.Cu" signal) (32 "B.Adhes" user "B.Adhesive") (33 "F.Adhes" user "F.Adhesive") (34 "B.Paste" user) (35 "F.Paste" user) (36 "B.SilkS" user "B.Silkscreen") (37 "F.SilkS" user "F.Silkscreen") (38 "B.Mask" user) (39 "F.Mask" user) (44 "Edge.Cuts" user) (46 "B.CrtYd" user "B.Courtyard") (47 "F.CrtYd" user "F.Courtyard") (48 "B.Fab" user) (49 "F.Fab" user))`,
                   '  (setup (pad_to_mask_clearance 0))', '  (net 0 "")', ...[...nets].map(([name, id]) => `  (net ${id} ${quote(name)})`)]
    const parts = board.footprints.map(footprint => {
        const layer = footprint.side === 'top' ? 'F.Cu' : 'B.Cu'
        const local = (stroke: Stroke): Stroke => ({ ...stroke, points: Array.from({ length: stroke.points.length / 2 }, (_, i) => rotate([stroke.points[2 * i] - footprint.x, stroke.points[2 * i + 1] - footprint.y], -footprint.rotation)).flat() })
        const ref   = `    (property "Reference" ${quote(footprint.ref)} (at 0 0 0) (layer ${quote(silk(footprint.side))}) (hide yes) (effects (font (size 1 1) (thickness 0.15))))`
        const value = `    (property "Value" ${quote(footprint.value)} (at 0 0 0) (layer "F.Fab") (hide yes) (effects (font (size 1 1) (thickness 0.15))))`
        return [`  (footprint ${quote(footprint.name || 'imported')} (layer ${quote(layer)}) (at ${mm(footprint.x)} ${mm(footprint.y)} ${angleOf(footprint.rotation)})`, ref, value, ...footprint.silk.map(stroke => strokeText(local(stroke), silk(stroke.side), '  fp')), ...(footprint.fab ?? []).map(stroke => strokeText(local(stroke), stroke.side === 'top' ? 'F.Fab' : 'B.Fab', '  fp')), ...(footprint.courtyard ?? []).map(stroke => strokeText(local(stroke), stroke.side === 'top' ? 'F.CrtYd' : 'B.CrtYd', '  fp')), ...footprint.pads.map(pad => padText(pad, footprint, nets)), '  )'].join('\n')
    })
    const edges  = board.outline.map(points => strokeText({ side: 'top', points, closed: true, width: 4, fill: false }, 'Edge.Cuts', 'gr'))
    const art    = board.silk.map(stroke => strokeText(stroke, silk(stroke.side), 'gr'))
    const tracks = [...board.tracks.map(track => ({ ...track, layer: track.side === 'top' ? 0 : board.copper - 1 })), ...board.inner.tracks].map(track => `  (segment (start ${mm(track.a[0])} ${mm(track.a[1])}) (end ${mm(track.b[0])} ${mm(track.b[1])}) (width ${mm(track.width)}) (layer ${quote(cu(track.layer))})${netOf(track.net)})`)
    const vias   = [...board.vias.map(via => ({ ...via, from: 0, to: board.copper - 1 })), ...board.inner.vias].map(via => `  (via${via.from > 0 || via.to < board.copper - 1 ? ' blind' : ''} (at ${mm(via.x)} ${mm(via.y)}) (size ${mm(via.diameter)}) (drill ${mm(via.drill)}) (layers ${quote(cu(via.from))} ${quote(cu(via.to))})${netOf(via.net)})`)
    const zones  = [...board.zones.map(zone => ({ ...zone, layer: zone.side === 'top' ? 0 : board.copper - 1 })), ...board.inner.zones].filter(zone => (zone.pour?.outline ?? zone.fill[0] ?? []).length >= 6).map(zone => zoneText(zone, cu(zone.layer), nets))
    return `${prettify([...head, ...parts, ...edges, ...art, ...tracks, ...vias, ...zones, ')'].join('\n'), 'normal')}\n`    // NO FORMATO DO PRÓPRIO KICAD (Prettify)
}
