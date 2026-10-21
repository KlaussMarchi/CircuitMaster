import { IDENTITY, apply, boxesTouch, cubicAt, distance, invert, lerp, multiply, nearestOnCubic, nearestOnSegment, splitCubic, translate, unionBoxes, type Box, type Matrix, type Point } from '../../core/Geometry'
import { addEdges, addInstance, getTitle, keyOf, removeEdges, removeInstance, splitKey, updateInstance, updateView, WIRE_FLAGS, type Doc, type Edge } from '../../core/Document'
import { VIEWS, getLayerZ, type ViewName } from '../../core/Layer'
import type { Library } from '../../core/Library'
import { getStrips, logoTextSvg } from '../../core/Generator'
import type { ConnectorState, Instance, InstanceView, Label } from '../../core/Sketch'
import type { FillFragment } from '../../core/Fill'
import type { End, Plan } from '../../core/Router'
import { Scene, WIRE_STYLE, labelPx, owner } from '../Scene'
import { FREE_ROUTE, getPath, isAxisAligned, simplifyPath } from '../Path'

type View = typeof VIEWS[number]

export type ZMode     = 'front' | 'forward' | 'backward' | 'back'
export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'
export type Clipboard = { instances: Instance[], edges: Edge[] }
export type WireEnd   = { keys: string[], wire: string | null, point: Point }

const HIDDEN_WIRE_MILS = 11.1111
const Z_STEP           = 1e-5    // ORDEM DE CRIAÇÃO DENTRO DA CAMADA
const CURVE_LIMIT      = 0.1     // PARÂMETRO MÍNIMO DO PONTO AGARRADO AO CURVAR UM FIO
const AUTOROUTABLE     = 32
const STRONG           = 1000    // CAPACIDADE DO QUE É VISÍVEL NA VISTA (SPEC 02 §4.10)
const LINK_COST        = 2       // LIGAÇÃO INVISÍVEL CUSTA MAIS QUE O FIO INVISÍVEL: CORTA-SE O FIO, NÃO A PONTA
const ALIGNED          = 1e-3    // PX: TRECHO HORIZONTAL OU VERTICAL A MENOS DO ARREDONDAMENTO DOS SVG
const TRACE_COLORS: Record<string, string> = { copper1trace: '#f2c600', copper0trace: '#f28a00' }
const LABEL_STYLE: Record<View, { size: number, visible: boolean }> = { breadboardView: { size: 9, visible: false }, schematicView: { size: 5, visible: true }, pcbView: { size: 5, visible: true } }
const LABELED_KINDS = ['part', 'jumper', 'symbol', 'breadboard', 'board', 'resizableBoard']
const OBSTACLES     = new Set(['part', 'symbol'])

const isCompatible = (a: string, b: string) => a !== 'unknown' && b !== 'unknown' && (a === 'wire' || b === 'wire' || a !== b)

const mapViews = (instance: Instance, change: (state: InstanceView, view: ViewName) => InstanceView): Instance => ({ ...instance, views: Object.fromEntries(Object.entries(instance.views).map(([view, state]) => [view, change(state, view as ViewName)])) })

const shiftLabel = (label: Label | null, dx: number, dy: number) => label && { ...label, x: label.x + dx, y: label.y + dy }

const withEnds = (state: InstanceView, a: Point, b: Point, curve: Point[] | null): InstanceView => ({
    ...state,
    geometry: { ...state.geometry, x: a[0], y: a[1], line: [0, 0, b[0] - a[0], b[1] - a[1]] },
    wire: state.wire && { ...state.wire, bezier: curve ? [curve[0][0] - a[0], curve[0][1] - a[1], curve[1][0] - a[0], curve[1][1] - a[1]] : null }
})

const endsOf = (state: InstanceView): [Point, Point] => {
    const { x, y, line } = state.geometry
    const [x1, y1, x2, y2] = line ?? [0, 0, 0, 0]
    return [[x + x1, y + y1], [x + x2, y + y2]]
}

const curveOf = (state: InstanceView): Point[] | null => {
    const bezier = state.wire?.bezier
    return bezier ? [[state.geometry.x + bezier[0], state.geometry.y + bezier[1]], [state.geometry.x + bezier[2], state.geometry.y + bezier[3]]] : null
}

// PONTA DE FIO NUM PONTO NOVO; OS PONTOS DE CONTROLE DA CURVA FICAM ONDE ESTÃO NA CENA
const moveEnd = (state: InstanceView, connectorId: string, point: Point) => {
    const [p0, p1] = endsOf(state)
    return connectorId === 'connector0' ? withEnds(state, point, p1, curveOf(state)) : withEnds(state, p0, point, curveOf(state))
}

export const setWireEnds = (doc: Doc, view: ViewName, ends: [string, Point][]) => ends.reduce((current, [key, point]) => updateView(current, view, owner(key), state => moveEnd(state, splitKey(key)[1], point)), doc)

// PERNA ELÁSTICA COM A PONTA NUM PONTO DA CENA; CRIA O ESTADO DO CONECTOR A PARTIR DA LINHA DO SVG (SPEC 01 §3.8)
export const setLegEnd = (doc: Doc, library: Library, view: ViewName, key: string, point: Point) => {
    const scene                     = new Scene(doc, library, view)
    const [modelIndex, connectorId] = splitKey(key)
    const pin                       = scene.getPins(modelIndex).get(connectorId)
    const m                         = scene.getMatrix(modelIndex)

    if (!pin?.leg || !m)
        return doc

    const local = apply(invert(m), point[0], point[1])

    return updateView(doc, view, modelIndex, state => {
        const current = state.connectors.find(connector => connector.id === connectorId)
        const base    = current ?? { id: connectorId, layer: state.layer, x: pin.leg?.p1[0] ?? 0, y: pin.leg?.p1[1] ?? 0, leg: null, connects: [], groundFillSeed: false }
        const points  = base.leg?.points ?? [[0, 0], [(pin.leg?.p2[0] ?? 0) - base.x, (pin.leg?.p2[1] ?? 0) - base.y]]
        const leg     = { points: [...points.slice(0, -1), [local[0] - base.x, local[1] - base.y] as Point], beziers: base.leg?.beziers ?? points.map(() => null) }
        const next    = { ...base, leg }
        return { ...state, connectors: current ? state.connectors.map(connector => connector.id === connectorId ? next : connector) : [...state.connectors, next] }
    })
}

const changeLeg = (doc: Doc, library: Library, view: ViewName, key: string, change: (points: Point[], local: (point: Point) => Point) => Point[]) => {
    const scene                     = new Scene(doc, library, view)
    const [modelIndex, connectorId] = splitKey(key)
    const m                         = scene.getMatrix(modelIndex)
    const state                     = scene.getView(modelIndex)?.connectors.find(connector => connector.id === connectorId)
    const seeded                    = state?.leg ? doc : setLegEnd(doc, library, view, key, scene.getTerminal(key) ?? [0, 0])
    const seed                      = seeded.instances[modelIndex]?.views[view]?.connectors.find(connector => connector.id === connectorId)

    if (!m || !seed?.leg)
        return doc

    const local  = (point: Point): Point => {
        const [x, y] = apply(invert(m), point[0], point[1])
        return [x - seed.x, y - seed.y]
    }
    const points = change(seed.leg.points, local)
    const leg    = { points, beziers: points.map((_, i) => seed.leg?.beziers[i] ?? null) }
    return updateView(seeded, view, modelIndex, current => ({ ...current, connectors: current.connectors.map(connector => connector.id === connectorId ? { ...connector, leg } : connector) }))
}

export const insertLegPoint = (doc: Doc, library: Library, view: ViewName, key: string, point: Point) => changeLeg(doc, library, view, key, (points, local) => {
    const target  = local(point)
    const nearest = points.slice(1).map((end, i) => distance(lerp(points[i], end, nearestOnSegment(points[i], end, target)), target))
    const segment = nearest.indexOf(Math.min(...nearest))
    return [...points.slice(0, segment + 1), target, ...points.slice(segment + 1)]
})

export const removeLegPoint = (doc: Doc, library: Library, view: ViewName, key: string, point: Point) => changeLeg(doc, library, view, key, (points, local) => {
    const target = local(point)
    const inner  = points.slice(1, -1).map(vertex => distance(vertex, target))
    const index  = inner.indexOf(Math.min(...inner)) + 1
    return inner.length ? points.filter((_, i) => i !== index) : points
})

// MOVE AS INSTÂNCIAS NA VISTA; FIOS LIGADOS ACOMPANHAM AS PONTAS E, COM stretch, PERNAS PRESAS FICAM ONDE ESTÃO (SPEC 02 §3.2–3.3)
export const moveInstances = (doc: Doc, library: Library, view: ViewName, moved: string[], dx: number, dy: number, stretch = false) => {
    const before  = new Scene(doc, library, view)
    const touched = new Set(moved)
    const shifted = moved.reduce((current, modelIndex) => updateView(current, view, modelIndex, state => ({ ...state, geometry: { ...state.geometry, x: state.geometry.x + dx, y: state.geometry.y + dy }, label: shiftLabel(state.label, dx, dy) })), doc)
    const pinned  = moved.flatMap(modelIndex => before.getKeys(modelIndex).filter(key => before.getLegPoints(key) && before.getPartners(key).some(partner => !touched.has(owner(partner)))))
    const legs    = stretch ? pinned.reduce((current, key) => setLegEnd(current, library, view, key, before.getTerminal(key) ?? [0, 0]), shifted) : shifted
    const scene   = new Scene(legs, library, view)
    const partner = (wireKey: string) => before.getPartners(wireKey).find(key => !scene.isWire(owner(key)))
    const wires   = Object.values(legs.instances).filter(instance => scene.isWire(instance.modelIndex) && !touched.has(instance.modelIndex))

    return wires.reduce((current, wire) => {
        const ends   = ['connector0', 'connector1'].map(id => [keyOf(wire.modelIndex, id), partner(keyOf(wire.modelIndex, id))] as const)
        const move   = ends.filter(([, target]) => target && touched.has(owner(target))).map(([key, target]): [string, Point] => [key, scene.getTerminal(target ?? '') ?? [0, 0]])
        const before = scene.getWireEnds(wire.modelIndex)
        const shift  = move.map(([key, point]) => [point[0] - (before?.[key.endsWith('connector0') ? 0 : 1][0] ?? 0), point[1] - (before?.[key.endsWith('connector0') ? 0 : 1][1] ?? 0)])
        const rigid  = move.length === 2 && Math.abs(shift[0][0] - shift[1][0]) < 1e-9 && Math.abs(shift[0][1] - shift[1][1]) < 1e-9

        if (rigid)
            return updateView(current, view, wire.modelIndex, state => ({ ...state, geometry: { ...state.geometry, x: state.geometry.x + shift[0][0], y: state.geometry.y + shift[0][1] } }))

        return move.length ? setWireEnds(current, view, move) : current
    }, legs)
}

// ENCAIXE PINO-FURO NA PROTOBOARD AO SOLTAR (SPEC 02 §3.1–3.2)
export const snapConnections = (doc: Doc, library: Library, moved: string[]) => {
    const scene    = new Scene(doc, library, 'breadboardView')
    const movedSet = new Set(moved)
    const typeOf   = (key: string) => scene.getConnector(key)?.type ?? 'unknown'
    const isPart   = (key: string) => !scene.isWire(owner(key))
    const loose    = removeEdges(doc, ([a, b]) => isPart(a) && isPart(b) && movedSet.has(owner(a)) !== movedSet.has(owner(b)) && (typeOf(movedSet.has(owner(a)) ? b : a) === 'female'))
    const others   = Object.values(doc.instances).filter(instance => !movedSet.has(instance.modelIndex) && !scene.isWire(instance.modelIndex) && scene.isShown(instance))
    const targets  = others.flatMap(instance => scene.getKeys(instance.modelIndex).map(key => ({ key, box: scene.getConnectorBox(key), z: scene.getView(instance.modelIndex)?.geometry.z ?? 0, type: typeOf(key) })))

    const edges = moved.filter(modelIndex => !scene.isWire(modelIndex)).flatMap(modelIndex => scene.getKeys(modelIndex).flatMap((key): Edge[] => {
        const point = scene.getTerminal(key)
        const type  = typeOf(key)
        const hits  = point ? targets.filter(target => target.box && point[0] >= target.box[0] && point[0] <= target.box[2] && point[1] >= target.box[1] && point[1] <= target.box[3] && isCompatible(type, target.type)) : []
        const best  = hits.sort((a, b) => (a.type === 'female' ? 0 : 1) - (b.type === 'female' ? 0 : 1) || b.z - a.z)[0]
        return best ? [[key, best.key]] : []
    }))

    return addEdges(loose, edges)
}

// PONTA DE FIO OU DE PERNA SOLTA: LIGA NO CONECTOR QUE TOCA A CAIXA DA PONTA, PREFERINDO PEÇA A FIO, MAIOR z, O MAIS PRÓXIMO (SPEC 02 §3.1)
export const connectEnd = (doc: Doc, library: Library, view: ViewName, key: string) => {
    const scene  = new Scene(doc, library, view)
    const point  = scene.getTerminal(key)
    const self   = owner(key)
    const linked = new Set(scene.getPartners(key))
    const leg    = !scene.isWire(self)
    const type   = scene.getConnector(key)?.type ?? 'unknown'

    if (!point)
        return doc

    const probe      = scene.getConnectorBox(key) ?? [point[0], point[1], point[0], point[1]]
    const candidates = Object.values(doc.instances).filter(instance => instance.modelIndex !== self && scene.isShown(instance) && !(leg && scene.isWire(instance.modelIndex))).flatMap(instance => scene.getKeys(instance.modelIndex).map(target => ({ target, box: scene.getConnectorBox(target), wire: scene.isWire(instance.modelIndex), z: scene.getView(instance.modelIndex)?.geometry.z ?? 0 })))
    const hits       = candidates.filter(({ target, box }) => box && !linked.has(target) && box[0] <= probe[2] && probe[0] <= box[2] && box[1] <= probe[3] && probe[1] <= box[3] && isCompatible(leg ? type : 'wire', scene.getConnector(target)?.type ?? 'unknown'))
    const center     = (box: number[] | null) => box ? distance([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2], point) : Infinity
    const best       = hits.sort((a, b) => Number(a.wire) - Number(b.wire) || b.z - a.z || center(a.box) - center(b.box))[0]

    if (!best)
        return doc

    const linkedDoc = addEdges(doc, [[key, best.target]])
    const terminal  = scene.getTerminal(best.target) ?? point
    return leg ? setLegEnd(linkedDoc, library, view, key, terminal) : setWireEnds(linkedDoc, view, [[key, terminal]])
}

// ITENS QUE ACOMPANHAM O ARRASTE: PEÇAS PLUGADAS NOS CONECTORES FÊMEA (RECURSIVO) E, COM STICKY LIGADO, AS APOIADAS NA BASE (SPEC 02 §3.2)
export const getCarried = (doc: Doc, library: Library, view: ViewName, modelIndex: string) => {
    const scene   = new Scene(doc, library, view)
    const carried = new Set([modelIndex])
    const queue   = [modelIndex]

    const stuck = (base: string) => {
        const part   = library.getPart(doc.instances[base]?.moduleIdRef ?? '')
        const bounds = scene.getBounds(base)
        const z      = scene.getView(base)?.geometry.z ?? 0

        if (!part?.views[view]?.sticky.length || !bounds || doc.instances[base]?.properties.sticky !== 'true')
            return []

        return Object.values(doc.instances).filter(instance => {
            const box    = scene.getBounds(instance.modelIndex)
            const center = box ? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2] : null
            return !scene.isWire(instance.modelIndex) && (scene.getView(instance.modelIndex)?.geometry.z ?? 0) > z && center && center[0] > bounds[0] && center[0] < bounds[2] && center[1] > bounds[1] && center[1] < bounds[3]
        }).map(instance => instance.modelIndex)
    }

    while (queue.length) {
        const current = queue.pop() ?? ''
        const females = scene.getKeys(current).filter(key => scene.getConnector(key)?.type === 'female')
        const plugged = females.flatMap(key => scene.getPartners(key)).map(owner).filter(index => !scene.isWire(index) && doc.instances[index] && scene.isShown(doc.instances[index]))

        for (const index of [...plugged, ...stuck(current)]) {
            if (!carried.has(index) && !scene.getView(index)?.locked) {
                carried.add(index)
                queue.push(index)
            }
        }
    }

    return [...carried]
}

// INSTÂNCIA DE FIO DO TIPO DA VISTA home, COM AS PONTAS DADAS EM CADA VISTA (INVISÍVEL FORA DE home)
const newWire = (doc: Doc, home: View, ends: (view: View) => [Point, Point]): Instance => {
    const modelIndex = String(doc.nextIndex)
    const views      = Object.fromEntries(VIEWS.map(view => {
        const [a, b] = ends(view)
        const style  = WIRE_STYLE[view]
        const z      = getLayerZ(view, style.layer) + doc.nextIndex * Z_STEP
        const mils   = view === home ? style.mils : HIDDEN_WIRE_MILS
        const state: InstanceView = {
            layer: style.layer,
            locked: false,
            bottom: false,
            geometry: { x: a[0], y: a[1], z, transform: null, line: [0, 0, b[0] - a[0], b[1] - a[1]], wireFlags: WIRE_FLAGS[home], size: null },
            wire: { mils, color: style.color, opacity: 1, banded: false, bezier: null },
            connectors: [],
            label: null,
            hidden: []
        }
        return [view, state]
    }))

    return { moduleIdRef: 'WireModuleID', modelIndex, path: 'wire.fzp', title: `Wire${modelIndex}`, text: '', properties: {}, localConnectors: {}, views }
}

// FIO NOVO DO TIPO DA VISTA: SEGUNDA PONTA NUM CONECTOR OU SOLTA NUM PONTO DA CENA (SPEC 02 §4.1)
export const createWire = (doc: Doc, library: Library, home: View, from: string, to: string | null, end: Point | null = null) => {
    const modelIndex = String(doc.nextIndex)
    const wire       = newWire(doc, home, view => {
        const scene = new Scene(doc, library, view)
        const a     = scene.getTerminal(from) ?? end ?? [0, 0]
        return [a, (to ? scene.getTerminal(to) : view === home ? end : null) ?? a]
    })

    return addEdges(addInstance(doc, wire), [[keyOf(modelIndex, 'connector0'), from], ...(to ? [[keyOf(modelIndex, 'connector1'), to] as Edge] : [])])
}

// FIO DE VÁRIOS TRECHOS PELOS PONTOS DA VISTA home: UMA INSTÂNCIA POR TRECHO, LIGADAS NAS DOBRAS, A PRIMEIRA PONTA EM CADA from E A ÚLTIMA EM CADA to (VAZIO = SOLTA); NAS OUTRAS VISTAS O PRIMEIRO TRECHO LIGA OS CONECTORES E OS DEMAIS FICAM NO PONTO FINAL (SPEC 02 §4.1)
export const createWires = (doc: Doc, library: Library, home: View, from: string[], to: string[], points: Point[]) => {
    const path    = simplifyPath(points)
    const scenes  = Object.fromEntries(VIEWS.map(view => [view, new Scene(doc, library, view)])) as Record<View, Scene>
    const indexes = path.slice(1).map((_, i) => String(doc.nextIndex + i))

    const far = (view: View): [Point, Point] => {
        const a = (from.length ? scenes[view].getTerminal(from[0]) : null) ?? path[0]
        return [a, (to.length ? scenes[view].getTerminal(to[0]) : null) ?? a]
    }

    const placed = path.slice(1).reduce((current, point, i) => addInstance(current, newWire(current, home, view => view === home ? [path[i], point] : i === 0 ? far(view) : [far(view)[1], far(view)[1]])), doc)
    const joints = indexes.slice(1).map((index, i): Edge => [keyOf(indexes[i], 'connector1'), keyOf(index, 'connector0')])
    const ends   = indexes.length ? [...from.map((key): Edge => [keyOf(indexes[0], 'connector0'), key]), ...to.map((key): Edge => [keyOf(indexes[indexes.length - 1], 'connector1'), key])] : []
    return { doc: addEdges(placed, [...joints, ...ends]), indexes }
}

// FIO DESENHADO NA VISTA: TERMINA NOS CONECTORES DO ALVO, NUMA JUNÇÃO EM T NO MEIO DE OUTRO FIO (QUE É DIVIDIDO NO PONTO) OU SOLTO
export const drawWires = (doc: Doc, library: Library, view: View, from: string[], end: WireEnd | null, points: Point[]) => {
    const split = end?.wire ? splitWire(doc, view, end.wire, end.point) : null
    const to    = split?.bend ?? end?.keys ?? []
    return createWires(split?.bend ? split.doc : doc, library, view, from, to, points)
}

// O QUE O CAMINHO DE UM FIO NOVO EVITA NA VISTA: CORPOS, RÓTULOS E TERMINAIS DE PEÇAS E SÍMBOLOS VISÍVEIS E OS TRECHOS DE FIO
export const getObstacles = (scene: Scene) => {
    const shown = Object.values(scene.doc.instances).filter(instance => scene.isShown(instance))
    const parts = shown.filter(instance => OBSTACLES.has(scene.library.getPart(instance.moduleIdRef)?.kind ?? ''))
    return {
        boxes: parts.flatMap(instance => [scene.getBounds(instance.modelIndex), scene.getLabelBox(instance.modelIndex)]).filter((box): box is Box => box !== null),
        wires: shown.filter(instance => scene.isWire(instance.modelIndex)).map(instance => scene.getWireEnds(instance.modelIndex)).filter((ends): ends is [Point, Point] => ends !== null),
        pins: parts.flatMap(instance => scene.getKeys(instance.modelIndex).map(key => scene.getTerminal(key))).filter((point): point is Point => point !== null)
    }
}

// FIO ENTRE DOIS CONECTORES PELO CAMINHO ORTOGONAL (A 45° NA PCB), SAINDO E CHEGANDO PELA DIREÇÃO DOS PINOS; SEM ROTA, RETO
export const connectByPath = (doc: Doc, library: Library, view: View, from: string, to: string, grid: number, routed: boolean) => {
    const scene = new Scene(doc, library, view)
    const a     = scene.getTerminal(from)
    const b     = scene.getTerminal(to)

    if (!a || !b)
        return createWires(doc, library, view, [from], [to], [[0, 0], [0, 0]])

    const corners = routed ? getPath(a, b, { ...getObstacles(scene), start: scene.getHeading(from), end: scene.getHeading(to), axis: null, grid, diagonal: view === 'pcbView' }) : []
    return createWires(doc, library, view, [from], [to], [a, ...corners, b])
}

// TRECHO NOVO COM O ESTILO DO FIO DADO, DE a ATÉ b NA VISTA; NAS OUTRAS VISTAS REPETE A GEOMETRIA INVISÍVEL DO ORIGINAL
const copyWire = (doc: Doc, view: ViewName, wireIndex: string, a: Point, b: Point): Instance | null => {
    const instance = doc.instances[wireIndex]
    const index    = String(doc.nextIndex)
    const copy     = instance && mapViews(instance, (state, name) => name === view ? withEnds({ ...state, geometry: { ...state.geometry, z: state.geometry.z + Z_STEP }, connectors: [] }, a, b, null) : { ...state, connectors: [] })
    return copy && { ...copy, modelIndex: index, title: `Wire${index}` }
}

// O FIO VIRA UMA CADEIA PELOS PONTOS DA VISTA, DE connector0 A connector1, MANTENDO AS LIGAÇÕES DAS DUAS PONTAS; A PONTA keep FICA NA INSTÂNCIA ORIGINAL
export const reshapeWire = (doc: Doc, view: ViewName, wireIndex: string, points: Point[], keep = 0) => {
    const path = simplifyPath(points)

    if (!doc.instances[wireIndex] || path.length < 2)
        return doc

    if (path.length === 2)
        return updateView(doc, view, wireIndex, state => withEnds(state, path[0], path[1], null))

    const segments = path.slice(1).map((point, i): [Point, Point] => [path[i], point])
    const own      = keep === 0 ? 0 : segments.length - 1
    const moving   = keyOf(wireIndex, keep === 0 ? 'connector1' : 'connector0')
    const carried  = doc.edges.filter(edge => edge.includes(moving)).map(([a, b]) => a === moving ? b : a)
    const first    = updateView(removeEdges(doc, edge => edge.includes(moving)), view, wireIndex, state => withEnds(state, ...segments[own], null))
    const indexes  = segments.map((_, i) => i === own ? wireIndex : String(first.nextIndex + (i > own ? i - 1 : i)))
    const placed   = segments.reduce((current, segment, i) => {
        const copy = i === own ? null : copyWire(current, view, wireIndex, ...segment)
        return copy ? addInstance(current, copy) : current
    }, first)
    const chain    = indexes.slice(1).map((index, i): Edge => [keyOf(indexes[i], 'connector1'), keyOf(index, 'connector0')])
    const outer    = keep === 0 ? keyOf(indexes[indexes.length - 1], 'connector1') : keyOf(indexes[0], 'connector0')
    return addEdges(placed, [...chain, ...carried.map((partner): Edge => [outer, partner])])
}

// PONTO DA PEÇA QUE VAI À GRADE: O PRIMEIRO TERMINAL; SEM CONECTOR, O CANTO DA CAIXA (SPEC 02 §1.2)
export const getAnchor = (scene: Scene, modelIndex: string) => {
    const box = scene.getBounds(modelIndex)
    return scene.getKeys(modelIndex).map(key => scene.getTerminal(key)).find((point): point is Point => point !== null) ?? (box ? [box[0], box[1]] as Point : null)
}

export const getGridShift = (scene: Scene, modelIndex: string, grid: number): Point => {
    const anchor = getAnchor(scene, modelIndex)
    return anchor && grid > 0 ? [Math.round(anchor[0] / grid) * grid - anchor[0], Math.round(anchor[1] / grid) * grid - anchor[1]] : [0, 0]
}

// CADA PEÇA COM O PRIMEIRO TERMINAL NA GRADE; FIOS LIGADOS ACOMPANHAM
export const alignToGrid = (doc: Doc, library: Library, view: ViewName, modelIndexes: string[], grid: number) => modelIndexes.reduce((current, modelIndex) => {
    const scene    = new Scene(current, library, view)
    const [dx, dy] = getGridShift(scene, modelIndex, grid)

    if (scene.isWire(modelIndex) || scene.getView(modelIndex)?.locked || (!dx && !dy))
        return current

    return moveInstances(current, library, view, [modelIndex], dx, dy)
}, doc)

const isHorizontal = ([a, b]: [Point, Point]) => Math.abs(a[1] - b[1]) < ALIGNED

const isVertical = ([a, b]: [Point, Point]) => Math.abs(a[0] - b[0]) < ALIGNED

const isPerpendicular = (segment: [Point, Point], other: [Point, Point]) => isHorizontal(segment) ? isVertical(other) : isVertical(segment) && isHorizontal(other)

// O TRECHO PASSOU A APONTAR AO CONTRÁRIO: UMA PONTA ANDOU PARA ALÉM DA OUTRA
const isReversed = (was: [Point, Point], now: [Point, Point]) => (was[1][0] - was[0][0]) * (now[1][0] - now[0][0]) + (was[1][1] - was[0][1]) * (now[1][1] - now[0][1]) < 0

// TRECHO NOVO ENTRE A PONTA E O QUE ELA TOCAVA: A PONTA VAI PARA to E O TRECHO LIGA from (ONDE FICAM AS LIGAÇÕES ANTIGAS) A ELA
const addJog = (doc: Doc, view: ViewName, key: string, from: Point, to: Point, partners: string[]) => {
    const jog = copyWire(doc, view, owner(key), from, to)

    if (!jog)
        return doc

    const cut   = removeEdges(doc, ([a, b]) => (a === key && partners.includes(b)) || (b === key && partners.includes(a)))
    const moved = setWireEnds(cut, view, [[key, to]])
    return addEdges(addInstance(moved, jog), [...partners.map((partner): Edge => [keyOf(jog.modelIndex, 'connector0'), partner]), [keyOf(jog.modelIndex, 'connector1'), key]])
}

// ARRASTE DE UM TRECHO RETO NA PERPENDICULAR: DOBRA DE CANTO ACOMPANHA, PONTA SOLTA ACOMPANHA, E PONTA EM PEÇA, JUNÇÃO OU VIZINHO NÃO PERPENDICULAR GANHA UM TRECHO NOVO
export const dragSegment = (doc: Doc, library: Library, view: ViewName, wireIndex: string, delta: Point) => {
    const scene = new Scene(doc, library, view)
    const ends  = scene.getWireEnds(wireIndex)

    if (!ends || (!delta[0] && !delta[1]))
        return doc

    return ends.reduce((current, point, i) => {
        const key      = keyOf(wireIndex, `connector${i}`)
        const target   = [point[0] + delta[0], point[1] + delta[1]] as Point
        const partners = scene.getPartners(key)
        const bend     = scene.getBendpoint(key)
        const other    = bend?.length === 2 ? scene.getWireEnds(owner(bend[1])) : null

        if (!partners.length)
            return setWireEnds(current, view, [[key, target]])

        if (bend && other && isPerpendicular(ends, other))
            return setWireEnds(current, view, bend.map((end): [string, Point] => [end, target]))

        return addJog(current, view, key, point, target, partners)
    }, doc)
}

// A CADEIA QUE SAI DO PINO PELA PONTA start ATÉ O PRÓXIMO PINO, JUNÇÃO OU PONTA SOLTA VIRA UM FIO SÓ, REFEITO PELO CAMINHO ORTOGONAL QUE EVITA AS PEÇAS
const rerouteChain = (doc: Doc, library: Library, view: ViewName, start: string, grid: number) => {
    const wire  = owner(start)
    const first = start.endsWith('connector0')
    const far   = keyOf(wire, first ? 'connector1' : 'connector0')
    let joined  = doc

    for (let next = joinWires(doc, library, view, far); next !== joined; next = joinWires(joined, library, view, far))
        joined = next

    const scene  = new Scene(joined, library, view)
    const ends   = scene.getWireEnds(wire)
    const pin    = (key: string) => scene.getPartners(key).find(partner => !scene.isWire(owner(partner)))
    const [s, f] = [pin(start), pin(far)]

    if (!ends)
        return joined

    const [a, b]  = first ? ends : [ends[1], ends[0]]
    const route   = { ...getObstacles(new Scene(removeInstance(joined, wire), library, view)), start: s ? scene.getHeading(s) : null, end: f ? scene.getHeading(f) : null, axis: null, grid, diagonal: false }
    const corners = getPath(a, b, route)
    return reshapeWire(joined, view, wire, first ? [a, ...corners, b] : [b, ...[...corners].reverse(), a], first ? 0 : 1)
}

// FIOS QUE ERAM HORIZONTAIS OU VERTICAIS E FICARAM INCLINADOS OU INVERTIDOS PORQUE UMA PONTA ANDOU: A DOBRA DE CANTO VIZINHA ACOMPANHA NO EIXO DO TRECHO (SE O PINO PASSOU DELA, A CADEIA É REFEITA), A PONTA SOLTA ACOMPANHA A OUTRA, E O RESTO GANHA DOBRAS PELO CAMINHO ORTOGONAL QUE EVITA AS PEÇAS
export const squareWires = (before: Doc, after: Doc, library: Library, view: ViewName, grid: number) => {
    const old    = new Scene(before, library, view)
    const placed = new Scene(after, library, view)
    const wires  = getChangedWires(before, after, view).filter(wireIndex => {
        const was = old.getWireEnds(wireIndex)
        const now = placed.getWireEnds(wireIndex)
        return was && now && old.isShown(after.instances[wireIndex]) && !placed.getWireCurve(wireIndex) && isAxisAligned(...was) && (!isAxisAligned(...now) || isReversed(was, now))
    })
    const blocked = wires.length ? getObstacles(new Scene(wires.reduce((current, wireIndex) => removeInstance(current, wireIndex), after), library, view)) : null

    return wires.reduce((current, wireIndex) => {
        const scene  = new Scene(current, library, view)
        const was    = old.getWireEnds(wireIndex)
        const now    = scene.getWireEnds(wireIndex)
        const moved  = was && now ? [0, 1].filter(i => distance(was[i], now[i]) > ALIGNED) : []

        if (!was || !now || moved.length !== 1 || (isAxisAligned(...now) && !isReversed(was, now)))
            return current

        const [e, f]   = [moved[0], 1 - moved[0]]
        const fKey     = keyOf(wireIndex, `connector${f}`)
        const point    = now[e]
        const fixed    = now[f]
        const kept     = isHorizontal(was) ? [fixed[0], point[1]] as Point : [point[0], fixed[1]] as Point
        const bend     = scene.getBendpoint(fKey)
        const neighbor = bend?.length === 2 ? old.getWireEnds(owner(bend[1])) : null
        const partners = scene.getPartners(fKey)
        const pin      = (key: string) => scene.getPartners(key).find(partner => !scene.isWire(owner(partner)))
        const fromPin  = pin(keyOf(wireIndex, `connector${e}`))
        const toPin    = pin(fKey)

        if (!partners.length)
            return setWireEnds(current, view, [[fKey, [fixed[0] + point[0] - was[e][0], fixed[1] + point[1] - was[e][1]]]])

        const heading = fromPin ? scene.getHeading(fromPin) : null
        const slides  = bend !== null && neighbor !== null && isPerpendicular(was, neighbor)
        const inward  = heading !== null && (kept[0] - point[0]) * heading[0] + (kept[1] - point[1]) * heading[1] < -ALIGNED

        if (slides && inward)
            return rerouteChain(current, library, view, keyOf(wireIndex, `connector${e}`), grid)

        if (slides)
            return setWireEnds(current, view, bend.map((end): [string, Point] => [end, kept]))

        const route   = { ...FREE_ROUTE, ...blocked, start: heading, end: toPin ? scene.getHeading(toPin) : null, grid }
        const corners = getPath(point, fixed, route)
        return reshapeWire(current, view, wireIndex, e === 0 ? [point, ...corners, fixed] : [fixed, ...[...corners].reverse(), point], e)
    }, after)
}

const sameStyle = (a: InstanceView | undefined, b: InstanceView | undefined) => a?.wire && b?.wire && a.wire.color === b.wire.color && a.wire.mils === b.wire.mils && !a.wire.bezier && !b.wire.bezier && a.layer === b.layer

// DOBRAS SIMPLES ENTRE TRECHOS DO MESMO ESTILO QUE FICARAM ALINHADOS (OU COM UM TRECHO NULO) SAEM, UNINDO OS DOIS FIOS
export const tidyWires = (doc: Doc, library: Library, view: ViewName, wireIndexes: string[]) => {
    let current = doc

    for (let pending = [...new Set(wireIndexes)]; pending.length;) {
        const wireIndex = pending.pop() ?? ''
        const scene     = new Scene(current, library, view)
        const ends      = scene.getWireEnds(wireIndex)

        const joint = ends && ['connector0', 'connector1'].map(id => scene.getBendpoint(keyOf(wireIndex, id))).find(bend => {
            const other = bend?.length === 2 ? scene.getWireEnds(owner(bend[1])) : null
            const null0 = other && (distance(...ends) < ALIGNED || distance(...other) < ALIGNED)
            return other && owner(bend?.[1] ?? '') !== wireIndex && sameStyle(scene.getView(wireIndex), scene.getView(owner(bend?.[1] ?? ''))) && (null0 || (isHorizontal(ends) && isHorizontal(other)) || (isVertical(ends) && isVertical(other)))
        })

        const joined = joint ? joinWires(current, library, view, joint[0]) : current

        if (joined === current)
            continue

        current = joined
        pending = [...pending.filter(index => current.instances[index]), wireIndex]
    }

    return current
}

// FIOS CUJA GEOMETRIA NA VISTA MUDOU ENTRE OS DOIS DOCUMENTOS (OU QUE SÃO NOVOS)
export const getChangedWires = (before: Doc, after: Doc, view: ViewName) => Object.values(after.instances).filter(instance => instance.moduleIdRef === 'WireModuleID' && instance.views[view] !== before.instances[instance.modelIndex]?.views[view]).map(instance => instance.modelIndex)

const NOTE_LAYERS: Record<View, string> = { breadboardView: 'breadboardNote', schematicView: 'schematicNote', pcbView: 'pcbNote' }

export const NOTE_SIZE: Point = [140, 45]    // PX, TAMANHO INICIAL DA NOTA (SPEC 02 §10.5)

// NOTA NOVA SÓ NA VISTA CORRENTE, CENTRADA NO PONTO (SPEC 02 §10.5)
export const createNote = (doc: Doc, view: View, point: Point) => {
    const layer = NOTE_LAYERS[view]
    const state: InstanceView = { layer, locked: false, bottom: false, geometry: { x: point[0] - NOTE_SIZE[0] / 2, y: point[1] - NOTE_SIZE[1] / 2, z: getLayerZ(view, layer) + doc.nextIndex * Z_STEP, transform: null, line: null, wireFlags: 0, size: NOTE_SIZE }, wire: null, connectors: [], label: null, hidden: [] }
    return addInstance(doc, { moduleIdRef: 'NoteModuleID', modelIndex: String(doc.nextIndex), path: 'note.fzp', title: getTitle(doc, 'Note'), text: '', properties: {}, localConnectors: {}, views: { [view]: state } })
}

export const setPosition = (doc: Doc, view: ViewName, modelIndex: string, point: Point) => updateView(doc, view, modelIndex, state => ({ ...state, geometry: { ...state.geometry, x: point[0], y: point[1] } }))

export const setNoteSize = (doc: Doc, view: ViewName, modelIndex: string, size: Point) => updateView(doc, view, modelIndex, state => ({ ...state, geometry: { ...state.geometry, size } }))

export const setNoteText = (doc: Doc, modelIndex: string, text: string) => updateInstance(doc, modelIndex, instance => ({ ...instance, text }))

const addTrace = (doc: Doc, home: View, layer: string, a: Point, b: Point, mils: number) => {
    const modelIndex = String(doc.nextIndex)
    const views      = Object.fromEntries(VIEWS.map(view => {
        const own   = view === home
        const style = WIRE_STYLE[view]
        const state: InstanceView = { layer: own ? layer : style.layer, locked: false, bottom: own && layer === 'copper0trace', geometry: { x: a[0], y: a[1], z: getLayerZ(view, own ? layer : style.layer) + doc.nextIndex * Z_STEP, transform: null, line: [0, 0, b[0] - a[0], b[1] - a[1]], wireFlags: WIRE_FLAGS[home] | AUTOROUTABLE, size: null }, wire: { mils: own ? mils : HIDDEN_WIRE_MILS, color: own ? TRACE_COLORS[layer] ?? style.color : style.color, opacity: 1, banded: false, bezier: null }, connectors: [], label: null, hidden: [] }
        return [view, state]
    }))

    return addInstance(doc, { moduleIdRef: 'WireModuleID', modelIndex, path: 'wire.fzp', title: `Wire${modelIndex}`, text: '', properties: {}, localConnectors: {}, views })
}

// VIA NO PONTO: CENTRADA PELO TERMINAL DO SVG GERADO PARA O FURO/ANEL PEDIDO, MARCADA COMO AUTOROTEÁVEL (SPEC 01 §8.11)
const addVia = (doc: Doc, library: Library, point: Point, holeSize: string) => {
    const modelIndex = String(doc.nextIndex)
    const placed     = createInstance(doc, library, 'ViaModuleID', { breadboardView: point, schematicView: point, pcbView: point })
    const sized      = updateInstance(placed, modelIndex, instance => ({ ...instance, properties: { ...instance.properties, 'hole size': holeSize } }))
    const terminal   = new Scene(sized, library, 'pcbView').getTerminal(keyOf(modelIndex, 'connector0')) ?? point
    return updateView(sized, 'pcbView', modelIndex, state => ({ ...state, geometry: { ...state.geometry, x: state.geometry.x + point[0] - terminal[0], y: state.geometry.y + point[1] - terminal[1], wireFlags: AUTOROUTABLE } }))
}

// PLANO DO AUTOROUTER NO DOCUMENTO: CADA TRECHO VIRA TRILHA DA VISTA (PCBTrace OU SchematicTrace) Autoroutable, CADA TROCA DE CAMADA UMA VIA, AS PONTAS LIGADAS CONFORME O PLANO (SPEC 03 §8.2)
export const applyPlan = (doc: Doc, library: Library, view: View, plan: Plan, mils: number, holeSize: string) => {
    const wireBase = doc.nextIndex
    const traced   = plan.wires.reduce((current, wire) => addTrace(current, view, wire.layer, wire.a, wire.b, mils), doc)
    const viaBase  = traced.nextIndex
    const placed   = plan.vias.reduce((current, point) => addVia(current, library, point, holeSize), traced)
    const keyOfEnd = (end: End) => 'key' in end ? end.key : 'via' in end ? keyOf(String(viaBase + end.via), 'connector0') : keyOf(String(wireBase + end.wire), `connector${end.end}`)
    return addEdges(placed, plan.links.map(([a, b]): Edge => [keyOfEnd(a), keyOfEnd(b)]))
}

// DOBRA DE TRILHAS VIRA VIA NO MESMO PONTO: AS PONTAS DEIXAM DE SE LIGAR ENTRE SI E LIGAM NA VIA (SPEC 02 §10.2)
export const bendToVia = (doc: Doc, library: Library, key: string, holeSize: string) => {
    const scene = new Scene(doc, library, 'pcbView')
    const bend  = scene.getBendpoint(key)
    const point = scene.getTerminal(key)

    if (!bend || !point)
        return doc

    const via    = keyOf(String(doc.nextIndex), 'connector0')
    const placed = addVia(removeEdges(doc, ([a, b]) => bend.includes(a) && bend.includes(b)), library, point, holeSize)
    return addEdges(updateView(placed, 'pcbView', owner(via), state => ({ ...state, geometry: { ...state.geometry, wireFlags: 0 } })), bend.map((end): Edge => [end, via]))
}

// VIA COM DUAS OU MAIS TRILHAS DA MESMA FACE VIRA DOBRA: AS PONTAS PASSAM A SE LIGAR ENTRE SI E A VIA SAI (SPEC 02 §10.1)
export const viaToBend = (doc: Doc, library: Library, modelIndex: string) => {
    const scene  = new Scene(doc, library, 'pcbView')
    const ends   = scene.getPartners(keyOf(modelIndex, 'connector0'))
    const layers = new Set(ends.map(end => scene.getView(owner(end))?.layer))

    if (ends.length < 2 || layers.size !== 1 || ends.some(end => !scene.isWire(owner(end))))
        return doc

    return addEdges(removeInstance(doc, modelIndex), ends.flatMap((end, i) => ends.slice(i + 1).map((other): Edge => [end, other])))
}

// APAGA AS TRILHAS E VIAS MARCADAS COMO AUTOROTEÁVEIS NA VISTA, OU SÓ AS QUE TOCAM A ÁREA DA PLACA ROTEADA (SPEC 03 §2.1, §8.2)
export const deleteAutorouted = (doc: Doc, library: Library, view: ViewName, area: Box | null = null) => {
    const scene  = new Scene(doc, library, view)
    const within = (modelIndex: string) => {
        const box = scene.getBounds(modelIndex)
        return !area || (box !== null && boxesTouch(box, area))
    }
    return Object.values(doc.instances).filter(instance => scene.isShown(instance) && ((instance.views[view]?.geometry.wireFlags ?? 0) & AUTOROUTABLE) && (scene.isWire(instance.modelIndex) || library.getPart(instance.moduleIdRef)?.kind === 'via') && within(instance.modelIndex)).reduce((current, instance) => removeInstance(current, instance.modelIndex), doc)
}

// FRAGMENTOS DE PREENCHIMENTO COMO INSTÂNCIAS GroundPlaneModuleID NA FACE, COM AS PROPRIEDADES svg E fillType (SPEC 03 §6.2, PASSO 9)
export const createFills = (doc: Doc, fragments: FillFragment[], frame: Matrix, fillType: string) => fragments.reduce((current, fragment) => {
    const [x, y] = apply(invert(frame), fragment.x, fragment.y)
    const pcb: InstanceView = { layer: fragment.layer, locked: false, bottom: fragment.face === 'bottom', geometry: { x, y, z: getLayerZ('pcbView', fragment.layer) + current.nextIndex * Z_STEP, transform: null, line: null, wireFlags: 0, size: null }, wire: null, connectors: [], label: null, hidden: [] }
    return addInstance(current, { moduleIdRef: 'GroundPlaneModuleID', modelIndex: String(current.nextIndex), path: 'groundplane.fzp', title: getTitle(current, 'Copper Fill'), text: '', properties: { svg: fragment.svg, fillType }, localConnectors: {}, views: { pcbView: pcb } })
}, doc)

const primaryLayer = (view: ViewName, layers: string[]) => view === 'pcbView' ? ['copper0', 'copper1'].find(layer => layers.includes(layer)) ?? layers[0] : layers[0]

const LABEL_LAYERS: Record<View, string> = { breadboardView: 'breadboardLabel', schematicView: 'schematicLabel', pcbView: 'silkscreenLabel' }

// RÓTULO INICIAL: CANTO SUPERIOR DIREITO DA PEÇA, TÍTULO E PROPRIEDADES showInLabel (FORA DA PCB)
const createLabel = (doc: Doc, library: Library, view: View, modelIndex: string, keys: string[], visible: boolean): Label | null => {
    const scene  = new Scene(doc, library, view)
    const state  = scene.getView(modelIndex)
    const svg    = library.getSvg(doc.instances[modelIndex]?.moduleIdRef ?? '', view)
    const style  = LABEL_STYLE[view]
    const height = keys.length * labelPx(style.size)

    if (!state || !svg)
        return null

    const [xOffset, yOffset] = [svg.width, -height]
    return { visible, x: state.geometry.x + xOffset, y: state.geometry.y + yOffset, z: getLayerZ(view, LABEL_LAYERS[view]), xOffset, yOffset, color: '#000000', size: style.size, keys }
}

// PEÇA NOVA NAS TRÊS VISTAS, CENTRADA NO PONTO DADO PARA CADA VISTA (SPEC 02 §1.2)
export const createInstance = (doc: Doc, library: Library, moduleId: string, places: Record<View, Point>) => {
    const part = library.getPart(moduleId)

    if (!part)
        return doc

    const modelIndex = String(doc.nextIndex)
    const views      = Object.fromEntries(VIEWS.filter(view => part.views[view]).map(view => {
        const svg    = library.getSvg(moduleId, view)
        const layer  = primaryLayer(view, part.views[view]?.layers ?? [])
        const [x, y] = [places[view][0] - (svg?.width ?? 0) / 2, places[view][1] - (svg?.height ?? 0) / 2]
        const state: InstanceView = { layer, locked: false, bottom: false, geometry: { x, y, z: getLayerZ(view, layer) + doc.nextIndex * Z_STEP, transform: null, line: null, wireFlags: 0, size: null }, wire: null, connectors: [], label: null, hidden: [] }
        return [view, state]
    }))

    const added   = addInstance(doc, { moduleIdRef: moduleId, modelIndex, path: '', title: getTitle(doc, part.label), text: '', properties: {}, localConnectors: {}, views })
    const labeled = LABELED_KINDS.includes(part.kind)

    return VIEWS.reduce((current, view) => {
        const keys  = view === 'pcbView' ? [''] : ['', ...part.displayKeys]
        const label = labeled ? createLabel(current, library, view, modelIndex, keys, LABEL_STYLE[view].visible && part.kind === 'part') : null
        return label ? updateView(current, view, modelIndex, state => ({ ...state, label })) : current
    }, added)
}

const aroundCenter = (bounds: number[], m: Matrix): Matrix => {
    const [cx, cy] = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2]
    return multiply(translate(cx, cy), multiply(m, translate(-cx, -cy)))
}

const transformInstances = (doc: Doc, library: Library, view: ViewName, modelIndexes: string[], m: Matrix) => {
    const scene   = new Scene(doc, library, view)
    const chosen  = modelIndexes.filter(modelIndex => !scene.isWire(modelIndex) && !scene.getView(modelIndex)?.locked)
    const changed = chosen.reduce((current, modelIndex) => {
        const geometry = current.instances[modelIndex]?.views[view]?.geometry
        const bounds   = scene.getBounds(modelIndex)

        if (!geometry || !bounds)
            return current

        const full = multiply(aroundCenter(bounds, m), multiply(translate(geometry.x, geometry.y), geometry.transform ?? IDENTITY))
        const next = multiply(translate(-geometry.x, -geometry.y), full).map(value => Math.round(value * 1e12) / 1e12) as Matrix
        return updateView(current, view, modelIndex, state => ({ ...state, geometry: { ...state.geometry, transform: next } }))
    }, doc)

    return moveInstances(changed, library, view, chosen, 0, 0)
}

// GIRA EM TORNO DO CENTRO DA CAIXA NA CENA, ACUMULANDO NA TRANSFORMAÇÃO DA INSTÂNCIA (SPEC 02 §10.1)
export const rotateInstances = (doc: Doc, library: Library, view: ViewName, modelIndexes: string[], degrees: number) => {
    const angle = degrees * Math.PI / 180
    return transformInstances(doc, library, view, modelIndexes, [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0])
}

export const flipInstances = (doc: Doc, library: Library, view: ViewName, modelIndexes: string[], horizontal: boolean) => transformInstances(doc, library, view, modelIndexes, horizontal ? [-1, 0, 0, 1, 0, 0] : [1, 0, 0, -1, 0, 0])

const stepUp = (list: string[], selected: Set<string>) => {
    const next = [...list]

    for (let i = next.length - 2; i >= 0; i--) {
        if (selected.has(next[i]) && !selected.has(next[i + 1]))
            [next[i], next[i + 1]] = [next[i + 1], next[i]]
    }

    return next
}

const reorder: Record<ZMode, (list: string[], selected: Set<string>) => string[]> = {
    front: (list, selected) => [...list.filter(index => !selected.has(index)), ...list.filter(index => selected.has(index))],
    back: (list, selected) => [...list.filter(index => selected.has(index)), ...list.filter(index => !selected.has(index))],
    forward: stepUp,
    backward: (list, selected) => stepUp([...list].reverse(), selected).reverse()
}

// ORDEM EM z DENTRO DA CAMADA E RENUMERAÇÃO z_CAMADA + k·Δz (SPEC 02 §10.1)
export const setZOrder = (doc: Doc, library: Library, view: ViewName, selection: string[], mode: ZMode) => {
    const scene    = new Scene(doc, library, view)
    const selected = new Set(selection)
    const items    = Object.values(doc.instances).filter(instance => scene.isShown(instance)).sort((a, b) => (a.views[view]?.geometry.z ?? 0) - (b.views[view]?.geometry.z ?? 0))
    const layers   = new Map<string, string[]>()

    items.forEach(instance => layers.set(instance.views[view]?.layer ?? '', [...layers.get(instance.views[view]?.layer ?? '') ?? [], instance.modelIndex]))

    return [...layers].filter(([, list]) => list.some(index => selected.has(index))).reduce((current, [layer, list]) => reorder[mode](list, selected).reduce((next, modelIndex, k) => updateView(next, view, modelIndex, state => ({ ...state, geometry: { ...state.geometry, z: getLayerZ(view, layer) + k * Z_STEP } })), current), doc)
}

const ALIGN: Record<AlignMode, (box: Box, all: Box) => Point> = {
    left: (box, all) => [all[0] - box[0], 0],
    hcenter: (box, all) => [(all[0] + all[2] - box[0] - box[2]) / 2, 0],
    right: (box, all) => [all[2] - box[2], 0],
    top: (box, all) => [0, all[1] - box[1]],
    vcenter: (box, all) => [0, (all[1] + all[3] - box[1] - box[3]) / 2],
    bottom: (box, all) => [0, all[3] - box[3]]
}

// ALINHA CADA PEÇA SELECIONADA PELA SUA CAIXA À BORDA OU AO CENTRO DA CAIXA DO CONJUNTO; FIOS LIGADOS ACOMPANHAM (SPEC 02 §10.4)
export const alignInstances = (doc: Doc, library: Library, view: ViewName, modelIndexes: string[], mode: AlignMode) => {
    const scene  = new Scene(doc, library, view)
    const placed = modelIndexes.filter(modelIndex => !scene.isWire(modelIndex) && !scene.getView(modelIndex)?.locked).flatMap(modelIndex => {
        const box = scene.getBounds(modelIndex)
        return box ? [[modelIndex, box] as const] : []
    })
    const all    = unionBoxes(placed.map(([, box]) => box))

    if (!all || placed.length < 2)
        return doc

    return placed.reduce((current, [modelIndex, box]) => {
        const [dx, dy] = ALIGN[mode](box, all)
        return moveInstances(current, library, view, [modelIndex], dx, dy)
    }, doc)
}

// CADEIA DIRETA: FIOS ALCANÇADOS POR PONTAS QUE SÓ LIGAM FIOS (SPEC 02 §4)
export const getChain = (scene: Scene, wireIndex: string) => {
    const chain = new Set([wireIndex])
    const queue = [wireIndex]

    while (queue.length) {
        const wire = queue.pop() ?? ''

        for (const end of ['connector0', 'connector1']) {
            const partners = scene.getPartners(keyOf(wire, end))

            if (!partners.length || partners.some(partner => !scene.isWire(owner(partner))))
                continue

            partners.map(owner).filter(index => !chain.has(index)).forEach(index => {
                chain.add(index)
                queue.push(index)
            })
        }
    }

    return [...chain]
}

// APAGAR LEVA A CADEIA DIRETA DOS FIOS LIGADOS; minus SÓ O ITEM; TRAVADOS FICAM (SPEC 02 §4.9)
export const deleteItems = (doc: Doc, library: Library, view: ViewName, modelIndexes: string[], minus: boolean) => {
    const scene    = new Scene(doc, library, view)
    const chosen   = modelIndexes.filter(modelIndex => doc.instances[modelIndex] && !scene.getView(modelIndex)?.locked)
    const attached = chosen.flatMap(modelIndex => scene.getKeys(modelIndex).flatMap(key => scene.getPartners(key)).map(owner).filter(index => scene.isWire(index)))
    const wires    = minus ? [] : [...chosen.filter(modelIndex => scene.isWire(modelIndex)), ...attached]
    const doomed   = new Set([...chosen, ...wires.flatMap(wire => getChain(scene, wire))])
    return [...doomed].reduce(removeInstance, doc)
}

// DIVIDE O FIO NO PONTO MAIS PRÓXIMO DO CLIQUE; A CURVA É DIVIDIDA NO MESMO PARÂMETRO EM TODAS AS VISTAS (SPEC 02 §4.5)
export const splitWire = (doc: Doc, view: ViewName, wireIndex: string, point: Point) => {
    const instance = doc.instances[wireIndex]
    const home     = instance?.views[view]

    if (!instance || !home?.geometry.line)
        return { doc, bend: null }

    const [p0, p3] = endsOf(home)
    const curve    = curveOf(home)
    const t        = Math.min(0.999, Math.max(0.001, curve ? nearestOnCubic(p0, curve[0], curve[1], p3, point) : nearestOnSegment(p0, p3, point)))
    const index    = String(doc.nextIndex)
    const halves   = Object.fromEntries(Object.entries(instance.views).map(([name, state]) => {
        const [a, b] = endsOf(state)
        const bend   = curveOf(state)

        if (!bend)
            return [name, [withEnds(state, a, lerp(a, b, t), null), withEnds(state, lerp(a, b, t), b, null)]]

        const [left, right] = splitCubic(a, bend[0], bend[1], b, t)
        return [name, [withEnds(state, left[0], left[3], [left[1], left[2]]), withEnds(state, right[0], right[3], [right[1], right[2]])]]
    }))

    const left: Instance  = { ...instance, views: Object.fromEntries(Object.entries(halves).map(([name, pair]) => [name, pair[0]])) }
    const right: Instance = { ...instance, modelIndex: index, title: `Wire${index}`, views: Object.fromEntries(Object.entries(halves).map(([name, pair]) => [name, { ...pair[1], geometry: { ...pair[1].geometry, z: pair[1].geometry.z + Z_STEP }, connectors: [] }])) }
    const end1            = keyOf(wireIndex, 'connector1')
    const carried         = doc.edges.filter(edge => edge.includes(end1)).map(([a, b]) => a === end1 ? b : a)
    const cut             = removeEdges({ ...doc, instances: { ...doc.instances, [wireIndex]: left } }, edge => edge.includes(end1))
    const joined          = addEdges(addInstance(cut, right), [...carried.map((partner): Edge => [keyOf(index, 'connector1'), partner]), [end1, keyOf(index, 'connector0')]])
    return { doc: joined, bend: [end1, keyOf(index, 'connector0')] }
}

// UNE OS DOIS FIOS DE UMA DOBRA SIMPLES NUM FIO RETO (SPEC 02 §4.6)
export const joinWires = (doc: Doc, library: Library, view: ViewName, key: string) => {
    const bend = new Scene(doc, library, view).getBendpoint(key)

    if (!bend || bend.length !== 2 || owner(bend[0]) === owner(bend[1]))
        return doc

    const [wire, wireEnd]   = splitKey(bend[0])
    const [other, otherEnd] = splitKey(bend[1])
    const farKey            = keyOf(other, otherEnd === 'connector0' ? 'connector1' : 'connector0')
    const carried           = doc.edges.filter(edge => edge.includes(farKey)).map(([a, b]) => a === farKey ? b : a)
    const joined            = updateInstance(doc, wire, instance => mapViews(instance, (state, name) => {
        const theirs = doc.instances[other]?.views[name]
        const far    = theirs ? endsOf(theirs)[otherEnd === 'connector0' ? 1 : 0] : endsOf(state)[wireEnd === 'connector0' ? 0 : 1]
        const mine   = endsOf(state)
        return wireEnd === 'connector1' ? withEnds(state, mine[0], far, null) : withEnds(state, far, mine[1], null)
    }))

    return addEdges(removeInstance(joined, other), carried.map((partner): Edge => [bend[0], partner]))
}

// ARRASTE DO CORPO COM CURVA: OS DOIS CONTROLES SE DESLOCAM DE d PARA QUE B(t) PASSE PELO CURSOR, d = (P − B(t)) / 3t(1−t)
export const bendWire = (doc: Doc, view: ViewName, wireIndex: string, grab: Point, point: Point) => updateView(doc, view, wireIndex, state => {
    const [p0, p3] = endsOf(state)
    const curve    = curveOf(state) ?? [lerp(p0, p3, 1 / 3), lerp(p0, p3, 2 / 3)]
    const t        = Math.min(1 - CURVE_LIMIT, Math.max(CURVE_LIMIT, nearestOnCubic(p0, curve[0], curve[1], p3, grab)))
    const at       = cubicAt(p0, curve[0], curve[1], p3, t)
    const k        = 3 * t * (1 - t)
    const d: Point = [(point[0] - at[0]) / k, (point[1] - at[1]) / k]
    const extras   = state.wire ?? { mils: WIRE_STYLE[view as View]?.mils ?? HIDDEN_WIRE_MILS, color: WIRE_STYLE[view as View]?.color ?? '#000000', opacity: 1, banded: false, bezier: null }
    return withEnds({ ...state, wire: extras }, p0, p3, [[curve[0][0] + d[0], curve[0][1] + d[1]], [curve[1][0] + d[0], curve[1][1] + d[1]]])
})

export const straightenWire = (doc: Doc, view: ViewName, wireIndex: string) => updateView(doc, view, wireIndex, state => ({ ...state, wire: state.wire && { ...state.wire, bezier: null } }))

export const setWireColor = (doc: Doc, view: ViewName, wireIndexes: string[], color: string) => wireIndexes.reduce((current, wireIndex) => updateView(current, view, wireIndex, state => ({ ...state, wire: state.wire && { ...state.wire, color } })), doc)

export const setLocked = (doc: Doc, view: ViewName, modelIndexes: string[], locked: boolean) => modelIndexes.reduce((current, modelIndex) => updateView(current, view, modelIndex, state => ({ ...state, locked })), doc)

export const setSticky = (doc: Doc, modelIndexes: string[], sticky: boolean) => modelIndexes.reduce((current, modelIndex) => updateInstance(current, modelIndex, instance => ({ ...instance, properties: { ...instance.properties, sticky: String(sticky) } })), doc)

export const setLabelVisible = (doc: Doc, library: Library, view: View, modelIndexes: string[], visible: boolean) => modelIndexes.reduce((current, modelIndex) => {
    const part  = library.getPart(current.instances[modelIndex]?.moduleIdRef ?? '')
    const keys  = view === 'pcbView' ? [''] : ['', ...part?.displayKeys ?? []]
    const label = current.instances[modelIndex]?.views[view]?.label ?? createLabel(current, library, view, modelIndex, keys, visible)
    return label ? updateView(current, view, modelIndex, state => ({ ...state, label: { ...label, visible } })) : current
}, doc)

export const moveLabel = (doc: Doc, view: ViewName, modelIndex: string, dx: number, dy: number) => updateView(doc, view, modelIndex, state => ({ ...state, label: state.label && { ...state.label, x: state.label.x + dx, y: state.label.y + dy, xOffset: state.label.xOffset + dx, yOffset: state.label.yOffset + dy } }))

export const setLayerHidden = (doc: Doc, view: ViewName, modelIndexes: string[], layers: string[], hidden: boolean) => modelIndexes.reduce((current, modelIndex) => updateView(current, view, modelIndex, state => ({ ...state, hidden: hidden ? [...new Set([...state.hidden, ...layers])] : state.hidden.filter(layer => !layers.includes(layer)) })), doc)

export const setTraceSide = (doc: Doc, wireIndex: string) => updateView(doc, 'pcbView', wireIndex, state => {
    const layer = state.layer === 'copper1trace' ? 'copper0trace' : 'copper1trace'
    return { ...state, layer, geometry: { ...state.geometry, z: getLayerZ('pcbView', layer) + (state.geometry.z % 1) }, wire: state.wire && { ...state.wire, color: TRACE_COLORS[layer] } }
})

export const setAutoroutable = (doc: Doc, wireIndex: string, autoroutable: boolean) => updateInstance(doc, wireIndex, instance => mapViews(instance, state => ({ ...state, geometry: { ...state.geometry, wireFlags: autoroutable ? state.geometry.wireFlags | AUTOROUTABLE : state.geometry.wireFlags & ~AUTOROUTABLE } })))

export const setGroundFillSeed = (doc: Doc, key: string, seed: boolean) => {
    const [modelIndex, connectorId] = splitKey(key)
    const blank: ConnectorState     = { id: connectorId, layer: '', x: 0, y: 0, leg: null, connects: [], groundFillSeed: false }

    return updateView(doc, 'pcbView', modelIndex, state => {
        const current = state.connectors.find(connector => connector.id === connectorId) ?? { ...blank, layer: state.layer }
        const next    = { ...current, groundFillSeed: seed }
        return { ...state, connectors: state.connectors.some(connector => connector.id === connectorId) ? state.connectors.map(connector => connector.id === connectorId ? next : connector) : [...state.connectors, next] }
    })
}

export const clearGroundFillSeeds = (doc: Doc) => Object.keys(doc.instances).reduce((current, modelIndex) => updateView(current, 'pcbView', modelIndex, state => ({ ...state, connectors: state.connectors.map(connector => ({ ...connector, groundFillSeed: false })) })), doc)

export const copyItems = (doc: Doc, modelIndexes: string[]): Clipboard => {
    const chosen = new Set(modelIndexes.filter(modelIndex => doc.instances[modelIndex]))
    return { instances: [...chosen].map(modelIndex => doc.instances[modelIndex]), edges: doc.edges.filter(([a, b]) => chosen.has(owner(a)) && chosen.has(owner(b))) }
}

// COLA COM modelIndex E TÍTULOS NOVOS, RECRIANDO SÓ AS ARESTAS INTERNAS À CÓPIA (SPEC 02 §10.3)
export const pasteItems = (doc: Doc, library: Library, clipboard: Clipboard, offset: Point) => {
    const ids    = new Map(clipboard.instances.map((instance, i) => [instance.modelIndex, String(doc.nextIndex + i)]))
    const remap  = (key: string) => keyOf(ids.get(owner(key)) ?? '', splitKey(key)[1])
    const placed = clipboard.instances.reduce((current, instance) => {
        const modelIndex = ids.get(instance.modelIndex) ?? ''
        const wire       = instance.moduleIdRef === 'WireModuleID'
        const title      = wire ? `Wire${modelIndex}` : getTitle(current, library.getPart(instance.moduleIdRef)?.label ?? '')
        const moved      = mapViews(instance, state => ({ ...state, geometry: { ...state.geometry, x: state.geometry.x + offset[0], y: state.geometry.y + offset[1] }, label: shiftLabel(state.label, offset[0], offset[1]), connectors: state.connectors.map(connector => ({ ...connector, connects: [] })) }))
        return addInstance(current, { ...moved, modelIndex, title })
    }, doc)

    return { doc: addEdges(placed, clipboard.edges.map(([a, b]): Edge => [remap(a), remap(b)])), indexes: [...ids.values()] }
}

type FlowEdge = { a: string, b: string, capacity: number, edge: Edge | null, wire: string | null }

// APAGAR LINHA DE RATSNEST: CORTE MÍNIMO (EDMONDS–KARP) PREFERINDO CORTAR O QUE É INVISÍVEL NA VISTA (SPEC 02 §4.10)
export const deleteRatsnest = (doc: Doc, library: Library, view: ViewName, from: string, to: string) => {
    const scene   = new Scene(doc, library, view)
    const visible = (key: string) => {
        const instance = doc.instances[owner(key)]
        return instance ? scene.isShown(instance) : false
    }

    const links: FlowEdge[] = [
        ...doc.edges.map(edge => ({ a: edge[0], b: edge[1], capacity: visible(edge[0]) && visible(edge[1]) ? STRONG : LINK_COST, edge, wire: null })),
        ...Object.values(doc.instances).filter(instance => scene.isWire(instance.modelIndex)).map(instance => ({ a: keyOf(instance.modelIndex, 'connector0'), b: keyOf(instance.modelIndex, 'connector1'), capacity: scene.isShown(instance) ? STRONG : 1, edge: null, wire: instance.modelIndex })),
        ...Object.values(doc.instances).filter(instance => !scene.isWire(instance.modelIndex)).flatMap(instance => {
            const part  = library.getPart(instance.moduleIdRef)
            const buses = (part?.buses ?? []).flatMap(members => members.slice(1).map(id => [members[0], id]))
            return [...buses, ...getStrips(instance.moduleIdRef, instance.properties)].map(([a, b]) => ({ a: keyOf(instance.modelIndex, a), b: keyOf(instance.modelIndex, b), capacity: STRONG * STRONG, edge: null, wire: null }))
        })
    ]

    const adjacency = new Map<string, number[]>()
    links.forEach((link, i) => [link.a, link.b].forEach(node => adjacency.set(node, [...adjacency.get(node) ?? [], i])))
    const flow = links.map(() => 0)

    const residual = (i: number, node: string) => links[i].a === node ? links[i].capacity - flow[i] : links[i].capacity + flow[i]
    const across   = (i: number, node: string) => links[i].a === node ? links[i].b : links[i].a

    const search = () => {
        const parent = new Map<string, number>([[from, -1]])
        const queue  = [from]

        while (queue.length && !parent.has(to)) {
            const node = queue.shift() ?? ''

            for (const i of adjacency.get(node) ?? []) {
                if (residual(i, node) > 0 && !parent.has(across(i, node))) {
                    parent.set(across(i, node), i)
                    queue.push(across(i, node))
                }
            }
        }

        return parent
    }

    for (let parent = search(); parent.has(to); parent = search()) {
        const path: [number, string][] = []

        for (let node = to; node !== from;) {
            const i    = parent.get(node) ?? 0
            const prev = across(i, node)
            path.push([i, prev])
            node = prev
        }

        const push = Math.min(...path.map(([i, prev]) => residual(i, prev)))

        if (push >= STRONG)
            return doc

        path.forEach(([i, prev]) => flow[i] += links[i].a === prev ? push : -push)
    }

    const reached = search()
    const cut     = links.filter(link => reached.has(link.a) !== reached.has(link.b))
    const wires   = cut.flatMap(link => link.wire ? [link.wire] : [])
    const edges   = new Set(cut.flatMap(link => link.edge ? [link.edge.join('|')] : []))
    return wires.reduce(removeInstance, removeEdges(doc, edge => edges.has(edge.join('|'))))
}

// TROCA A PEÇA DA INSTÂNCIA MANTENDO GEOMETRIA E AS CONEXÕES DOS connectorId QUE EXISTEM NA PEÇA NOVA (SPEC 02 §5)
export const swapPart = (doc: Doc, library: Library, modelIndex: string, moduleId: string) => {
    const part = library.getPart(moduleId)

    if (!part || !doc.instances[modelIndex])
        return doc

    const kept    = new Set(part.connectors.map(connector => keyOf(modelIndex, connector.id)))
    const prefix  = `${modelIndex}/`
    const swapped = updateInstance(doc, modelIndex, instance => ({ ...instance, moduleIdRef: moduleId, path: '' }))
    return { ...removeEdges(swapped, ([a, b]) => (a.startsWith(prefix) && !kept.has(a)) || (b.startsWith(prefix) && !kept.has(b))), revision: swapped.revision + 1 }
}

// TEXTO NOVO DO LOGO REGERA O SVG (shape) A PARTIR DO MODELO DA VISTA E O TAMANHO (width/height) (SPEC 01 §5.7)
export const setLogoText = (doc: Doc, library: Library, view: ViewName, modelIndex: string, text: string) => {
    const template = library.getSvg(doc.instances[modelIndex]?.moduleIdRef ?? '', view)?.text
    const made     = template ? logoTextSvg(template, text, library.fonts) : null

    if (!made)
        return setProperty(doc, modelIndex, 'logo', text)

    return updateInstance(doc, modelIndex, instance => ({ ...instance, properties: { ...instance.properties, logo: text, shape: made.svg, width: String(+made.width.toFixed(4)), height: String(+made.height.toFixed(4)) } }))
}

export const setProperty = (doc: Doc, modelIndex: string, name: string, value: string) => updateInstance(doc, modelIndex, instance => ({ ...instance, properties: { ...instance.properties, [name]: value } }))

export const setTitle = (doc: Doc, modelIndex: string, title: string) => updateInstance(doc, modelIndex, instance => ({ ...instance, title }))
