import { IDENTITY, apply, boxOf, mapBox, multiply, translate, type Box, type Point } from '../../core/Geometry'
import { keyOf, splitKey, WIRE_FLAGS, type Doc } from '../../core/Document'
import { VIEWS, type ViewName } from '../../core/Layer'
import type { Library } from '../../core/Library'
import { isVisibleIn } from '../../core/Part'
import { PX_PER_INCH } from '../../core/Units'
import type { Instance, InstanceView } from '../../core/Sketch'

type View = typeof VIEWS[number]

export const WIRE_STYLE: Record<View, { layer: string, mils: number, color: string }> = {
    breadboardView: { layer: 'breadboardWire', mils: 22.2222, color: '#418dd9' },
    schematicView: { layer: 'schematicTrace', mils: 9.7222, color: '#404040' },
    pcbView: { layer: 'copper1trace', mils: 24, color: '#f2c600' }
}

const TRACE_FLAGS     = WIRE_FLAGS.pcbView | WIRE_FLAGS.schematicView
const PROBE_TOLERANCE = 3
const LABEL_LINE      = 1      // ALTURA DA LINHA EM UNIDADES DO TAMANHO DA FONTE
const LABEL_ADVANCE   = 0.75   // LARGURA MÉDIA DO CARACTERE EM UNIDADES DO TAMANHO DA FONTE

export const owner = (key: string) => splitKey(key)[0]

export const labelPx = (points: number) => points * PX_PER_INCH / 72

// GEOMETRIA DE CENA DE UMA VISTA: TRANSFORMAÇÃO DE CADA INSTÂNCIA E PONTO TERMINAL DE CADA CONECTOR
export class Scene {
    doc: Doc
    library: Library
    view: ViewName
    partners: Map<string, string[]> | null = null

    constructor(doc: Doc, library: Library, view: ViewName) {
        this.doc     = doc
        this.library = library
        this.view    = view
    }

    getView(modelIndex: string): InstanceView | undefined {
        return this.doc.instances[modelIndex]?.views[this.view]
    }

    getMatrix(modelIndex: string) {
        const geometry = this.getView(modelIndex)?.geometry
        return geometry ? multiply(translate(geometry.x, geometry.y), geometry.transform ?? IDENTITY) : null
    }

    getPins(modelIndex: string) {
        const instance = this.doc.instances[modelIndex]
        return this.library.getPins(instance?.moduleIdRef ?? '', this.view, this.getView(modelIndex)?.layer ?? '', this.library.getVariant(instance, this.view))
    }

    isWire(modelIndex: string) {
        return this.doc.instances[modelIndex]?.moduleIdRef === 'WireModuleID'
    }

    getWireEnds(modelIndex: string): [Point, Point] | null {
        const geometry = this.getView(modelIndex)?.geometry

        if (!geometry?.line)
            return null

        const [x1, y1, x2, y2] = geometry.line
        return [[geometry.x + x1, geometry.y + y1], [geometry.x + x2, geometry.y + y2]]
    }

    getWireCurve(modelIndex: string): [Point, Point] | null {
        const state  = this.getView(modelIndex)
        const bezier = state?.wire?.bezier

        if (!state || !bezier)
            return null

        const { x, y } = state.geometry
        return [[x + bezier[0], y + bezier[1]], [x + bezier[2], y + bezier[3]]]
    }

    getLegPoints(key: string): Point[] | null {
        const [modelIndex, connectorId] = splitKey(key)
        const pin   = this.getPins(modelIndex).get(connectorId)
        const m     = this.getMatrix(modelIndex)
        const state = this.getView(modelIndex)?.connectors.find(connector => connector.id === connectorId)

        if (!pin?.leg || !m)
            return null

        const local = state?.leg ? state.leg.points.map(([px, py]): Point => [state.x + px, state.y + py]) : [pin.leg.p1, pin.leg.p2]
        return local.map(([px, py]) => apply(m, px, py))
    }

    getLocalTerminal(modelIndex: string, connectorId: string): Point | null {
        const pin = this.getPins(modelIndex).get(connectorId)

        if (!pin)
            return null

        if (!pin.leg)
            return pin.terminal

        const state = this.getView(modelIndex)?.connectors.find(connector => connector.id === connectorId)
        const last  = state?.leg?.points.at(-1)
        return state && last ? [state.x + last[0], state.y + last[1]] : pin.leg.p2
    }

    getTerminal(key: string): Point | null {
        const [modelIndex, connectorId] = splitKey(key)

        if (this.isWire(modelIndex))
            return this.getWireEnds(modelIndex)?.[connectorId === 'connector0' ? 0 : 1] ?? null

        const m     = this.getMatrix(modelIndex)
        const local = this.getLocalTerminal(modelIndex, connectorId)
        return m && local ? apply(m, local[0], local[1]) : null
    }

    getConnectorBox(key: string): Box | null {
        const [modelIndex, connectorId] = splitKey(key)
        const m   = this.getMatrix(modelIndex)
        const pin = this.getPins(modelIndex).get(connectorId)

        if (this.isWire(modelIndex) || pin?.leg) {
            const point = this.getTerminal(key)
            const r     = Math.max(PROBE_TOLERANCE, (pin?.leg?.width ?? 0) / 2)
            return point ? [point[0] - r, point[1] - r, point[0] + r, point[1] + r] : null
        }

        return m && pin ? mapBox(m, pin.rect) : null
    }

    getBounds(modelIndex: string): Box | null {
        const instance = this.doc.instances[modelIndex]
        const svg      = this.library.getInstanceSvg(instance, this.view)
        const m        = this.getMatrix(modelIndex)

        if (this.isWire(modelIndex)) {
            const ends = this.getWireEnds(modelIndex)
            return ends ? boxOf([...ends, ...this.getWireCurve(modelIndex) ?? []]) : null
        }

        const geometry = this.getView(modelIndex)?.geometry

        if (geometry?.size && this.library.getPart(instance?.moduleIdRef ?? '')?.kind === 'note')
            return [geometry.x, geometry.y, geometry.x + geometry.size[0], geometry.y + geometry.size[1]]

        return svg && m ? mapBox(m, [0, 0, svg.width, svg.height]) : null
    }

    getKeys(modelIndex: string) {
        const instance = this.doc.instances[modelIndex]
        const part     = instance ? this.library.getPart(instance.moduleIdRef) : undefined
        return (part?.connectors ?? []).map(connector => keyOf(modelIndex, connector.id))
    }

    getConnector(key: string) {
        const [modelIndex, connectorId] = splitKey(key)
        return this.library.getPart(this.doc.instances[modelIndex]?.moduleIdRef ?? '')?.connectors.find(connector => connector.id === connectorId)
    }

    getConnectorAt(point: Point, accept: (modelIndex: string) => boolean = () => true) {
        const [x, y] = point
        const found  = Object.values(this.doc.instances).filter(instance => accept(instance.modelIndex) && this.isShown(instance)).flatMap(instance => this.getKeys(instance.modelIndex).map(key => [key, this.getConnectorBox(key), this.getView(instance.modelIndex)?.geometry.z ?? 0] as const))
        const inside = found.filter(([, box]) => box && x >= box[0] - 1 && x <= box[2] + 1 && y >= box[1] - 1 && y <= box[3] + 1)
        return inside.sort((a, b) => b[2] - a[2])[0]?.[0] ?? null
    }

    getPartners(key: string) {
        if (!this.partners) {
            this.partners = new Map()
            this.doc.edges.forEach(([a, b]) => {
                this.partners?.set(a, [...this.partners.get(a) ?? [], b])
                this.partners?.set(b, [...this.partners.get(b) ?? [], a])
            })
        }

        return this.partners.get(key) ?? []
    }

    // PONTAS DE FIO REUNIDAS NUMA DOBRA (SÓ FIOS LIGADOS ENTRE SI); NULO SE A PONTA TOCA PEÇA OU ESTÁ SOLTA (SPEC 02 §4)
    getBendpoint(key: string) {
        const partners = this.getPartners(key)

        if (!this.isWire(owner(key)) || !partners.length || partners.some(partner => !this.isWire(owner(partner))))
            return null

        return [key, ...partners]
    }

    getLabelLines(modelIndex: string) {
        const instance = this.doc.instances[modelIndex]
        const part     = instance ? this.library.getPart(instance.moduleIdRef) : undefined
        const label    = this.getView(modelIndex)?.label
        const values   = (label?.keys ?? []).map(key => key === '' ? instance?.title ?? '' : instance?.properties[key] ?? part?.properties[key] ?? '')
        const lines    = values.filter(Boolean)
        return lines.length ? lines : ['?']
    }

    getLabelBox(modelIndex: string): Box | null {
        const label = this.getView(modelIndex)?.label

        if (!label?.visible)
            return null

        const px    = labelPx(label.size)
        const lines = this.getLabelLines(modelIndex)
        const width = Math.max(...lines.map(line => line.length)) * px * LABEL_ADVANCE
        return [label.x, label.y, label.x + width, label.y + lines.length * px * LABEL_LINE + px / 4]
    }

    isShown(instance: Instance) {
        const part  = this.library.getPart(instance.moduleIdRef)
        const flags = instance.views[this.view]?.geometry.wireFlags ?? 0

        if (!part || !instance.views[this.view])
            return false

        if (part.kind === 'wire')
            return this.view === 'breadboardView' ? (flags & TRACE_FLAGS) === 0 : (flags & WIRE_FLAGS[this.view as View]) !== 0

        return isVisibleIn(part, this.view)
    }
}
