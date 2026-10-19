import { getPinsIn, isVisibleIn, type Connector, type Kind } from '../Part'
import type { Instance } from '../Sketch'
import { VIEWS } from '../Layer'
import { keyOf, splitKey, wireViewOf, type Doc } from '../Document'
import type { Library } from '../Library'
import type { Point } from '../Geometry'
import { getStrips } from '../Generator'

type View = typeof VIEWS[number]

type Exports = {
    memory: WebAssembly.Memory
    alloc: (bytes: number) => number
    release: (pointer: number, bytes: number) => void
    components: (n: number, edges: number, m: number, labels: number) => void
    spanningTree: (k: number, points: number, classes: number, pairs: number) => number
}

export type NetlistWasm = {
    components: (n: number, edges: Uint32Array) => Uint32Array
    spanningTree: (points: Float64Array, classes: Uint32Array) => Uint32Array
}

export const loadNetlistWasm = async (bytes: BufferSource): Promise<NetlistWasm> => {
    const { instance } = await WebAssembly.instantiate(bytes)
    const wasm         = instance.exports as unknown as Exports

    const write = <T extends Uint32Array | Float64Array>(data: T) => {
        const pointer = wasm.alloc(Math.max(8, data.byteLength))
        new (data.constructor as new (buffer: ArrayBuffer, offset: number, length: number) => T)(wasm.memory.buffer, pointer, data.length).set(data)
        return pointer
    }

    const components = (n: number, edges: Uint32Array) => {
        const edgePointer  = write(edges)
        const labelPointer = wasm.alloc(Math.max(8, n * 4))
        wasm.components(n, edgePointer, edges.length / 2, labelPointer)
        const labels = new Uint32Array(wasm.memory.buffer, labelPointer, n).slice()
        wasm.release(edgePointer, Math.max(8, edges.byteLength))
        wasm.release(labelPointer, Math.max(8, n * 4))
        return labels
    }

    const spanningTree = (points: Float64Array, classes: Uint32Array) => {
        const k            = classes.length
        const pointPointer = write(points)
        const classPointer = write(classes)
        const pairPointer  = wasm.alloc(Math.max(8, 2 * k * 4))
        const count        = wasm.spanningTree(k, pointPointer, classPointer, pairPointer)
        const pairs        = new Uint32Array(wasm.memory.buffer, pairPointer, 2 * count).slice()
        wasm.release(pointPointer, Math.max(8, points.byteLength))
        wasm.release(classPointer, Math.max(8, classes.byteLength))
        wasm.release(pairPointer, Math.max(8, 2 * k * 4))
        return pairs
    }

    return { components, spanningTree }
}

const ITEM_IDS = 10    // ID DE ITEM POR VISTA = modelIndex × 10 (SPEC 01 §5.5)

const escapeXml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const MEMBER_KINDS: Kind[] = ['part', 'breadboard', 'board', 'resizableBoard', 'via', 'jumper', 'copperFill']
const GROUNDED          = new Set(['gnd', 'vss', 'ground'])
const VOLTAGE_SCALE     = 1e6

export type RoutingStatus = { nets: number, routed: number, left: number }

// CONECTIVIDADE ÚNICA DO DOCUMENTO E SUAS PROJEÇÕES POR VISTA (SPEC 02 §2)
export class Netlist {
    doc: Doc
    library: Library
    wasm: NetlistWasm
    keys: string[] = []
    index = new Map<string, number>()
    nets: Partial<Record<View, Uint32Array>> = {}
    routed: Partial<Record<View, Uint32Array>> = {}
    linked: Partial<Record<View, Set<number>>> = {}
    members: Partial<Record<View, number[]>> = {}
    buses: (string | null)[] = []

    constructor(doc: Doc, library: Library, wasm: NetlistWasm) {
        this.doc     = doc
        this.library = library
        this.wasm    = wasm
    }

    update() {
        this.keys  = []
        this.index = new Map()
        this.buses = []

        const ports: Record<View, boolean[]>  = { breadboardView: [], schematicView: [], pcbView: [] }
        const member: Record<View, boolean[]> = { breadboardView: [], schematicView: [], pcbView: [] }
        const wireView: (View | null)[]       = []
        const internal: [number, number, View][] = []
        const fixed: number[]                 = []
        const classes                         = new Map<string, number[]>()

        for (const instance of Object.values(this.doc.instances)) {
            const part = this.library.getPart(instance.moduleIdRef)

            if (!part)
                continue

            const first  = this.keys.length
            const flags  = Object.values(instance.views)[0]?.geometry.wireFlags ?? 0
            const merged = { ...part.properties, ...instance.properties }

            for (const connector of part.connectors) {
                const node = this.keys.length
                this.keys.push(keyOf(instance.modelIndex, connector.id))
                this.index.set(this.keys[node], node)
                wireView.push(part.kind === 'wire' ? wireViewOf(flags) : null)

                const bus = part.buses.findIndex(members => members.includes(connector.id))
                this.buses.push(bus >= 0 ? `${instance.modelIndex}/${bus}` : null)

                for (const view of VIEWS) {
                    const pins = instance.views[view] ? getPinsIn(part, connector, view) : []
                    ports[view].push(pins.length > 0)
                    member[view].push(pins.some(pin => !pin.hybrid) && isVisibleIn(part, view) && (MEMBER_KINDS.includes(part.kind) || part.kind === 'symbol' && view === 'schematicView'))
                }

                if (part.kind !== 'symbol')
                    continue

                const label     = (merged.label ?? '').trim()
                const voltage   = Number(merged.voltage ?? 0)
                const netLabel  = part.moduleId.endsWith('NetLabelModuleID') || part.moduleId === 'PowerLabelModuleID'
                const reference = merged.type === 'voltage reference'
                const key       = netLabel ? `label:${reference ? voltage : label}` : GROUNDED.has(connector.name.toLowerCase()) ? 'gnd' : `volt:${Math.trunc(voltage * VOLTAGE_SCALE)}`
                classes.set(key, [...classes.get(key) ?? [], node])
            }

            if (part.kind === 'wire' && this.keys.length - first === 2)
                internal.push([first, first + 1, wireViewOf(flags)])

            part.buses.forEach(members => {
                const nodes = members.map(id => this.index.get(keyOf(instance.modelIndex, id))).filter((node): node is number => node !== undefined)
                nodes.slice(1).forEach(node => fixed.push(nodes[0], node))
            })

            getStrips(part.moduleId, instance.properties).forEach(pair => {
                const [a, b] = pair.map(id => this.index.get(keyOf(instance.modelIndex, id)))

                if (a !== undefined && b !== undefined)
                    fixed.push(a, b)
            })
        }

        classes.forEach(nodes => nodes.slice(1).forEach(node => fixed.push(nodes[0], node)))

        const explicit = this.doc.edges.map(([a, b]) => [this.index.get(a), this.index.get(b)]).filter((pair): pair is [number, number] => pair[0] !== undefined && pair[1] !== undefined)

        for (const view of VIEWS) {
            const isOwn   = (pair: number[]) => pair.every(node => wireView[node] === null) ? view === 'breadboardView' : pair.every(node => wireView[node] === null || wireView[node] === view)
            const present = explicit.filter(([a, b]) => ports[view][a] && ports[view][b])
            const wires   = internal.flatMap(([a, b]) => [a, b])
            const own     = internal.filter(([, , home]) => home === view).flatMap(([a, b]) => [a, b])

            const linked = present.filter(isOwn)

            this.nets[view]    = this.wasm.components(this.keys.length, Uint32Array.from([...present.flat(), ...wires, ...fixed]))
            this.routed[view]  = this.wasm.components(this.keys.length, Uint32Array.from([...linked.flat(), ...own, ...fixed]))
            this.linked[view]  = new Set(linked.flat())
            this.members[view] = member[view].flatMap((is, node) => is ? [node] : [])
        }
    }

    getNet(view: View, key: string) {
        const node   = this.index.get(key)
        const labels = this.nets[view]

        if (node === undefined || !labels)
            return []

        return this.keys.filter((_, i) => labels[i] === labels[node])
    }

    getGroups(view: View) {
        const labels = this.nets[view] ?? new Uint32Array()
        const groups = new Map<number, number[]>()

        for (const node of this.members[view] ?? [])
            groups.set(labels[node], [...groups.get(labels[node]) ?? [], node])

        return [...groups.values()].filter(nodes => nodes.length > 1)
    }

    getRatsnest(view: View, locate: (key: string) => Point | null) {
        const routed = this.routed[view]

        return this.getGroups(view).flatMap(nodes => {
            const placed = nodes.map(node => [node, locate(this.keys[node])] as const).filter((item): item is readonly [number, Point] => item[1] !== null)

            if (!routed || placed.length < 2)
                return []

            const points = Float64Array.from(placed.flatMap(([, point]) => point))
            const pairs  = this.wasm.spanningTree(points, Uint32Array.from(placed.map(([node]) => routed[node])))
            return Array.from({ length: pairs.length / 2 }, (_, i) => [this.keys[placed[pairs[2 * i]][0]], this.keys[placed[pairs[2 * i + 1]][0]]] as const)
        })
    }

    // NETLIST XML DA VISTA: UMA <net> POR GRUPO EQUIPOTENCIAL, SÓ CONECTORES DE PEÇAS VISÍVEIS, FILTRANDO erc ignore (SPEC 02 §7.4)
    export(view: View, isShown: (instance: Instance) => boolean, name: string) {
        const labels = this.nets[view] ?? new Uint32Array()
        const groups = new Map<number, [string, Connector, Instance][]>()

        this.keys.forEach((key, node) => {
            const [modelIndex, id] = splitKey(key)
            const instance         = this.doc.instances[modelIndex]
            const part             = instance ? this.library.getPart(instance.moduleIdRef) : undefined
            const connector        = part?.connectors.find(candidate => candidate.id === id)

            if (instance && part && connector && part.kind !== 'wire' && isShown(instance))
                groups.set(labels[node], [...groups.get(labels[node]) ?? [], [key, connector, instance]])
        })

        const kept = [...groups.values()].map(members => members.filter(([, connector]) => connector.ignore !== 'always' && !(connector.ignore === 'ifunconnected' && members.length === 1))).filter(members => members.length)
        const nets = kept.map(members => `  <net>\n${members.map(([, connector, instance]) => `    <connector id="${escapeXml(connector.id)}" name="${escapeXml(connector.name)}">\n      <part id="${Number(instance.modelIndex) * ITEM_IDS}" label="${escapeXml(instance.title)}" title="${escapeXml(this.library.getPart(instance.moduleIdRef)?.title ?? '')}"/>\n${connector.erc ? `      ${connector.erc}\n` : ''}    </connector>\n`).join('')}  </net>\n`).join('')
        return `<?xml version='1.0' encoding='UTF-8'?>\n<!-- CircuitMaster -->\n<netlist sketch="${escapeXml(name)}" date="${new Date().toISOString()}">\n${nets}</netlist>\n`
    }

    getStatus(view: View): RoutingStatus {
        const routed = this.routed[view]
        const status = { nets: 0, routed: 0, left: 0 }

        for (const nodes of this.getGroups(view)) {
            const owners = new Set(nodes.map(node => splitKey(this.keys[node])[0]))
            const buses  = new Set(nodes.map(node => this.buses[node]))

            if (owners.size === 1 && buses.size === 1 && !buses.has(null))
                continue

            const parts = new Set(nodes.map(node => routed?.[node]))
            status.nets   += 1
            status.routed += parts.size === 1 ? 1 : 0
            status.left   += parts.size - 1
        }

        return status
    }
}
