import type { Geometry, Instance, InstanceView, Sketch } from '../Sketch'
import { VIEWS, type ViewName } from '../Layer'
import type { Point } from '../Geometry'

export type Edge      = [string, string]
export type ProbeKind = 'voltage' | 'current' | 'both'
export type Probe     = { id: string, kind: ProbeKind, view: typeof VIEWS[number], key: string, t: number, offset: Point, flip: boolean }

export type Doc = {
    fritzingVersion: string
    projectProperties: Record<string, string>
    settings: Sketch['settings']
    instances: Record<string, Instance>
    edges: Edge[]
    probes: Probe[]
    revision: number
    nextIndex: number
}

export const WIRE_FLAGS: Record<typeof VIEWS[number], number> = { breadboardView: 64, schematicView: 128, pcbView: 4 }

export const PROBES_KEY = 'circuitmaster_probes'    // PROPRIEDADE DE PROJETO QUE O FRITZING IGNORA (SPEC 04 §8.7)

const PROBE_KINDS = new Set(['voltage', 'current', 'both'])

export const keyOf = (modelIndex: string, connectorId: string) => `${modelIndex}/${connectorId}`

export const splitKey = (key: string) => {
    const slash = key.indexOf('/')
    return [key.slice(0, slash), key.slice(slash + 1)] as const
}

export const wireViewOf = (flags: number): typeof VIEWS[number] => (flags & WIRE_FLAGS.pcbView) ? 'pcbView' : (flags & WIRE_FLAGS.schematicView) ? 'schematicView' : 'breadboardView'

const edgeOf = (a: string, b: string): Edge => a < b ? [a, b] : [b, a]

const uniqueEdges = (edges: Edge[]) => [...new Map(edges.map(edge => [edge.join('|'), edge])).values()]

export const emptyDoc = (): Doc => ({ fritzingVersion: '', projectProperties: {}, settings: {}, instances: {}, edges: [], probes: [], revision: 0, nextIndex: 1 })

const isPoint = (value: unknown): value is Point => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)

// PONTAS DE PROVA GRAVADAS COMO JSON NUMA PROPRIEDADE DO PROJETO: ENTRADA DE ARQUIVO, SÓ PASSA O QUE TEM A FORMA CERTA
export const readProbes = (text: string | undefined, instances: Record<string, Instance>): Probe[] => {
    try {
        const parsed = JSON.parse(text ?? '[]')
        const list   = Array.isArray(parsed) ? parsed as Record<string, unknown>[] : []
        return list.filter(item => typeof item?.id === 'string' && PROBE_KINDS.has(item.kind as string) && (VIEWS as readonly unknown[]).includes(item.view) && typeof item.key === 'string' && instances[splitKey(item.key).at(0) ?? ''] && Number.isFinite(item.t) && isPoint(item.offset)).map(item => ({ id: item.id as string, kind: item.kind as ProbeKind, view: item.view as Probe['view'], key: item.key as string, t: item.t as number, offset: item.offset as Point, flip: item.flip === true }))
    } catch (error) {
        if (error instanceof SyntaxError)
            return []

        throw error
    }
}

// UNIFICA AS CONEXÕES GRAVADAS POR VISTA NUM ÚNICO CONJUNTO DE ARESTAS (SPEC 02 §7.1)
export const fromSketch = (sketch: Sketch): Doc => {
    const instances = Object.fromEntries(sketch.instances.filter(instance => instance.modelIndex && Object.keys(instance.views).length).map(instance => [instance.modelIndex, instance]))
    const edges     = sketch.instances.flatMap(instance => Object.values(instance.views).flatMap(view => view.connectors.flatMap(connector => connector.connects.filter(connect => instances[connect.modelIndex]).map(connect => edgeOf(keyOf(instance.modelIndex, connector.id), keyOf(connect.modelIndex, connect.connectorId))))))
    const indexes   = Object.keys(instances).map(Number).filter(Number.isFinite)
    const { [PROBES_KEY]: probes, ...properties } = sketch.projectProperties
    return { ...emptyDoc(), fritzingVersion: sketch.fritzingVersion, projectProperties: properties, settings: sketch.settings, instances, edges: uniqueEdges(edges), probes: readProbes(probes, instances), nextIndex: Math.max(0, ...indexes) + 1 }
}

export const updateInstance = (doc: Doc, modelIndex: string, change: (instance: Instance) => Instance): Doc => {
    const instance = doc.instances[modelIndex]
    return instance ? { ...doc, instances: { ...doc.instances, [modelIndex]: change(instance) } } : doc
}

export const updateView = (doc: Doc, view: ViewName, modelIndex: string, change: (state: InstanceView) => InstanceView): Doc => {
    const current = doc.instances[modelIndex]?.views[view]
    return current ? updateInstance(doc, modelIndex, instance => ({ ...instance, views: { ...instance.views, [view]: change(current) } })) : doc
}

export const setGeometry = (doc: Doc, view: ViewName, modelIndex: string, geometry: Partial<Geometry>): Doc => updateView(doc, view, modelIndex, state => ({ ...state, geometry: { ...state.geometry, ...geometry } }))

export const addEdges = (doc: Doc, edges: Edge[]): Doc => edges.length ? { ...doc, edges: uniqueEdges([...doc.edges, ...edges.map(([a, b]) => edgeOf(a, b))]), revision: doc.revision + 1 } : doc

export const removeEdges = (doc: Doc, remove: (edge: Edge) => boolean): Doc => {
    const edges = doc.edges.filter(edge => !remove(edge))
    return edges.length === doc.edges.length ? doc : { ...doc, edges, revision: doc.revision + 1 }
}

export const addInstance = (doc: Doc, instance: Instance): Doc => ({ ...doc, instances: { ...doc.instances, [instance.modelIndex]: instance }, revision: doc.revision + 1, nextIndex: Math.max(doc.nextIndex, Number(instance.modelIndex) + 1) })

export const removeInstance = (doc: Doc, modelIndex: string): Doc => {
    const instances = { ...doc.instances }
    const prefix    = `${modelIndex}/`
    delete instances[modelIndex]
    return { ...doc, instances, edges: doc.edges.filter(([a, b]) => !a.startsWith(prefix) && !b.startsWith(prefix)), probes: doc.probes.filter(probe => !probe.key.startsWith(prefix)), revision: doc.revision + 1 }
}

export const getTitle = (doc: Doc, label: string) => {
    const prefix = label || 'Part'
    const used   = Object.values(doc.instances).map(instance => instance.title.match(/^(.*\D)(\d+)$/)).filter(match => match?.[1] === prefix).map(match => Number(match?.[2]))
    return `${prefix}${Math.max(0, ...used) + 1}`
}
