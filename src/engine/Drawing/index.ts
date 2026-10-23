import { boxOf, mapBox, parseTransform, unionBoxes, type Box, type Matrix, type Point } from '../../core/Geometry'
import { milsToPx } from '../../core/Units'
import { childrenOf, parseXml, serializeXml, tagOf, walk, type XmlElement } from '../../core/Xml'
import { getTextRuns, type Fonts, type TextRun } from '../../core/Font'
import { keyOf, WIRE_FLAGS } from '../../core/Document'
import { getLayerZ, type VIEWS, type ViewName } from '../../core/Layer'
import type { Part } from '../../core/Part'
import type { SvgFile } from '../../core/SvgFile'
import type { Geometry } from '../../core/Sketch'
import type { Netlist } from '../../core/Netlist'
import { Scene, WIRE_STYLE, labelPx, owner } from '../Scene'
import { NOTE_SIZE } from '../Edit'
import { idleColor, ledBase } from '../Simulation'
import { getResistorBands, voltageText } from '../../core/Generator'
import { getProperty } from '../../core/Spice'
import { parseSi } from '../../core/Properties'

type View = typeof VIEWS[number]

export type LegItem   = { key: string, points: Point[], width: number, color: string }
export type PartItem  = { type: 'part', modelIndex: string, z: number, moduleId: string, svg: SvgFile, variant: string, matrix: Matrix, width: number, height: number, legs: LegItem[], hidden: string[], paint: [string, string][], texts: [string, string][], upright: Point, layer: string, plane: string, recolor: [string, string][], hit: boolean }
export type WireItem  = { type: 'wire', modelIndex: string, z: number, d: string, width: number, color: string, opacity: number, shadow: string | null, ends: [Point, Point] }
export type NoteItem  = { type: 'note', modelIndex: string, z: number, x: number, y: number, width: number, height: number, html: string }
export type RatItem   = { from: string, to: string, a: Point, b: Point, color: string }
export type MarkItem  = { key: string, box: Box | null, point: Point | null, radius: number, color: string, opacity: number }
export type LabelItem = { modelIndex: string, x: number, y: number, size: number, color: string, font: string, lines: string[], box: Box | null, rect: Box | null, matrix: Matrix | null }
export type Drawing   = { items: (PartItem | WireItem | NoteItem)[], ratsnest: RatItem[], marks: MarkItem[], junctions: { point: Point, radius: number }[], labels: LabelItem[], bounds: Box | null }

const SVG_NS = 'http://www.w3.org/2000/svg'

const PCB_COLORS: [string, string][] = [['copper0', '#f9a435'], ['copper1', '#fdde68'], ['silkscreen0', '#444444'], ['silkscreen', '#000000']]
const PCB_DRAWN  = ['board', 'groundplane', 'silkscreen0', 'copper0', 'groundplane1', 'copper1', 'silkscreen', 'partimage']

// CADA CAMADA É UMA IMAGEM QUE COBRE A CAIXA TODA DA PEÇA, ENTÃO SÓ UMA RECEBE CLIQUE: A DE BAIXO NA PLACA E A DE COBRE MAIS ALTA NAS PEÇAS (ACIMA DO PREENCHIMENTO, ABAIXO DAS TRILHAS DE CIMA)
const BOARD_KINDS   = ['board', 'resizableBoard']
const COPPER_LAYERS = ['copper0', 'copper1']
const KEPT_TAGS  = new Set(['defs', 'style'])
const BLACK            = new Set(['black', '#000000'])
const STYLE_ATTRIBUTES = ['stroke-width', 'stroke', 'fill', 'fill-opacity', 'stroke-opacity', 'font-size', 'stroke-dasharray']
const TEXT_ONLY        = new Set(['x', 'y', 'dx', 'dy', 'rotate', 'textLength', 'lengthAdjust'])

const RAT_PALETTE: Record<View, string[]> = {
    breadboardView: ['#157de6', '#cc1414', '#000000', '#00a527', '#25cc35', '#ef6100', '#a37911', '#33ffc5', '#ab58a2', '#8c3b00', '#fa50e6'],
    schematicView: ['#157de6', '#cc1414', '#000000', '#00a527', '#25cc35', '#ff7300', '#a37911', '#33ffc5', '#ab58a2', '#8c3b00', '#fa50e6'],
    pcbView: ['#157de6', '#cc1414', '#000000', '#1fb551', '#a37911', '#33ffc5', '#ab58a2', '#8c3b00', '#fa50e6']
}

const RAT_NAMED: Record<string, string> = { gnd: '#000000', ground: '#000000', '3v3': '#cc1414', '+5v': '#cc1414' }

export const WIRE_COLORS: Record<'breadboardView' | 'schematicView', [string, string, string][]> = {
    breadboardView: [['blue', '#418dd9', '#1b5bb3'], ['red', '#cc1414', '#8c0000'], ['black', '#404040', '#000000'], ['yellow', '#fff800', '#d6d63a'], ['green', '#25cc35', '#00a527'], ['grey', '#999999', '#666666'], ['white', '#ffffff', '#999999'], ['orange', '#ef6100', '#ad6a38'], ['ochre', '#a37911', '#846521'], ['cyan', '#33ffc5', '#00a0c6'], ['brown', '#8c3b00', '#6c2710'], ['purple', '#ab58a2', '#7a3a73'], ['pink', '#fa50e6', '#dc00dc']],
    schematicView: [['blue', '#418dd9', '#418dd9'], ['red', '#cc1414', '#cc1414'], ['black', '#404040', '#404040'], ['yellow', '#fff800', '#d6d63a'], ['green', '#25cc35', '#00a527'], ['grey', '#999999', '#666666'], ['orange', '#ff7300', '#d65b00'], ['ochre', '#a37911', '#846521'], ['cyan', '#33ffc5', '#00a0c6'], ['brown', '#8c3b00', '#6c2710'], ['purple', '#ab58a2', '#7a3a73'], ['pink', '#fa50e6', '#dc00dc']]
}

const LENGTH_COLORS = ['#c0c0c0', '#d10000', '#ff6622', '#ffda21', '#33dd00', '#1133cc', '#4b0082', '#a9a9a9', '#f5f5f5', '#8b4513']    // lengthColorTrans DO wire.cpp DO FRITZING: 100 A 1000 mil
const LENGTH_SCALE  = 0.111    // MESMO FATOR DO colorForLength: UM PASSO A CADA ~9 px (100 mil)

const CONNECTED   = { color: '#00ff00', opacity: 0.2 }
const UNCONNECTED = { color: '#ff0000', opacity: 0.3 }
const SHADE       = 0.7      // ESCURECIMENTO DA SOMBRA DE COR DESCONHECIDA
const TURNED      = 0.001 - Math.SQRT1_2    // m22 = cos θ: ROTAÇÃO ENTRE 135° E 225°, COM FOLGA DE ARREDONDAMENTO
const SILK_BOTTOM = '#444444'    // RÓTULO NA FACE DE BAIXO; textColor DO ARQUIVO É IGNORADO
const LABEL_FONTS: Record<View, string> = { breadboardView: 'Droid Sans, sans-serif', schematicView: 'Droid Sans, sans-serif', pcbView: 'OCR-Fritzing-mono, OCR A Std, monospace' }

const darken = (color: string) => {
    const value = parseInt(color.replace('#', '').padEnd(6, '0').slice(0, 6), 16)
    const parts = [16, 8, 0].map(shift => Math.round(((value >> shift) & 255) * SHADE))
    return `#${parts.map(part => part.toString(16).padStart(2, '0')).join('')}`
}

const shadowOf = (color: string) => WIRE_COLORS.breadboardView.find(([, wire]) => wire.toLowerCase() === color.toLowerCase())?.[2] ?? darken(color)

const getWirePath = ({ x, y, line }: Geometry, bezier: number[] | null) => {
    const [x1, y1, x2, y2] = line ?? [0, 0, 0, 0]
    return bezier ? `M${x + x1} ${y + y1}C${x + bezier[0]} ${y + bezier[1]} ${x + bezier[2]} ${y + bezier[3]} ${x + x2} ${y + y2}` : `M${x + x1} ${y + y1}L${x + x2} ${y + y2}`
}

const getLegs = (scene: Scene, modelIndex: string): LegItem[] => [...scene.getPins(modelIndex)].flatMap(([id, pin]) => {
    const key    = keyOf(modelIndex, id)
    const points = pin.leg ? scene.getLegPoints(key) : null
    return pin.leg && points ? [{ key, points, width: pin.leg.width, color: pin.leg.color }] : []
})

// CORES PARAMÉTRICAS DA BREADBOARD: color_* DO LED PELA PROPRIEDADE color, FAIXAS DO RESISTOR PELA RESISTÊNCIA (SPEC 01 §8.2, §8.12)
const getPaint = (scene: Scene, modelIndex: string): [string, string][] => {
    const instance = scene.doc.instances[modelIndex]
    const part     = scene.library.getPart(instance?.moduleIdRef ?? '')
    const base     = part && instance ? ledBase(part, instance) : null

    if (!part || !instance || scene.view !== 'breadboardView')
        return []

    if (part.moduleId.endsWith('ResistorModuleID'))
        return getResistorBands(part.moduleId, parseSi(getProperty(part, instance, 'resistance'), 'Ω') ?? 0, getProperty(part, instance, 'tolerance'))

    return base ? [['color_', idleColor(base)]] : []
}

const getTexts = (scene: Scene, modelIndex: string): [string, string][] => {
    const instance = scene.doc.instances[modelIndex]
    const part     = scene.library.getPart(instance?.moduleIdRef ?? '')
    const voltage  = part && instance && part.kind === 'symbol' && part.properties.type === 'voltage reference' ? getProperty(part, instance, 'voltage') : ''
    return voltage ? [['label', voltageText(voltage)]] : []
}

// CAMADAS DESENHADAS NA PCB, CADA UMA NO z DA SUA CAMADA: SÓ A SUBÁRVORE DO GRUPO; THT SEM GRUPO copper1 REPETE O copper0 POR CIMA (SPEC 01 §2.5, §3.3)
const getPcbLayers = (part: Part, svg: SvgFile, hidden: string[]) => {
    const declared = PCB_DRAWN.filter(layer => part.views.pcbView?.layers.includes(layer))
    const colors   = PCB_COLORS.filter(([layer]) => declared.includes(layer))

    if (declared.length <= 1)
        return [{ layer: declared[0] ?? '', source: '', recolor: colors }]

    return declared.filter(layer => !hidden.includes(layer)).flatMap(layer => {
        const source = svg.findFirst(layer) ? layer : layer === 'copper1' && svg.findFirst('copper0') ? 'copper0' : ''
        const color  = colors.find(([id]) => id === layer)?.[1]
        return source ? [{ layer, source, recolor: color ? [[source, color] as [string, string]] : [] }] : []
    })
}

// ESCALA QUE CADA BLOCO DE TEXTO DO ESQUEMÁTICO RECEBE EM TORNO DO SEU CENTRO PARA DESFAZER O ESPELHO E O GIRO DE 180° DA INSTÂNCIA (SPEC 01 §2.4)
export const getUpright = (m: Matrix): Point => {
    const mirrored = m[0] * m[3] - m[1] * m[2] < 0
    const turned   = m[3] <= TURNED
    return [mirrored !== turned ? -1 : 1, turned ? -1 : 1]
}

// COR PADRÃO DO JUMPER PELO COMPRIMENTO (colorForLength DO FRITZING); FIO CURVO OU MAIS LONGO QUE 1000 mil MANTÉM A SUA
const colorByLength = ([a, b]: [Point, Point], color: string) => LENGTH_COLORS[Math.max(1, Math.round(LENGTH_SCALE * Math.hypot(b[0] - a[0], b[1] - a[1]))) - 1] ?? color

const getItem = (scene: Scene, modelIndex: string, byLength: boolean): (PartItem | WireItem | NoteItem)[] => {
    const state    = scene.getView(modelIndex)
    const moduleId = scene.doc.instances[modelIndex]?.moduleIdRef ?? ''
    const style    = WIRE_STYLE[scene.view as View]
    const ends     = scene.getWireEnds(modelIndex)

    if (!state)
        return []

    if (scene.library.getPart(moduleId)?.kind === 'note') {
        const [width, height] = state.geometry.size ?? NOTE_SIZE
        return [{ type: 'note', modelIndex, z: state.geometry.z, x: state.geometry.x, y: state.geometry.y, width, height, html: scene.doc.instances[modelIndex]?.text ?? '' }]
    }

    if (scene.isWire(modelIndex)) {
        const color  = state.wire?.color ?? style.color
        const trace  = (state.geometry.wireFlags & (WIRE_FLAGS.pcbView | WIRE_FLAGS.schematicView)) !== 0
        const shown  = byLength && ends && !state.wire?.bezier && scene.view === 'breadboardView' ? colorByLength(ends, color) : color
        return ends ? [{ type: 'wire', modelIndex, z: state.geometry.z, d: getWirePath(state.geometry, state.wire?.bezier ?? null), width: milsToPx(state.wire?.mils ?? style.mils), color: shown, opacity: state.wire?.opacity ?? 1, shadow: trace ? null : shadowOf(color), ends }] : []
    }

    const m        = scene.getMatrix(modelIndex)
    const instance = scene.doc.instances[modelIndex]
    const variant  = scene.library.getVariant(instance, scene.view)
    const svg      = scene.library.getInstanceSvg(instance, scene.view)
    const part     = scene.library.getPart(moduleId)

    if (!svg || !m || !part)
        return []

    const item: PartItem = { type: 'part', modelIndex, z: state.geometry.z, moduleId, svg, variant, matrix: m, width: svg.width, height: svg.height, legs: getLegs(scene, modelIndex), hidden: state.hidden, paint: getPaint(scene, modelIndex), texts: getTexts(scene, modelIndex), upright: scene.view === 'schematicView' ? getUpright(m) : [1, 1], layer: '', plane: state.layer, recolor: [], hit: true }
    const offset         = Math.min(0.999, Math.max(0, state.geometry.z - getLayerZ('pcbView', state.layer)))
    if (scene.view !== 'pcbView')
        return [item]

    const layers = getPcbLayers(part, svg, state.hidden)
    const hit    = BOARD_KINDS.includes(part.kind) ? 0 : Math.max(0, layers.map(({ layer }) => COPPER_LAYERS.includes(layer)).lastIndexOf(true))
    return layers.map(({ layer, source, recolor }, i) => ({ ...item, z: (layer ? getLayerZ('pcbView', layer) : state.geometry.z) + (layer ? offset : 0), layer: source, plane: layer || state.layer, recolor, hit: i === hit }))
}

// COR DE CADA NET PELO NOME DE UM MEMBRO OU PELA PALETA CÍCLICA DA VISTA (SPEC 02 §2.6)
const getRatsnest = (scene: Scene, netlist: Netlist): RatItem[] => {
    const view    = scene.view as View
    const labels  = netlist.nets[view] ?? new Uint32Array()
    const palette = RAT_PALETTE[view]
    const named   = (nodes: number[]) => nodes.map(node => RAT_NAMED[scene.getConnector(netlist.keys[node])?.name.toLowerCase() ?? '']).find(Boolean)
    const colors  = new Map(netlist.getGroups(view).map((nodes, i) => [labels[nodes[0]], named(nodes) ?? palette[i % palette.length]]))

    return netlist.getRatsnest(view, key => scene.getTerminal(key)).flatMap(([from, to]) => {
        const a = scene.getTerminal(from)
        const b = scene.getTerminal(to)
        return a && b ? [{ from, to, a, b, color: colors.get(labels[netlist.index.get(from) ?? 0]) ?? palette[0] }] : []
    })
}

// VERDE SE O GRUPO ROTEADO NA VISTA TOCA DUAS OU MAIS PEÇAS, SENÃO VERMELHO; PONTAS DE FIO SEMPRE (SPEC 02 §4.2)
const getMarks = (scene: Scene, netlist: Netlist, items: (PartItem | WireItem | NoteItem)[]): MarkItem[] => {
    const view   = scene.view as View
    const routed = netlist.routed[view]
    const linked = netlist.linked[view] ?? new Set<number>()
    const owners = new Map<number, Set<string>>()

    if (!routed)
        return []

    netlist.keys.forEach((key, node) => {
        if (!scene.isWire(owner(key)))
            owners.set(routed[node], (owners.get(routed[node]) ?? new Set()).add(owner(key)))
    })

    const state = (key: string) => (owners.get(routed[netlist.index.get(key) ?? 0])?.size ?? 0) >= 2 ? CONNECTED : UNCONNECTED

    const bend      = (key: string) => scene.getBendpoint(key) !== null
    const wireMarks = items.flatMap(item => item.type === 'wire' ? item.ends.flatMap((point, i) => {
        const key = keyOf(item.modelIndex, `connector${i}`)
        return bend(key) ? [] : [{ key, box: null, point, radius: item.width * 0.75, ...netlist.index.has(key) ? state(key) : UNCONNECTED }]
    }) : [])

    const parts     = new Set(items.flatMap(item => item.type === 'part' ? [item.modelIndex] : []))
    const partMarks = [...parts].flatMap(modelIndex => scene.getKeys(modelIndex).filter(key => linked.has(netlist.index.get(key) ?? -1)).map(key => ({ key, box: scene.getConnectorBox(key), point: null, radius: 0, ...state(key) })))

    return [...partMarks, ...wireMarks]
}

// JUNÇÃO DO ESQUEMÁTICO: TRÊS OU MAIS PONTAS DE FIO NO MESMO CONECTOR (SPEC 02 §4.1)
const getJunctions = (scene: Scene, items: (PartItem | WireItem | NoteItem)[]) => scene.view !== 'schematicView' ? [] : items.flatMap(item => item.type === 'wire' ? item.ends.flatMap((point, i) => {
    const key   = keyOf(item.modelIndex, `connector${i}`)
    const ends  = [key, ...scene.getPartners(key).filter(partner => scene.isWire(owner(partner)))]
    const first = ends.slice().sort()[0] === key
    return ends.length >= 3 && first ? [{ point, radius: (item.width + 1) / 2 }] : []
}) : [])

const getLabels = (scene: Scene, shown: string[]): LabelItem[] => shown.flatMap(modelIndex => {
    const label = scene.getView(modelIndex)?.label

    if (!label?.visible || scene.isWire(modelIndex))
        return []

    return [{ modelIndex, x: label.x, y: label.y, size: labelPx(label.size), color: scene.view === 'pcbView' && scene.getView(modelIndex)?.bottom ? SILK_BOTTOM : '#000000', font: LABEL_FONTS[scene.view as View], lines: scene.getLabelLines(modelIndex), box: scene.getLabelBox(modelIndex), rect: scene.getLabelRect(modelIndex), matrix: scene.getLabelMatrix(modelIndex) }]
})

// LISTA DE DESENHO DE UMA VISTA: PEÇAS E FIOS EM ORDEM DE z, RATSNEST, ESTADO DOS CONECTORES, JUNÇÕES E RÓTULOS; A CAIXA TOTAL INCLUI OS RÓTULOS
export const getDrawing = (scene: Scene, netlist: Netlist | null, byLength = false): Drawing => {
    const shown  = Object.values(scene.doc.instances).filter(instance => scene.isShown(instance)).map(instance => instance.modelIndex)
    const items  = shown.flatMap(modelIndex => getItem(scene, modelIndex, byLength)).sort((a, b) => a.z - b.z)
    const marks  = netlist ? getMarks(scene, netlist, items) : []
    const labels = getLabels(scene, shown)
    return { items, ratsnest: netlist ? getRatsnest(scene, netlist) : [], marks, junctions: getJunctions(scene, items), labels, bounds: unionBoxes([...shown.map(modelIndex => scene.getBounds(modelIndex)), ...labels.map(label => label.box)]) }
}

const findById = (root: XmlElement, id: string) => {
    let found: XmlElement | undefined
    walk(root, element => found = found ?? (element.getAttribute('id') === id ? element : undefined))
    return found
}

// ESTILO EM LINHA DAS PROPRIEDADES DE PINTURA VIRA ATRIBUTO, PARA A COR DA CAMADA PREVALECER
const liftStyle = (element: XmlElement) => {
    const kept = (element.getAttribute('style') ?? '').split(';').filter(item => {
        const [name, ...value] = item.split(':')

        if (!STYLE_ATTRIBUTES.includes(name.trim()) || !value.length)
            return item.trim() !== ''

        element.setAttribute(name.trim(), value.join(':').trim())
        return false
    })

    if (kept.length)
        return element.setAttribute('style', kept.join(';'))

    element.removeAttribute('style')
}

// COR FORÇADA DA CAMADA NA PCB: TRAÇO SE HÁ stroke OU id, PREENCHIMENTO SE HÁ fill, O QUE JÁ É PRETO FICA (SPEC 01 §3.3)
const recolor = (element: XmlElement, color: string) => {
    liftStyle(element)
    const stroke = element.getAttribute('stroke') ?? ''
    const fill   = element.getAttribute('fill') ?? ''
    const black  = stroke && fill ? BLACK.has(stroke) && BLACK.has(fill) : BLACK.has(stroke || fill)

    if (!black && (stroke || element.getAttribute('id')) && stroke !== 'none')
        element.setAttribute('stroke', color)

    if (!black && fill && fill !== 'none')
        element.setAttribute('fill', color)

    childrenOf(element).forEach(child => recolor(child, color))
}

const runBox = ({ d }: TextRun) => {
    const numbers = d.match(/-?[\d.]+/g)?.map(Number) ?? []    // getPath SÓ EMITE PARES x y ABSOLUTOS
    return boxOf(Array.from({ length: numbers.length / 2 }, (_, k): Point => [numbers[2 * k], numbers[2 * k + 1]]))
}

const ancestors = (element: XmlElement): XmlElement[] => element.parentNode?.nodeType === 1 ? [element.parentNode as XmlElement, ...ancestors(element.parentNode as XmlElement)] : []

// BLOCO QUE SE ENDIREITA JUNTO: O GRUPO label DE VÁRIAS LINHAS QUE CONTÉM O <text>, OU O PRÓPRIO <text>
const blockOf = (text: XmlElement) => ancestors(text).find(node => tagOf(node) === 'g' && node.getAttribute('id') === 'label') ?? text

// TRANSFORMAÇÃO DE CADA <text>: A ESCALA upright EM TORNO DO CENTRO DA CAIXA DO SEU BLOCO, NAS COORDENADAS DO PAI DO <text>
const getTurns = (runs: Map<XmlElement, TextRun[]>, [sx, sy]: Point) => {
    const boxes = new Map<XmlElement, Box | null>()

    runs.forEach((list, word) => {
        const box = unionBoxes(list.map(runBox))
        boxes.set(blockOf(word), unionBoxes([boxes.get(blockOf(word)) ?? null, box && mapBox(parseTransform(word.getAttribute('transform')), box)]))
    })

    return (word: XmlElement) => {
        const box = boxes.get(blockOf(word))
        return box ? `matrix(${sx} 0 0 ${sy} ${(1 - sx) * (box[0] + box[2]) / 2} ${(1 - sy) * (box[1] + box[3]) / 2})` : ''
    }
}

// TEXTO EM CONTORNO COM AS FONTES DO FRITZING: O GRUPO HERDA PINTURA E TRANSFORMAÇÃO DO <text>, PRECEDIDA DO ENDIREITAMENTO, CADA <tspan> A SUA; COMO NO QtSvg, TEXTO SÓ TEM PREENCHIMENTO
const outlineText = (text: XmlElement, runs: TextRun[], turn: string) => {
    const doc  = text.ownerDocument
    const copy = (from: XmlElement, to: XmlElement) => Array.from({ length: from.attributes.length }, (_, i) => from.attributes[i]).filter(attribute => !TEXT_ONLY.has(attribute.name)).forEach(attribute => to.setAttribute(attribute.name, attribute.value))

    if (!runs.length || !doc)
        return

    const group = doc.createElementNS(SVG_NS, 'g')
    copy(text, group)
    group.setAttribute('stroke', 'none')

    if (turn)
        group.setAttribute('transform', `${turn} ${text.getAttribute('transform') ?? ''}`.trim())

    runs.forEach(run => {
        const path = doc.createElementNS(SVG_NS, 'path')

        if (run.element !== text)
            copy(run.element, path)

        path.setAttribute('d', run.d)
        path.setAttribute('stroke', 'none')
        group.appendChild(path)
    })
    text.parentNode?.replaceChild(group, text)
}

// SÓ A SUBÁRVORE DO GRUPO DA CAMADA, COM OS ANCESTRAIS (E SUAS TRANSFORMAÇÕES) E AS DEFINIÇÕES (SPEC 01 §3.3)
const keepLayer = (root: XmlElement, group: XmlElement) => {
    const path = new Set<unknown>()

    for (let node: XmlElement | null = group; node; node = node.parentNode as XmlElement | null)
        path.add(node)

    const prune = (element: XmlElement): void => childrenOf(element).forEach(child => {
        if (child === group || KEPT_TAGS.has(tagOf(child)))
            return

        if (path.has(child))
            return prune(child)

        element.removeChild(child)
    })

    prune(root)
}

export type ImageOptions = { hidden?: string[], paint?: [string, string][], texts?: [string, string][], fonts?: Fonts, upright?: Point, layer?: string, recolor?: [string, string][] }

// SVG DA PEÇA COMO IMAGEM: VIEWBOX RESOLVIDO, SEM PERNAS ELÁSTICAS NEM CAMADAS OCULTAS, COM CORES PARAMÉTRICAS, SÓ A CAMADA PEDIDA, COR DA CAMADA E TEXTO EM CONTORNO, ENDIREITADO NO ESQUEMÁTICO (SPEC 01 §2.4, §3.3, §3.8)
export const getImageText = (part: Part, svg: SvgFile, view: ViewName, { hidden = [], paint = [], texts = [], fonts = new Map(), upright = [1, 1], layer = '', recolor: colors = [] }: ImageOptions = {}) => {
    const root    = parseXml(svg.text)

    if (!root)
        return svg.text

    const legs    = view === 'breadboardView' ? part.connectors.flatMap(connector => (connector.views.breadboardView ?? []).map(pin => pin.legId)).filter(Boolean) : []
    const removed = new Set([...legs, ...hidden])
    const kept    = layer ? findById(root, layer) : undefined
    const found: XmlElement[] = []
    const words: XmlElement[] = []

    if (kept)
        keepLayer(root, kept)

    walk(root, element => {
        const id = element.getAttribute('id') ?? ''

        if (removed.has(id) && element !== kept)
            found.push(element)

        if (tagOf(element) === 'text')
            words.push(element)

        const color = paint.find(([target]) => target.endsWith('_') ? id.startsWith(target) : id === target)?.[1]
        const text  = texts.find(([target]) => id === target)?.[1]

        if (color)
            element.setAttribute('fill', color)

        if (text !== undefined)
            element.textContent = text
    })

    found.forEach(element => element.parentNode?.removeChild(element))
    colors.forEach(([id, color]) => {
        const group = findById(root, id)

        if (group)
            recolor(group, color)
    })
    const runs   = new Map(words.map(word => [word, getTextRuns(svg, word, fonts)]))
    const turnOf = upright[0] === 1 && upright[1] === 1 ? () => '' : getTurns(runs, upright)
    words.forEach(word => outlineText(word, runs.get(word) ?? [], turnOf(word)))
    root.setAttribute('xmlns', SVG_NS)
    root.setAttribute('width', String(svg.width))
    root.setAttribute('height', String(svg.height))
    root.setAttribute('viewBox', svg.viewBox.join(' '))
    root.setAttribute('preserveAspectRatio', 'none')
    return serializeXml(root)
}
