import { create } from 'zustand'
import { strFromU8 } from 'fflate'
import { Library } from '../../core/Library'
import { Netlist, loadNetlistWasm, type NetlistWasm } from '../../core/Netlist'
import { emptyDoc, fromSketch, type Doc } from '../../core/Document'
import { exportBundle, readBundle, readSketch, type Bundle } from '../../core/Sketch'
import type { Part } from '../../core/Part'
import { VIEWS } from '../../core/Layer'
import { PX_PER_INCH, toInches } from '../../core/Units'
import type { Point } from '../../core/Geometry'
import { buildCircuit } from '../../core/Spice'
import { FONT_FILES } from '../../core/Font'
import { alignInstances, copyItems, createInstance, createNote, createWire, deleteItems, flipInstances, getCarried, moveInstances, pasteItems, rotateInstances, setZOrder, snapConnections, swapPart, type AlignMode, type Clipboard, type ZMode } from '../../engine/Edit'
import { Scene } from '../../engine/Scene'
import { getDrawing } from '../../engine/Drawing'
import type { Instance } from '../../core/Sketch'
import { download, exportAs, type ExportKind } from '../Export'
import { Simulation } from '../../engine/Simulation'
import type { BinTab, Found } from '../../workers/Indexer'
import { Catalog, fetchText, pickSwap, type IndexerStatus } from '../Catalog'
import { Simulator } from '../Simulator'
import wasmUrl from '../../core/Netlist/netlist.wasm?url'

export type View       = typeof VIEWS[number]
export type Viewport   = { x: number, y: number, zoom: number }
export type Simulating = { enabled: boolean, transient: boolean, busy: boolean, result: Simulation | null, error: string | null, step: number, playing: boolean, started: number, series: string[] }

type State = {
    catalog: Catalog
    library: Library
    wasm: NetlistWasm | null
    ready: boolean
    indexed: { done: number, total: number, ready: boolean }
    bins: BinTab[]
    samples: string[]
    mine: string[]
    imported: Found[]
    message: string
    name: string
    doc: Doc
    netlist: Netlist | null
    view: View
    selection: string[]
    hover: string | null
    past: Doc[]
    future: Doc[]
    viewports: Partial<Record<View, Viewport>>
    size: Point
    clipboard: Clipboard | null
    pasted: number
    simulator: Simulator
    simulation: Simulating
    setup: () => Promise<void>
    open: (name: string, bytes: Uint8Array) => Promise<void>
    save: () => void
    openSample: (file: string) => Promise<void>
    preview: (doc: Doc) => void
    commit: (doc: Doc, origin?: Doc) => void
    edit: (change: (doc: Doc) => Doc) => void
    undo: () => void
    redo: () => void
    setView: (view: View) => void
    select: (selection: string[]) => void
    setHover: (hover: string | null) => void
    setViewport: (view: View, viewport: Viewport | undefined) => void
    setSize: (size: Point) => void
    getGrid: () => number
    addPart: (moduleId: string, point: Point) => Promise<void>
    connect: (from: string, to: string | null, end?: Point) => Promise<void>
    remove: (minus: boolean) => void
    rotate: (degrees: number) => void
    flip: (horizontal: boolean) => void
    zOrder: (mode: ZMode) => void
    nudge: (dx: number, dy: number) => void
    copy: () => void
    cut: () => void
    paste: (inPlace: boolean) => Promise<void>
    duplicate: () => Promise<void>
    selectAll: () => void
    addToMine: (moduleIds: string[]) => void
    swap: (modelIndex: string, moduleId: string) => Promise<void>
    toggleSwitch: (modelIndex: string) => Promise<boolean>
    newSketch: () => void
    addNote: () => Promise<void>
    zoom: (factor: number) => void
    setZoom: (zoom: number) => void
    setViewSetting: (key: string, value: string) => void
    align: (mode: AlignMode) => void
    selectWhere: (test: (instance: Instance, part: Part | undefined) => boolean) => void
    exportFile: (kind: ExportKind) => Promise<void>
    setSimulation: (patch: Partial<Simulating>) => void
    simulate: () => Promise<void>
    play: () => void
    pause: () => void
    seek: (step: number) => void
}

const HISTORY  = 200
const NOTE     = 'NoteModuleID'
const WIRE     = 'WireModuleID'
const MINE_KEY = 'circuitmaster.mine'
const PASTE    = 20     // PX POR COLAGEM SEGUIDA (SPEC 02 §10.3)
const GRID: Record<View, string> = { breadboardView: '0.1in', schematicView: '0.1in', pcbView: '0.05in' }
const DEBOUNCE = 200    // MS ENTRE A ÚLTIMA MUDANÇA E A NOVA SIMULAÇÃO (SPEC 04 §5.4)

const IDLE: Simulating = { enabled: false, transient: false, busy: false, result: null, error: null, step: 0, playing: false, started: 0, series: [] }

const readFile = (name: string, bytes: Uint8Array): Bundle | null => {
    try {
        return name.toLowerCase().endsWith('.fz') ? { sketch: readSketch(strFromU8(bytes)), parts: [], svgs: [], others: [] } : readBundle(bytes)
    } catch (error) {
        if (error instanceof Error)
            return null

        throw error
    }
}

const entryOf = (part: Part): Found => ({ moduleId: part.moduleId, root: 'bundle', path: '', title: part.title, family: part.properties.family ?? '', label: part.label, kind: part.kind, icon: part.views.iconView?.image ?? part.views.breadboardView?.image ?? '', obsolete: false, properties: part.properties })

const loadFont = async (library: Library, key: string, file: string) => {
    const response = await fetch(`/fritzing/fonts/${encodeURI(file)}`)

    if (response.ok)
        library.addFont(key, new Uint8Array(await response.arrayBuffer()))
}

const readMine = () => {
    try {
        return JSON.parse(localStorage.getItem(MINE_KEY) ?? '[]') as string[]
    } catch (error) {
        if (error instanceof Error)    // ARMAZENAMENTO BLOQUEADO OU CONTEÚDO CORROMPIDO
            return []

        throw error
    }
}

// DOCUMENTO ABERTO, HISTÓRICO, VISTA CORRENTE E DERIVADOS; O NETLIST SÓ É REFEITO QUANDO A TOPOLOGIA MUDA (SPEC 02 §6.5)
export const useStore = create<State>((set, get) => {
    const withNetlist = (doc: Doc, netlist = get().netlist) => {
        const { wasm, library } = get()

        if (!wasm || (netlist && netlist.doc.revision === doc.revision && netlist.doc.edges === doc.edges))
            return { doc }

        const next = new Netlist(doc, library, wasm)
        next.update()
        return { doc, netlist: next }
    }

    const listen = (status: IndexerStatus) => {
        if (status.type === 'progress')
            return set({ indexed: { done: status.done, total: status.total, ready: false } })

        if (status.type === 'ready')
            return set({ indexed: { done: status.total, total: status.total, ready: true }, message: `${status.count} peças indexadas` })

        set({ bins: status.bins })
    }

    const carriedOf = (selection: string[]) => {
        const { doc, library, view } = get()
        return [...new Set(selection.filter(modelIndex => doc.instances[modelIndex]?.moduleIdRef !== WIRE && !doc.instances[modelIndex]?.views[view]?.locked).flatMap(modelIndex => getCarried(doc, library, view, modelIndex)))]
    }

    const catalog = new Catalog(listen)

    return {
        catalog,
        library: new Library(catalog),
        wasm: null,
        ready: false,
        indexed: { done: 0, total: 0, ready: false },
        bins: [],
        samples: [],
        mine: readMine(),
        imported: [],
        message: '',
        name: 'sem título',
        doc: emptyDoc(),
        netlist: null,
        view: 'breadboardView',
        selection: [],
        hover: null,
        past: [],
        future: [],
        viewports: {},
        size: [0, 0],
        clipboard: null,
        pasted: 0,
        simulator: new Simulator(),
        simulation: IDLE,

        setup: async () => {
            if (get().catalog.worker)
                return

            const started = get().catalog.start()
            const fonts   = Promise.all(Object.entries(FONT_FILES).map(([key, file]) => loadFont(get().library, key, file)))
            const wasm    = await loadNetlistWasm(await (await fetch(wasmUrl)).arrayBuffer())
            const samples = JSON.parse(await fetchText('/fritzing/sketches.json') ?? '[]')
            await Promise.all([started, fonts])
            set({ wasm, samples, ready: true })
            set(withNetlist(get().doc))
        },

        open: async (name, bytes) => {
            const { library } = get()
            const bundle      = readFile(name, bytes)

            if (bundle && !bundle.sketch && bundle.parts.length) {
                const added = library.addBundle(bundle)
                const parts = added.flatMap(moduleId => library.bundled.get(moduleId) ?? [])
                get().addToMine(added)
                return set({ imported: [...get().imported.filter(entry => !added.includes(entry.moduleId)), ...parts.map(entryOf)], message: `${parts.length} peças importadas de ${name} para Meus itens` })
            }

            if (!bundle?.sketch)
                return set({ message: `${name}: arquivo sem sketch legível` })

            library.addBundle(bundle)
            const doc = fromSketch(bundle.sketch)
            set({ message: `abrindo ${name}…` })
            await library.load([WIRE, ...Object.values(doc.instances).map(instance => instance.moduleIdRef)])

            const missing = Object.values(doc.instances).filter(instance => !library.getPart(instance.moduleIdRef)).length
            set({ ...withNetlist(doc, null), name, past: [], future: [], selection: [], hover: null, viewports: {}, pasted: 0, message: missing ? `${missing} peças não encontradas no acervo` : `${name} aberto` })
        },

        save: () => {
            const { doc, library, name } = get()
            const base                   = name.replace(/\.(fzz|fz)$/i, '') || 'sem-titulo'
            const files                  = library.getBundleFiles(Object.values(doc.instances).map(instance => instance.moduleIdRef))
            download(`${base}.fzz`, exportBundle(doc, base, files), 'application/zip')
            set({ message: `${base}.fzz salvo (${Object.keys(doc.instances).length} itens${files.length ? `, ${files.length} arquivos de peça embutidos` : ''})` })
        },

        openSample: async file => {
            const response = await fetch(`/fritzing/sketches/${file}`)

            if (!response.ok)
                return set({ message: `${file}: não encontrado` })

            await get().open(file.split('/').pop() ?? file, new Uint8Array(await response.arrayBuffer()))
        },

        preview: doc => set(withNetlist(doc)),

        commit: (doc, origin = get().doc) => {
            if (doc === origin)
                return set(withNetlist(doc))

            const selection = get().selection.filter(modelIndex => doc.instances[modelIndex])
            set({ ...withNetlist(doc), past: [...get().past, origin].slice(-HISTORY), future: [], selection })
        },

        edit: change => get().commit(change(get().doc)),

        undo: () => {
            const { past, doc, future } = get()

            if (!past.length)
                return

            set({ ...withNetlist(past[past.length - 1]), past: past.slice(0, -1), future: [doc, ...future], hover: null })
        },

        redo: () => {
            const { past, doc, future } = get()

            if (!future.length)
                return

            set({ ...withNetlist(future[0]), past: [...past, doc], future: future.slice(1), hover: null })
        },

        setView: view => set({ view, hover: null }),

        select: selection => set({ selection }),

        setHover: hover => {
            if (get().hover !== hover)
                set({ hover })
        },

        setViewport: (view, viewport) => set({ viewports: { ...get().viewports, [view]: viewport } }),

        setSize: size => set({ size }),

        getGrid: () => {
            const { doc, view } = get()
            return (toInches(doc.settings[view]?.gridSize ?? GRID[view]) ?? 0.1) * PX_PER_INCH
        },

        addPart: async (moduleId, point) => {
            const { library, view, viewports } = get()
            await library.load([moduleId])

            const home   = viewports[view]
            const places = Object.fromEntries(VIEWS.map(other => {
                const target = viewports[other]
                return [other, home && target && other !== view ? [target.x + (point[0] - home.x) * home.zoom / target.zoom, target.y + (point[1] - home.y) * home.zoom / target.zoom] : point]
            })) as Record<View, Point>

            const { doc } = get()
            const next    = createInstance(doc, library, moduleId, places)

            if (next === doc)
                return set({ message: `${moduleId}: peça não encontrada` })

            get().commit(next)
            set({ selection: [String(doc.nextIndex)] })
        },

        connect: async (from, to, end) => {
            await get().library.load([WIRE])
            const { doc, library, view } = get()
            get().commit(createWire(doc, library, view, from, to, end ?? null))
            set({ selection: [String(doc.nextIndex)] })
        },

        remove: minus => {
            const { doc, library, view, selection } = get()
            get().commit(deleteItems(doc, library, view, selection, minus))
            set({ hover: null })
        },

        rotate: degrees => {
            const { doc, library, view, selection } = get()
            const rotated = rotateInstances(doc, library, view, selection, degrees)
            get().commit(view === 'breadboardView' ? snapConnections(rotated, library, selection) : rotated)
        },

        flip: horizontal => {
            const { doc, library, view, selection } = get()
            get().commit(flipInstances(doc, library, view, selection, horizontal))
        },

        zOrder: mode => {
            const { doc, library, view, selection } = get()
            get().commit(setZOrder(doc, library, view, selection, mode))
        },

        nudge: (dx, dy) => {
            const { doc, library, view, selection } = get()
            const moved = carriedOf(selection)
            const next  = moveInstances(doc, library, view, moved, dx, dy)
            get().commit(view === 'breadboardView' ? snapConnections(next, library, moved) : next)
        },

        copy: () => {
            const { doc, selection } = get()
            set({ clipboard: copyItems(doc, selection), pasted: 0 })
        },

        cut: () => {
            get().copy()
            get().remove(false)
        },

        paste: async inPlace => {
            const { clipboard, library, pasted } = get()

            if (!clipboard?.instances.length)
                return

            await library.load(clipboard.instances.map(instance => instance.moduleIdRef))
            const offset: Point = inPlace ? [0, 0] : [PASTE + PASTE * pasted, -PASTE + PASTE * pasted]
            const result        = pasteItems(get().doc, library, clipboard, offset)
            get().commit(result.doc)
            set({ selection: result.indexes, pasted: inPlace ? pasted : pasted + 1 })
        },

        duplicate: async () => {
            const { doc, selection } = get()
            set({ clipboard: copyItems(doc, selection), pasted: 0 })
            await get().paste(false)
        },

        selectAll: () => set({ selection: Object.keys(get().doc.instances) }),

        swap: async (modelIndex, moduleId) => {
            const { library } = get()
            await library.load([moduleId])
            get().commit(swapPart(get().doc, library, modelIndex, moduleId))
        },

        toggleSwitch: async modelIndex => {
            const { doc, library, catalog } = get()
            const part                      = library.getPart(doc.instances[modelIndex]?.moduleIdRef ?? '')
            const status                    = part?.properties['switch status']

            if (!part || !status)
                return false

            const family = await catalog.family(part.properties.family ?? '')
            const states = [...new Set(family.map(entry => entry.properties['switch status']).filter(Boolean))].sort()
            const next   = states[(states.indexOf(status) + 1) % states.length]
            const target = next && next !== status ? pickSwap(family, part.properties, 'switch status', next) : undefined

            if (target)
                await get().swap(modelIndex, target.moduleId)

            return target !== undefined
        },

        newSketch: () => {
            if (get().past.length && !window.confirm('Descartar as alterações do sketch aberto?'))
                return

            set({ ...withNetlist(emptyDoc(), null), name: 'sem título', past: [], future: [], selection: [], hover: null, viewports: {}, pasted: 0, message: 'sketch novo' })
        },

        addNote: async () => {
            const { library, view, viewports, size } = get()
            const vp = viewports[view] ?? { x: 0, y: 0, zoom: 1 }
            await library.load([NOTE])

            const { doc } = get()
            get().commit(createNote(doc, view, [vp.x + size[0] / 2 / vp.zoom, vp.y + size[1] / 2 / vp.zoom]))
            set({ selection: [String(doc.nextIndex)] })
        },

        zoom: factor => {
            const viewport = get().viewports[get().view]

            if (viewport)
                get().setZoom(viewport.zoom * factor)
        },

        setZoom: zoom => {
            const { viewports, view, size } = get()
            const viewport                  = viewports[view]
            const [w, h]                    = size

            if (viewport)
                get().setViewport(view, { x: viewport.x + w / 2 / viewport.zoom - w / 2 / zoom, y: viewport.y + h / 2 / viewport.zoom - h / 2 / zoom, zoom })
        },

        setViewSetting: (key, value) => {
            const { doc, view } = get()
            set({ doc: { ...doc, settings: { ...doc.settings, [view]: { ...doc.settings[view], [key]: value } } } })
        },

        align: mode => {
            const { doc, library, view, selection } = get()
            get().commit(alignInstances(doc, library, view, selection, mode))
        },

        selectWhere: test => {
            const { doc, library, view } = get()
            const scene                  = new Scene(doc, library, view)
            set({ selection: Object.values(doc.instances).filter(instance => scene.isShown(instance) && test(instance, library.getPart(instance.moduleIdRef))).map(instance => instance.modelIndex) })
        },

        exportFile: async kind => {
            const { doc, library, netlist, view, name, simulation } = get()
            const svg = document.getElementById('canvas') as SVGSVGElement | null
            set({ message: 'exportando…' })

            try {
                set({ message: await exportAs(kind, { doc, library, netlist, view, name, transient: simulation.transient, svg, bounds: getDrawing(new Scene(doc, library, view), null).bounds }) })
            } catch (error) {
                if (!(error instanceof Error))
                    throw error

                set({ message: `falha ao exportar: ${error.message}` })
            }
        },

        setSimulation: patch => set({ simulation: { ...get().simulation, ...patch } }),

        simulate: async () => {
            const { doc, library, netlist, simulation, simulator } = get()

            if (!netlist || !simulation.enabled)
                return

            const circuit = buildCircuit(doc, library, netlist, simulation.transient)

            if (!circuit.simulated.length)
                return get().setSimulation({ result: new Simulation(doc, library, circuit, {}), error: 'nenhuma peça simulável ligada ao circuito', busy: false, playing: false })

            get().setSimulation({ busy: true })
            const run    = await simulator.run(circuit.deck)
            const result = new Simulation(doc, library, circuit, run.vectors)

            if (get().simulation.enabled)
                get().setSimulation({ busy: false, result, error: run.error, step: 0, playing: simulation.transient && !run.error, started: performance.now() })
        },

        play: () => {
            const { simulation } = get()
            const interval       = simulation.result?.circuit.analysis.type === 'tran' ? simulation.result.circuit.analysis.interval : 0
            const step           = simulation.step >= (simulation.result?.steps ?? 1) - 1 ? 0 : simulation.step
            get().setSimulation({ playing: true, step, started: performance.now() - step * interval })
        },

        pause: () => get().setSimulation({ playing: false }),

        seek: step => get().setSimulation({ step, playing: false }),

        addToMine: moduleIds => {
            const mine = [...new Set([...get().mine, ...moduleIds])]
            set({ mine })

            try {
                localStorage.setItem(MINE_KEY, JSON.stringify(mine))
            } catch (error) {
                set({ message: `bin não gravado: ${error instanceof Error ? error.message : error}` })
            }
        }
    }
})

const signature = (doc: Doc) => Object.values(doc.instances).filter(instance => instance.moduleIdRef !== WIRE).map(instance => `${instance.modelIndex}:${instance.moduleIdRef}:${instance.title}:${JSON.stringify(instance.properties)}`).join('|')

let pending: ReturnType<typeof setTimeout> | undefined

// COM O SIMULADOR LIGADO, MUDANÇA DE TOPOLOGIA, DE PEÇA OU DE PROPRIEDADE AGENDA NOVA SIMULAÇÃO
useStore.subscribe((state, previous) => {
    const toggled = state.simulation.enabled !== previous.simulation.enabled || state.simulation.transient !== previous.simulation.transient
    const changed = state.netlist !== previous.netlist || (state.doc !== previous.doc && signature(state.doc) !== signature(previous.doc))

    if (!state.simulation.enabled || !(toggled || changed))
        return

    clearTimeout(pending)
    pending = setTimeout(() => void useStore.getState().simulate(), DEBOUNCE)
})
