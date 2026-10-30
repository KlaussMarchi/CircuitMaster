import { arcPoints, emptyBoard, netsOf, settleInner, toBoard, toLocal, type BoardData, type BoardPad, type Footprint, type InnerZone, type PadForm, type Side, type Stroke } from '../Board'
import { childNamed, childrenNamed, childrenOf, parseXml, tagOf, type XmlElement } from '../Xml'
import { chain } from '../Kicad'

// LEITURA E ESCRITA DO .brd XML DO EAGLE 6+ (mm, Y PARA CIMA, rot "R90"/"MR180" ANTI-HORÁRIO, M = ESPELHADO NA FACE DE BAIXO) (SPEC 09 §6)

const MIL_PER_MM = 1000 / 25.4
const TOP        = '1'
const BOTTOM     = '16'
const DIMENSION  = '20'
const PLACE      = { top: '21', bottom: '22' }
const DOCS: Record<string, ['courtyard' | 'fab', Side]> = { 39: ['courtyard', 'top'], 40: ['courtyard', 'bottom'], 51: ['fab', 'top'], 52: ['fab', 'bottom'] }    // tKeepout/bKeepout E tDocu/bDocu, COMO O IMPORTADOR DO KICAD
const SUFFIX     = /@\d+$/    // PAD REPETIDO NO PACOTE (GND@1, GND@2) É O MESMO PINO NA TELA DO EAGLE

const attr = (element: XmlElement | undefined, name: string, fallback = 0) => {
    const value = Number(element?.getAttribute(name) ?? '')
    return Number.isFinite(value) && element?.hasAttribute(name) ? value : fallback
}
const text = (element: XmlElement | undefined, name: string) => element?.getAttribute(name) ?? ''
const mils = (mm: number) => mm * MIL_PER_MM
const all = (element: XmlElement | undefined, path: string[]): XmlElement[] => path.reduce((found, name) => found.flatMap(item => childrenNamed(item, name)), element ? [element] : [])

const rotOf = (value: string) => ({ mirror: value.includes('M'), angle: Number(value.replace(/[^\d.-]/g, '')) || 0 })

// REGRA DE ANEL (RESTRING) DO ARQUIVO: FRAÇÃO DO FURO ENTRE UM MÍNIMO E UM MÁXIMO; O DIÂMETRO DO PACOTE SÓ VALE SE FOR MAIOR (PADRÃO DO EAGLE: 25%, 10–20 mil)
type Restring = { ratio: number, low: number, high: number }

const lengthOf = (value: string) => value.endsWith('mil') ? Number(value.slice(0, -3)) : value.endsWith('mm') ? mils(Number(value.slice(0, -2))) : value.endsWith('in') ? 1000 * Number(value.slice(0, -2)) : mils(Number(value))

const paramsOf = (node: XmlElement | undefined) => new Map(all(node, ['designrules', 'param']).map(param => [text(param, 'name'), text(param, 'value')]))

const restringOf = (node: XmlElement | undefined, name: string, fallback: Restring): Restring => {
    const params = paramsOf(node)
    const read   = (key: string, current: number, parse: (value: string) => number) => params.has(key) && Number.isFinite(parse(params.get(key) as string)) ? parse(params.get(key) as string) : current
    return { ratio: read(`rv${name}`, fallback.ratio, Number), low: read(`rlMin${name}`, fallback.low, lengthOf), high: read(`rlMax${name}`, fallback.high, lengthOf) }
}

const ringed = (drill: number, diameter: number, rule: Restring) => Math.max(diameter, drill + 2 * Math.min(rule.high, Math.max(rule.low, rule.ratio * drill)))

// TRECHO COM curve (GRAUS, ANTI-HORÁRIO) VIRA ARCO PELO CENTRO NA MEDIATRIZ DA CORDA
const curved = (x1: number, y1: number, x2: number, y2: number, curve: number) => {
    if (!curve)
        return [x1, y1, x2, y2]

    const [mx, my]   = [(x1 + x2) / 2, (y1 + y2) / 2]
    const chord      = Math.hypot(x2 - x1, y2 - y1)
    const half       = curve * Math.PI / 360
    const offset     = chord / 2 / Math.tan(half)
    const [cx, cy]   = [mx - offset * (y2 - y1) / chord, my + offset * (x2 - x1) / chord]
    const start      = Math.atan2(y1 - cy, x1 - cx) * 180 / Math.PI
    return arcPoints(cx, cy, Math.hypot(x1 - cx, y1 - cy), start, curve)
}

// GEOMETRIA EM mm DO ARQUIVO (Y PARA CIMA) PARA mil COM Y PARA BAIXO
const flip = (points: number[]) => points.map((value, i) => i % 2 ? -mils(value) : mils(value))

const strokeOf = (element: XmlElement, side: Side, place: (points: number[]) => number[]): Stroke | null => {
    const tag = tagOf(element)

    if (tag === 'wire')
        return { side, points: place(curved(attr(element, 'x1'), attr(element, 'y1'), attr(element, 'x2'), attr(element, 'y2'), attr(element, 'curve'))), closed: false, width: mils(attr(element, 'width')), fill: false }

    if (tag === 'circle')
        return { side, points: place(arcPoints(attr(element, 'x'), attr(element, 'y'), attr(element, 'radius'), 0, 360)), closed: true, width: mils(attr(element, 'width')), fill: attr(element, 'width') === 0 }

    if (tag === 'rectangle') {
        const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(name => attr(element, name))
        return { side, points: place([x1, y1, x2, y1, x2, y2, x1, y2]), closed: true, width: 0, fill: true }
    }

    if (tag === 'polygon')
        return { side, points: place(childrenNamed(element, 'vertex').flatMap(vertex => [attr(vertex, 'x'), attr(vertex, 'y')])), closed: true, width: mils(attr(element, 'width')), fill: true }

    return null
}

const SHAPES: Record<string, PadForm> = { round: 'circle', square: 'rect', octagon: 'polygon', long: 'oval', offset: 'oval' }

// PLACA NEUTRA DO .brd: CONTORNO NA CAMADA 20, ELEMENTOS COM OS PADS DO PACOTE POSICIONADOS (E COURTYARD 39/40, FAB 51/52), TRILHAS, VIAS E POLÍGONOS
// DOS SINAIS, SERIGRAFIA 21/22; O COBRE DAS CAMADAS 2–15 E AS VIAS CEGAS VÃO PARA inner (A PILHA É A DO layerSetup DAS REGRAS)
export const readEagle = (source: string): BoardData => {
    const root      = parseXml(source)
    const drawing   = childNamed(root ?? undefined, 'drawing')
    const node      = childNamed(drawing, 'board')
    const board     = emptyBoard()
    const packages  = new Map(all(node, ['libraries', 'library']).flatMap(library => all(library, ['packages', 'package']).map(item => [`${text(library, 'name')}|${text(item, 'name')}`, item] as const)))
    const netOf     = new Map(all(node, ['signals', 'signal']).flatMap(signal => childrenNamed(signal, 'contactref').map(ref => [`${text(ref, 'element')}|${text(ref, 'pad')}`, text(signal, 'name')] as const)))
    const edges: Stroke[] = []
    const padRule   = restringOf(node, 'PadTop', { ratio: 0.25, low: 10, high: 20 })
    const viaRule   = restringOf(node, 'ViaOuter', { ratio: 0.25, low: 8, high: 20 })
    const params    = paramsOf(node)
    const wireGap   = lengthOf(params.get('mdWireWire') ?? '8mil')         // FOLGA ENTRE NETS E ATÉ O CONTORNO DA PLACA (PADRÕES DO EAGLE)
    const edgeGap   = lengthOf(params.get('mdCopperDimension') ?? '40mil')
    const stack     = (params.get('layerSetup') ?? '').match(/\d+/g)?.map(Number).filter(layer => layer > 1 && layer < 16) ?? []
    const inner     = (layer: string) => Number(layer) > 1 && Number(layer) < 16

    for (const item of childrenOf(childNamed(node, 'plain'))) {
        const layer  = text(item, 'layer')

        if (tagOf(item) === 'hole') {
            const [x, y, drill] = [mils(attr(item, 'x')), -mils(attr(item, 'y')), mils(attr(item, 'drill'))]
            board.footprints.push({ ref: `H${board.footprints.length + 1}`, value: '', name: 'HOLE', x, y, rotation: 0, side: 'top', pads: [{ name: '', x, y, width: drill, height: drill, rotation: 0, form: 'circle', polygon: null, drill, plated: false, side: 'both', net: '' }], silk: [] })
            continue
        }

        const side   = layer === PLACE.bottom ? 'bottom' : 'top'
        const stroke = layer === DIMENSION || layer === PLACE.top || layer === PLACE.bottom ? strokeOf(item, side, flip) : null

        if (stroke)
            (layer === DIMENSION ? edges : board.silk).push(stroke)
    }

    for (const element of all(node, ['elements', 'element'])) {
        const item           = packages.get(`${text(element, 'library')}|${text(element, 'package')}`)
        const { mirror, angle } = rotOf(text(element, 'rot'))
        const footprint: Footprint = { ref: text(element, 'name'), value: text(element, 'value'), name: text(element, 'package'), x: mils(attr(element, 'x')), y: -mils(attr(element, 'y')), rotation: -angle, side: mirror ? 'bottom' : 'top', pads: [], silk: [] }
        const place          = (points: number[]) => Array.from({ length: points.length / 2 }, (_, i) => toBoard(footprint, mils(points[2 * i]), -mils(points[2 * i + 1]))).flat()
        const padRotation    = (local: number) => mirror ? -(angle - local) : -(angle + local)

        for (const pad of childrenNamed(item, 'pad')) {
            const drill    = mils(attr(pad, 'drill'))
            const diameter = ringed(drill, mils(attr(pad, 'diameter')), padRule)
            const shape    = SHAPES[text(pad, 'shape') || 'round'] ?? 'circle'
            const [x, y]   = place([attr(pad, 'x'), attr(pad, 'y')])
            const octagon  = shape === 'polygon' ? arcPoints(0, 0, diameter / 2 / Math.cos(Math.PI / 8), 22.5, 360).slice(0, 16) : null
            footprint.pads.push({ name: text(pad, 'name').replace(SUFFIX, ''), x, y, width: shape === 'oval' ? 2 * diameter : diameter, height: diameter, rotation: padRotation(rotOf(text(pad, 'rot')).angle), form: shape, polygon: octagon, drill, plated: true, side: 'both', net: netOf.get(`${footprint.ref}|${text(pad, 'name')}`) ?? '' })
        }

        for (const smd of childrenNamed(item, 'smd')) {
            const [dx, dy]   = [mils(attr(smd, 'dx')), mils(attr(smd, 'dy'))]
            const round      = attr(smd, 'roundness') >= 100
            const [x, y]     = place([attr(smd, 'x'), attr(smd, 'y')])
            const own: Side  = text(smd, 'layer') === BOTTOM ? 'bottom' : 'top'
            footprint.pads.push({ name: text(smd, 'name').replace(SUFFIX, ''), x, y, width: dx, height: dy, rotation: padRotation(rotOf(text(smd, 'rot')).angle), form: round ? dx === dy ? 'circle' : 'oval' : 'rect', polygon: null, drill: 0, plated: true, side: mirror ? own === 'top' ? 'bottom' : 'top' : own, net: netOf.get(`${footprint.ref}|${text(smd, 'name')}`) ?? '' })
        }

        for (const hole of childrenNamed(item, 'hole')) {
            const [x, y] = place([attr(hole, 'x'), attr(hole, 'y')])
            footprint.pads.push({ name: '', x, y, width: mils(attr(hole, 'drill')), height: mils(attr(hole, 'drill')), rotation: 0, form: 'circle', polygon: null, drill: mils(attr(hole, 'drill')), plated: false, side: 'both', net: '' })
        }

        footprint.silk = childrenOf(item).flatMap(child => {
            const layer = text(child, 'layer')
            const side  = (layer === PLACE.top) !== mirror ? 'top' : 'bottom'
            return layer === PLACE.top || layer === PLACE.bottom ? strokeOf(child, side, place) ?? [] : []
        })
        const docs     = (kind: 'courtyard' | 'fab') => childrenOf(item).flatMap(child => {
            const doc = DOCS[text(child, 'layer')]
            return doc?.[0] === kind ? strokeOf(child, (doc[1] === 'top') !== mirror ? 'top' : 'bottom', place) ?? [] : []
        })
        footprint.courtyard = docs('courtyard')
        footprint.fab       = docs('fab')
        board.footprints.push(footprint)
    }

    for (const signal of all(node, ['signals', 'signal'])) {
        const net = text(signal, 'name')

        for (const wire of childrenNamed(signal, 'wire')) {
            const layer = text(wire, 'layer')

            if (layer !== TOP && layer !== BOTTOM && !inner(layer))
                continue

            const points = flip(curved(attr(wire, 'x1'), attr(wire, 'y1'), attr(wire, 'x2'), attr(wire, 'y2'), attr(wire, 'curve')))

            for (let i = 2; i < points.length; i += 2) {
                const track = { a: [points[i - 2], points[i - 1]] as [number, number], b: [points[i], points[i + 1]] as [number, number], width: mils(attr(wire, 'width')), net }
                inner(layer) ? board.inner.tracks.push({ ...track, layer: Number(layer) }) : board.tracks.push({ ...track, side: layer === TOP ? 'top' : 'bottom' })
            }
        }

        for (const via of childrenNamed(signal, 'via')) {
            const drill      = mils(attr(via, 'drill'))
            const [from, to] = (text(via, 'extent') || '1-16').split('-').map(Number)
            board.inner.vias.push({ x: mils(attr(via, 'x')), y: -mils(attr(via, 'y')), diameter: ringed(drill, mils(attr(via, 'diameter')), viaRule), drill, net, from, to })
        }

        // POLÍGONO DE SINAL: SÓ O CONTORNO (VÉRTICES COM curve ATÉ O SEGUINTE); O PREENCHIMENTO É DESPEJADO NA IMPORTAÇÃO COM A MAIOR FOLGA ENTRE isolate E A DAS REGRAS
        for (const polygon of childrenNamed(signal, 'polygon')) {
            const layer    = text(polygon, 'layer')
            const vertices = childrenNamed(polygon, 'vertex')

            if (layer !== TOP && layer !== BOTTOM && !inner(layer)) {
                board.dropped++
                continue
            }

            const outline = flip(vertices.flatMap((vertex, i) => {
                const next = vertices[(i + 1) % vertices.length]
                return curved(attr(vertex, 'x'), attr(vertex, 'y'), attr(next, 'x'), attr(next, 'y'), attr(vertex, 'curve')).slice(0, -2)
            }))
            const zone    = { net, fill: [], pour: { outline, clearance: Math.max(mils(attr(polygon, 'isolate')), wireGap), edge: edgeGap, width: mils(attr(polygon, 'width')), thermal: text(polygon, 'thermals') !== 'no' } }
            inner(layer) ? board.inner.zones.push({ ...zone, layer: Number(layer) }) : board.zones.push({ ...zone, side: layer === TOP ? 'top' : 'bottom', hatch: [] })
        }
    }

    board.outline = chain(edges)
    return settleInner(board, 1, 16, stack)
}

// ---------- ESCRITA ----------

const mm = (value: number) => Number((value / MIL_PER_MM).toFixed(4))
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const angle = (degrees: number) => Number((((degrees % 360) + 360) % 360).toFixed(2))

const LAYERS = [[1, 'Top', 4], [16, 'Bottom', 1], [17, 'Pads', 2], [18, 'Vias', 2], [19, 'Unrouted', 6], [20, 'Dimension', 15], [21, 'tPlace', 7], [22, 'bPlace', 7], [25, 'tNames', 7], [26, 'bNames', 7], [27, 'tValues', 7], [28, 'bValues', 7], [29, 'tStop', 7], [30, 'bStop', 7], [31, 'tCream', 7], [32, 'bCream', 7], [39, 'tKeepout', 4], [40, 'bKeepout', 1], [44, 'Drills', 7], [45, 'Holes', 7], [51, 'tDocu', 7], [52, 'bDocu', 7]]
const LAYER_OF = Object.fromEntries(Object.entries(DOCS).map(([layer, [kind, side]]) => [`${kind}|${side}`, layer]))

// ÁREA DE COBRE COMO POLÍGONO DA NET: O EAGLE DESPEJA (RATSNEST) COM A FOLGA, A LARGURA E O ALÍVIO TÉRMICO DADOS
const polygonOf = (zone: Omit<InnerZone, 'layer'>, layer: string, point: (x: number, y: number) => [number, number]) => {
    const pour = zone.pour ?? { outline: zone.fill[0] ?? [], clearance: 10, edge: 30, width: 0, thermal: false }
    return `<polygon width="${mm(Math.max(pour.width, 10))}" layer="${layer}" isolate="${mm(pour.clearance)}" thermals="${pour.thermal ? 'yes' : 'no'}">${Array.from({ length: pour.outline.length / 2 }, (_, i) => point(pour.outline[2 * i], pour.outline[2 * i + 1])).map(([x, y]) => `<vertex x="${x}" y="${y}"/>`).join('')}</polygon>`
}

const wiresOf = (stroke: Stroke, layer: string, point: (x: number, y: number) => [number, number]) => {
    const points = Array.from({ length: stroke.points.length / 2 }, (_, i) => point(stroke.points[2 * i], stroke.points[2 * i + 1]))

    if (stroke.fill && stroke.closed)
        return `<polygon width="${mm(stroke.width)}" layer="${layer}">${points.map(([x, y]) => `<vertex x="${x}" y="${y}"/>`).join('')}</polygon>`

    const ring = stroke.closed ? [...points, points[0]] : points
    return ring.slice(1).map(([x, y], i) => `<wire x1="${ring[i][0]}" y1="${ring[i][1]}" x2="${x}" y2="${y}" width="${mm(stroke.width)}" layer="${layer}"/>`).join('')
}

// PADS DO PACOTE COM NOMES ÚNICOS (REPETIDO GANHA @n, COMO NO EAGLE)
const uniqueNames = (pads: BoardPad[]) => {
    const seen = new Map<string, number>()
    return pads.map(pad => {
        const count = seen.get(pad.name) ?? 0
        seen.set(pad.name, count + 1)
        return count ? `${pad.name}@${count}` : pad.name || '~'
    })
}

// .brd XML (EAGLE 9) COM UMA BIBLIOTECA PRÓPRIA: UM PACOTE POR FOOTPRINT, NO REFERENCIAL DO ELEMENTO (FACE DE BAIXO = rot COM M)
export const writeEagle = (board: BoardData) => {
    const point     = (x: number, y: number): [number, number] => [mm(x), mm(-y)]
    const packages: string[] = []
    const elements: string[] = []
    const contacts  = new Map<string, string[]>()

    board.footprints.forEach((footprint, k) => {
        const names   = uniqueNames(footprint.pads)
        const local   = (x: number, y: number) => point(...toLocal(footprint, x, y))
        const base    = -footprint.rotation
        const padRot  = (pad: BoardPad) => angle(footprint.side === 'bottom' ? base + pad.rotation : -pad.rotation - base)
        const name    = `P${k}_${(footprint.name || 'pkg').replace(/[^\w.-]/g, '_')}`
        const content = footprint.pads.map((pad, i) => {
            const [x, y] = local(pad.x, pad.y)

            if (pad.drill > 0 && !pad.plated && !pad.name)
                return `<hole x="${x}" y="${y}" drill="${mm(pad.drill)}"/>`

            if (pad.drill > 0)
                return `<pad name="${escape(names[i])}" x="${x}" y="${y}" drill="${mm(pad.drill)}" diameter="${mm(Math.min(pad.width, pad.height))}" shape="${pad.form === 'rect' ? 'square' : pad.form === 'oval' ? 'long' : pad.form === 'polygon' ? 'octagon' : 'round'}" rot="R${padRot(pad)}"/>`

            const layer = (pad.side === 'bottom') !== (footprint.side === 'bottom') ? BOTTOM : TOP
            return `<smd name="${escape(names[i])}" x="${x}" y="${y}" dx="${mm(pad.width)}" dy="${mm(pad.height)}" layer="${layer}" rot="R${padRot(pad)}" roundness="${pad.form === 'circle' || pad.form === 'oval' ? 100 : 0}"/>`
        })
        const flipped = (stroke: Stroke): Side => (stroke.side === 'bottom') !== (footprint.side === 'bottom') ? 'bottom' : 'top'
        const silk    = footprint.silk.map(stroke => wiresOf(stroke, PLACE[flipped(stroke)], (x, y) => local(x, y)))
        const docs    = (['fab', 'courtyard'] as const).flatMap(kind => (footprint[kind] ?? []).map(stroke => wiresOf(stroke, LAYER_OF[`${kind}|${flipped(stroke)}`], (x, y) => local(x, y))))

        packages.push(`<package name="${escape(name)}">${content.join('')}${silk.join('')}${docs.join('')}</package>`)
        elements.push(`<element name="${escape(footprint.ref || `E${k}`)}" library="circuitmaster" package="${escape(name)}" value="${escape(footprint.value)}" x="${mm(footprint.x)}" y="${mm(-footprint.y)}" rot="${footprint.side === 'bottom' ? 'M' : ''}R${angle(base)}"/>`)
        footprint.pads.forEach((pad, i) => pad.net && contacts.set(pad.net, [...contacts.get(pad.net) ?? [], `<contactref element="${escape(footprint.ref || `E${k}`)}" pad="${escape(names[i])}"/>`]))
    })

    // CAMADA k DA PLACA NEUTRA NO EAGLE: 1 EM CIMA, 16 EMBAIXO E AS INTERNAS EM 2, 3… (Route2…)
    const last    = board.copper - 1
    const number  = (layer: number) => layer === 0 ? TOP : layer === last ? BOTTOM : String(layer + 1)
    const wires   = [...board.tracks.map(track => ({ ...track, layer: track.side === 'top' ? 0 : last })), ...board.inner.tracks].map(track => ({ net: track.net, text: `<wire x1="${mm(track.a[0])}" y1="${mm(-track.a[1])}" x2="${mm(track.b[0])}" y2="${mm(-track.b[1])}" width="${mm(track.width)}" layer="${number(track.layer)}"/>` }))
    const vias    = [...board.vias.map(via => ({ ...via, from: 0, to: last })), ...board.inner.vias].map(via => ({ net: via.net, text: `<via x="${mm(via.x)}" y="${mm(-via.y)}" extent="${number(via.from)}-${number(via.to)}" drill="${mm(via.drill)}" diameter="${mm(via.diameter)}"/>` }))
    const pours   = [...board.zones.map(zone => ({ ...zone, layer: zone.side === 'top' ? 0 : last })), ...board.inner.zones].map(zone => ({ net: zone.net, text: polygonOf(zone, number(zone.layer), point) }))
    const of      = (net: string) => [...wires, ...vias, ...pours].filter(item => item.net === net).map(item => item.text).join('')
    const signals = netsOf(board).map(net => `<signal name="${escape(net)}">${(contacts.get(net) ?? []).join('')}${of(net)}</signal>`)
    const loose   = of('')
    const plain   = [...board.outline.map(points => wiresOf({ side: 'top', points, closed: true, width: 0, fill: false }, DIMENSION, point)), ...board.silk.map(stroke => wiresOf(stroke, PLACE[stroke.side], point))]
    const routes  = Array.from({ length: board.copper - 2 }, (_, i) => [i + 2, `Route${i + 2}`, 1] as const)
    const layers  = [...LAYERS.slice(0, 1), ...routes, ...LAYERS.slice(1)].map(([number, name, color]) => `<layer number="${number}" name="${name}" color="${color}" fill="1" visible="yes" active="yes"/>`).join('\n')
    // PILHA: NÚCLEOS (*) E PRÉ-IMPREGNADOS (+) ALTERNADOS, COMO O "(1+2*15+16)" DE QUATRO CAMADAS; DUAS CAMADAS = "(1*16)"
    const setup   = board.copper > 2 ? `(${Array.from({ length: board.copper }, (_, k) => number(k)).map((layer, k) => k ? `${k % 2 ? '+' : '*'}${layer}` : layer).join('')})` : '(1*16)'

    return `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE eagle SYSTEM "eagle.dtd">\n<eagle version="9.6.2">\n<drawing>\n<settings><setting alwaysvectorfont="no"/></settings>\n<grid distance="0.1" unitdist="inch" unit="inch" style="lines" multiple="1" display="no" altdistance="0.01" altunitdist="inch" altunit="inch"/>\n<layers>\n${layers}\n</layers>\n<board>\n<plain>${plain.join('')}</plain>\n<libraries><library name="circuitmaster"><packages>\n${packages.join('\n')}\n</packages></library></libraries>\n<attributes/>\n<variantdefs/>\n<classes><class number="0" name="default" width="0" drill="0"/></classes>\n<designrules name="default"><param name="layerSetup" value="${setup}"/>${['PadTop', 'PadInner', 'PadBottom', 'ViaOuter', 'ViaInner'].map(name => `<param name="rv${name}" value="0"/><param name="rlMin${name}" value="0mil"/><param name="rlMax${name}" value="0mil"/>`).join('')}</designrules>\n<elements>\n${elements.join('\n')}\n</elements>\n<signals>\n${signals.join('\n')}${loose ? `\n<signal name="~loose">${loose}</signal>` : ''}\n</signals>\n</board>\n</drawing>\n</eagle>\n`
}
