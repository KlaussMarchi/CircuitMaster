import { IDENTITY, apply, boxOf, cubicAt, lerp, mapBox, multiply, translate, type Box, type Point } from '../../core/Geometry'
import { keyOf, splitKey, WIRE_FLAGS, type Doc } from '../../core/Document'
import { VIEWS, type ViewName } from '../../core/Layer'
import type { Library } from '../../core/Library'
import { isVisibleIn } from '../../core/Part'
import { PX_PER_INCH } from '../../core/Units'
import type { Instance, InstanceView } from '../../core/Sketch'
import type { Sheet } from '../../core/Router'
import { toHeading, type Heading } from '../Path'

type View = typeof VIEWS[number]

export const WIRE_STYLE: Record<View, { layer: string, mils: number, color: string }> = {
    breadboardView: { layer: 'breadboardWire', mils: 22.2222, color: '#418dd9' },
    schematicView: { layer: 'schematicTrace', mils: 9.7222, color: '#404040' },
    pcbView: { layer: 'copper1trace', mils: 24, color: '#f2c600' }
}

const TRACE_FLAGS     = WIRE_FLAGS.pcbView | WIRE_FLAGS.schematicView
const SHEET_FREE      = ['note', 'ruler']
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
    pins     = new Map<string, ReturnType<Library['getPins']>>()
    matrices = new Map<string, ReturnType<typeof multiply> | null>()

    constructor(doc: Doc, library: Library, view: ViewName) {
        this.doc     = doc
        this.library = library
        this.view    = view
    }

    getView(modelIndex: string): InstanceView | undefined {
        return this.doc.instances[modelIndex]?.views[this.view]
    }

    // A CENA É UM RETRATO DO DOCUMENTO: MATRIZ E PINOS DE CADA INSTÂNCIA SÃO CALCULADOS UMA VEZ (A PROTOBOARD TEM CENTENAS DE CONECTORES)
    getMatrix(modelIndex: string) {
        const geometry = this.getView(modelIndex)?.geometry

        if (!this.matrices.has(modelIndex))
            this.matrices.set(modelIndex, geometry ? multiply(translate(geometry.x, geometry.y), geometry.transform ?? IDENTITY) : null)

        return this.matrices.get(modelIndex) ?? null
    }

    getPins(modelIndex: string) {
        const instance = this.doc.instances[modelIndex]

        if (!this.pins.has(modelIndex))
            this.pins.set(modelIndex, this.library.getPins(instance?.moduleIdRef ?? '', this.view, this.getView(modelIndex)?.layer ?? '', this.library.getVariant(instance, this.view)))

        return this.pins.get(modelIndex) as ReturnType<Library['getPins']>
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

    getPointOn(wireIndex: string, t: number): Point | null {
        const ends  = this.getWireEnds(wireIndex)
        const curve = this.getWireCurve(wireIndex)
        return ends && (curve ? cubicAt(ends[0], curve[0], curve[1], ends[1], t) : lerp(ends[0], ends[1], t))
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

    // DIREÇÃO EM QUE UM FIO SAI DO CONECTOR: DO MEIO DO PINO PARA A PONTA (NO ESQUEMÁTICO, SEM PINO ALONGADO, DO CENTRO DA PEÇA PARA O TERMINAL), SEGUINDO O ÚLTIMO TRECHO DA PERNA DOBRÁVEL OU, NA PONTA DE FIO, CONTINUANDO O FIO
    getHeading(key: string): Heading {
        const [modelIndex, connectorId] = splitKey(key)
        const ends = this.isWire(modelIndex) ? this.getWireEnds(modelIndex) : null

        if (ends)
            return connectorId === 'connector0' ? toHeading([ends[0][0] - ends[1][0], ends[0][1] - ends[1][1]]) : toHeading([ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]])

        const pin   = this.getPins(modelIndex).get(connectorId)
        const m     = this.getMatrix(modelIndex)
        const svg   = this.library.getInstanceSvg(this.doc.instances[modelIndex], this.view)
        const local = this.getLocalTerminal(modelIndex, connectorId)
        const leg   = pin?.leg ? this.getLegPoints(key)?.slice(-2) ?? [] : null

        if (leg)
            return leg.length === 2 ? toHeading([leg[1][0] - leg[0][0], leg[1][1] - leg[0][1]]) : null

        if (!pin || !m || !local)
            return null

        const [cx, cy] = [(pin.rect[0] + pin.rect[2]) / 2, (pin.rect[1] + pin.rect[3]) / 2]
        const along    = toHeading([local[0] - cx, local[1] - cy])
        const outward  = along ?? (this.view === 'schematicView' && svg ? toHeading([local[0] - svg.width / 2, local[1] - svg.height / 2]) : null)
        return outward && toHeading([m[0] * outward[0] + m[2] * outward[1], m[1] * outward[0] + m[3] * outward[1]])
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

    // CONECTOR MAIS PERTO DO PONTO A ATÉ radius: DISTÂNCIA ATÉ A CAIXA DELE (ZERO DENTRO), EMPATE PELO DE CIMA (SPEC 02 §4.6)
    getConnectorNear(point: Point, radius: number, accept: (modelIndex: string) => boolean = () => true) {
        const [x, y] = point
        const found  = Object.values(this.doc.instances).filter(instance => accept(instance.modelIndex) && this.isShown(instance)).flatMap(instance => this.getKeys(instance.modelIndex).flatMap(key => {
            const box = this.getConnectorBox(key)
            const gap = box ? Math.hypot(Math.max(box[0] - x, 0, x - box[2]), Math.max(box[1] - y, 0, y - box[3])) : Infinity
            return gap <= radius ? [[key, gap, this.getView(instance.modelIndex)?.geometry.z ?? 0] as const] : []
        }))
        return found.sort((a, b) => a[1] - b[1] || b[2] - a[2])[0]?.[0] ?? null
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

    // CORPOS DAS PEÇAS, PONTAS DOS PINOS E FIOS DA VISTA PARA O AUTOROUTER DO ESQUEMÁTICO; NOTAS, RÉGUAS E MOLDURA NÃO SÃO OBSTÁCULO (SPEC 03 §8.2)
    getSheet(): Sheet {
        const shown = Object.values(this.doc.instances).filter(instance => this.isShown(instance))
        const parts = shown.filter(instance => !this.isWire(instance.modelIndex) && !SHEET_FREE.includes(this.library.getPart(instance.moduleIdRef)?.kind ?? 'note') && !instance.moduleIdRef.endsWith('SchematicFrameModuleID'))

        return {
            boxes: parts.flatMap(instance => {
                const box = this.getBounds(instance.modelIndex)
                return box ? [box] : []
            }),
            pins: parts.flatMap(instance => this.getKeys(instance.modelIndex).flatMap(key => {
                const point = this.getTerminal(key)
                return point ? [[key, point] as [string, Point]] : []
            })),
            wires: shown.filter(instance => this.isWire(instance.modelIndex)).flatMap(instance => {
                const ends = this.getWireEnds(instance.modelIndex)
                return ends ? [[keyOf(instance.modelIndex, 'connector0'), ends] as [string, Point[]]] : []
            }),
            headings: parts.flatMap(instance => this.getKeys(instance.modelIndex).flatMap(key => {
                const heading = this.getHeading(key)
                return heading ? [[key, heading] as [string, Point]] : []
            }))
        }
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
