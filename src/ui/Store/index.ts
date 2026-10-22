import { create } from 'zustand'
import { Library } from '../../core/Library'
import { Netlist, loadNetlistWasm, type NetlistWasm } from '../../core/Netlist'
import { emptyDoc, fromSketch, keyOf, removeInstance, splitKey, type Doc, type Probe, type ProbeKind } from '../../core/Document'
import { exportBinBundle, readFile, type BundleFile, type Instance } from '../../core/Sketch'
import type { Part } from '../../core/Part'
import { VIEWS } from '../../core/Layer'
import { PX_PER_INCH, toInches } from '../../core/Units'
import { apply, boxesTouch, unionBoxes, type Matrix, type Point } from '../../core/Geometry'
import { SWITCH_KEY, buildCircuit, getSwitching, resumeCircuit, type Event } from '../../core/Spice'
import { FONT_FILES } from '../../core/Font'
import { getArtwork, pickBoard } from '../../core/Cam'
import { getGroupOf, type Violation } from '../../core/Drc'
import { contains, type FillFragment, type FillMode } from '../../core/Fill'
import { buildSheetGrid, type Plan } from '../../core/Router'
import { alignInstances, alignToGrid, applyPlan, connectByPath, copyItems, createFills, createInstance, createNote, deleteAutorouted, deleteItems, drawWires, flipInstances, getCarried, getChangedWires, getGridShift, moveInstances, pasteItems, rotateInstances, setZOrder, snapConnections, squareWires, swapPart, tidyWires, type AlignMode, type Clipboard, type WireEnd, type ZMode, setProperty, setPosition, setTraceSide } from '../../engine/Edit'
import { Scene, WIRE_STYLE } from '../../engine/Scene'
import { getDrawing } from '../../engine/Drawing'
import { Simulation, fromRest, getInitial, joinRuns } from '../../engine/Simulation'
import { BENCHES, BENCH_PARTS, buildBench } from '../../engine/Bench'
import { FEATURED } from '../../core/Featured'
import type { BinTab, Found } from '../../workers/Indexer'
import { Catalog, fetchBytes, fetchText, pickSwap, type IndexerStatus } from '../Catalog'
import { Simulator } from '../Simulator'
import { createPcbTools, getConfig, type Progress } from '../Pcb'
import { createSaver } from '../Saver'
import { boardProblem, download, exportAs, getClipper, type ExportKind } from '../Export'
import { PARTS, Vault } from '../Vault'
import { Autosave, type Snapshot, type Version } from '../Autosave'
import wasmUrl from '../../core/Netlist/netlist.wasm?url'

export type View       = typeof VIEWS[number]
export type Viewport   = { x: number, y: number, zoom: number }
export type Tool       = 'select' | 'area' | ProbeKind
export type Panel      = 'properties' | 'routing' | 'document'
export type Left       = 'parts' | 'project' | 'problems'
export type Theme      = 'dark' | 'light'
export type Side       = 'both' | 'top' | 'bottom'
export type Readout    = 'measures' | 'response' | 'settings'
export type UserBin    = { title: string, moduleIds: string[] }
export type Dialog     = 'shortcuts' | 'about' | 'recovery' | 'versions' | null
export type Checked    = { violations: Violation[], frame: Matrix, keepout: number }
export type Show       = { values: boolean, chart: boolean }
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
    userBins: UserBin[]
    imported: Found[]
    editing: string | null
    message: string
    name: string
    doc: Doc
    netlist: Netlist | null
    view: View
    selection: string[]
    probe: string | null
    tool: Tool
    panel: Panel
    left: Left
    theme: Theme
    side: Side
    placing: string | null
    saved: Doc
    stored: boolean
    readout: Readout
    hover: string | null
    past: Doc[]
    future: Doc[]
    viewports: Partial<Record<View, Viewport>>
    size: Point
    clipboard: Clipboard | null
    pasted: number
    simulator: Simulator
    simulation: Simulating
    show: Show
    dialog: Dialog
    pcb: ReturnType<typeof createPcbTools>
    saver: ReturnType<typeof createSaver>
    vault: Vault
    autosave: Autosave
    recovery: Version[]
    drc: Checked | null
    routing: Progress | null
    setup: () => Promise<void>
    open: (name: string, bytes: Uint8Array) => Promise<void>
    save: () => Promise<void>
    openSample: (file: string) => Promise<void>
    openBench: (id: string) => Promise<void>
    recover: (version: Version) => Promise<void>
    dismissRecovery: () => Promise<void>
    showVersions: () => Promise<void>
    preview: (doc: Doc) => void
    commit: (doc: Doc, origin?: Doc) => void
    edit: (change: (doc: Doc) => Doc) => void
    undo: () => void
    redo: () => void
    jump: (steps: number) => void
    setView: (view: View) => void
    select: (selection: string[]) => void
    setHover: (hover: string | null) => void
    setViewport: (view: View, viewport: Viewport | undefined) => void
    setSize: (size: Point) => void
    getGrid: () => number
    gridOf: (view: View) => number
    isAligned: (view: View) => boolean
    isOrthogonal: (view: View) => boolean
    tidy: (origin: Doc, doc: Doc) => Doc
    addPart: (moduleId: string, point: Point) => Promise<void>
    connect: (from: string, to: string) => Promise<void>
    drawWire: (from: string[], end: WireEnd | null, points: Point[]) => Promise<void>
    setTool: (tool: Tool) => void
    setPanel: (panel: Panel) => void
    setLeft: (left: Left) => void
    toggleTheme: () => void
    setSide: (side: Side) => void
    makeBoard: () => Promise<void>
    setPlacing: (moduleId: string | null) => void
    setReadout: (readout: Readout) => void
    selectProbe: (id: string | null) => void
    addProbe: (probe: Omit<Probe, 'id'>) => void
    updateProbe: (id: string, patch: Partial<Probe>) => void
    removeProbes: (ids: string[]) => void
    setProjectProperties: (values: Record<string, string>) => void
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
    exportMine: () => void
    createBin: (title: string, moduleIds: string[]) => void
    renameBin: (index: number, title: string) => void
    deleteBin: (index: number) => void
    addToBin: (index: number, moduleIds: string[]) => void
    exportBin: (index: number) => void
    keepParts: (files: BundleFile[]) => Promise<void>
    editPart: (modelIndex: string | null) => void
    installPart: (files: BundleFile[], replace: string | null) => Promise<void>
    swap: (modelIndex: string, moduleId: string) => Promise<void>
    toggleSwitch: (modelIndex: string) => Promise<boolean>
    setSwitching: (modelIndex: string, events: Event[]) => Promise<void>
    newSketch: () => void
    addNote: () => Promise<void>
    zoom: (factor: number) => void
    setZoom: (zoom: number) => void
    setViewSetting: (key: string, value: string) => void
    setPcbSettings: (values: Record<string, string>) => void
    align: (mode: AlignMode) => void
    selectWhere: (test: (instance: Instance, part: Part | undefined) => boolean) => void
    exportFile: (kind: ExportKind) => Promise<void>
    checkRules: () => Promise<void>
    fillCopper: (mode: FillMode) => Promise<void>
    fillUnit: (point: Point) => Promise<void>
    removeFills: () => void
    autoroute: () => Promise<void>
    autorouteSheet: () => Promise<void>
    cancelRouting: () => void
    clearAutorouted: () => void
    setSimulation: (patch: Partial<Simulating>) => void
    setShow: (patch: Partial<Show>) => void
    simulate: () => Promise<void>
    play: () => void
    pause: () => void
    seek: (step: number) => void
}

const HISTORY   = 200
const TOOL_NAMES: Record<ProbeKind, string> = { voltage: 'Ponta de tensão', current: 'Ponta de corrente', both: 'Ponta de tensão e corrente' }
const NOTE      = 'NoteModuleID'
const FILL      = 'GroundPlaneModuleID'
const VIA       = 'ViaModuleID'
const WIRE      = 'WireModuleID'
const BOARD     = 'TwoLayerRectanglePCBModuleID'
const BOARD_MARGIN = 13.5    // PX: 0,15 in DE FOLGA ENTRE AS PEÇAS E A BORDA DA PLACA CRIADA
const INSTRUMENTS  = ['voltage source', 'multimeter', 'oscilloscope']    // FAMÍLIAS DE BANCADA, FORA DA PLACA
const MINE_KEY  = 'circuitmaster.mine'
const BINS_KEY  = 'circuitmaster.bins'
const SHOW_KEY  = 'circuitmaster.show'     // VALORES NAS PONTAS E PAINEL DE TABELA E GRÁFICO DA SIMULAÇÃO
const THEME_KEY = 'cm-theme'               // MESMA CHAVE QUE O <head> LÊ ANTES DE DESENHAR (DESIGN.md §7)
const PARTS_KEY = 'circuitmaster.parts'    // ARQUIVOS DAS PEÇAS QUE VIERAM DE .fzpz/.fzbz OU DO EDITOR (SPEC 01 §8A.6)
const PASTE     = 20     // PX POR COLAGEM SEGUIDA (SPEC 02 §10.3)
const GRID: Record<View, string> = { breadboardView: '0.1in', schematicView: '0.1in', pcbView: '0.05in' }
const DEBOUNCE  = 200    // MS ENTRE A ÚLTIMA MUDANÇA E A NOVA SIMULAÇÃO (SPEC 04 §5.4)

const IDLE: Simulating = { enabled: false, transient: false, busy: false, result: null, error: null, step: 0, playing: false, started: 0, series: [] }

const entryOf = (part: Part): Found => ({ moduleId: part.moduleId, root: 'bundle', path: '', title: part.title, family: part.properties.family ?? '', label: part.label, kind: part.kind, icon: part.views.iconView?.image ?? part.views.breadboardView?.image ?? '', obsolete: false, properties: part.properties })

const loadFont = async (library: Library, key: string, file: string) => {
    const response = await fetch(`/fritzing/fonts/${encodeURI(file)}`)

    if (response.ok)
        library.addFont(key, new Uint8Array(await response.arrayBuffer()))
}

const readStored = <T,>(key: string, fallback: T): T => {
    try {
        return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback
    } catch (error) {
        if (error instanceof Error)    // ARMAZENAMENTO BLOQUEADO OU CONTEÚDO CORROMPIDO
            return fallback

        throw error
    }
}

// GRAVA NO ARMAZENAMENTO DO NAVEGADOR (TEXTO COMO ESTÁ, O RESTO EM JSON); DEVOLVE O MOTIVO SE NÃO COUBE OU ESTÁ BLOQUEADO
const writeStored = (key: string, value: unknown) => {
    try {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
        return null
    } catch (error) {
        if (error instanceof Error)
            return error.message

        throw error
    }
}

const removeStored = (key: string) => {
    try {
        localStorage.removeItem(key)
    } catch (error) {
        if (!(error instanceof Error))
            throw error
    }
}

// PEÇAS DO USUÁRIO QUE AINDA ESTÃO NO localStorage (VERSÕES ANTERIORES) PASSAM PARA O INDEXEDDB; SE ELE FALHAR, FICAM ONDE ESTÃO
const migrateParts = async (vault: Vault) => {
    const legacy = readStored<BundleFile[]>(PARTS_KEY, [])
    const failed = legacy.length ? await vault.save(PARTS, legacy.map(file => [file.name, file])) : null

    if (legacy.length && !failed)
        removeStored(PARTS_KEY)

    return failed ? legacy : vault.load<BundleFile>(PARTS)
}

// O .fzz DO DOCUMENTO COM AS PEÇAS DE PACOTE, MONTADO NO WORKER; FALHA VOLTA COMO A CAUSA
const bundleOf = async ({ doc, name, library, saver }: { doc: Doc, name: string, library: Library, saver: ReturnType<typeof createSaver> }) => {
    const base  = name.replace(/\.(fzz|fz)$/i, '') || 'sem-titulo'
    const files = library.getBundleFiles(Object.values(doc.instances).map(instance => instance.moduleIdRef))
    const bytes = await saver.request<Uint8Array>({ doc, name: base, files })
    return bytes ? { base, files, bytes } : `o .fzz não foi montado (${saver.failure || 'cancelado'})`
}

// O QUE O SALVAMENTO AUTOMÁTICO GRAVA: O .fzz COMO O SALVAR GRAVARIA
const snapshotOf = async (state: { doc: Doc, saved: Doc, name: string, library: Library, saver: ReturnType<typeof createSaver> }): Promise<Snapshot | string> => {
    const bundle = await bundleOf(state)
    return typeof bundle === 'string' ? bundle : { name: state.name, dirty: state.doc !== state.saved, count: Object.keys(state.doc.instances).length, bytes: bundle.bytes }
}

const PADS = /(Copper0)?PadModuleID$|SchematicFrameModuleID$/

// PEÇA QUE O EDITOR ABRE: TIPO PEÇA COMUM, MENOS PADS E MOLDURA (SPEC 01 §8A.1)
export const isEditable = (part: Part | undefined) => part?.kind === 'part' && !PADS.test(part.moduleId)

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
    const blank   = emptyDoc()
    const vault   = new Vault()

    return {
        catalog,
        library: new Library(catalog),
        wasm: null,
        ready: false,
        indexed: { done: 0, total: 0, ready: false },
        bins: [],
        samples: [],
        mine: readStored<string[]>(MINE_KEY, []),
        userBins: readStored<UserBin[]>(BINS_KEY, []),
        imported: [],
        editing: null,
        message: '',
        name: 'sem título',
        doc: blank,
        netlist: null,
        view: 'breadboardView',
        selection: [],
        probe: null,
        tool: 'select',
        panel: 'properties',
        left: 'parts',
        theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
        side: 'both',
        placing: null,
        saved: blank,
        stored: false,
        readout: 'measures',
        hover: null,
        past: [],
        future: [],
        viewports: {},
        size: [0, 0],
        clipboard: null,
        pasted: 0,
        simulator: new Simulator(),
        simulation: IDLE,
        show: readStored<Show>(SHOW_KEY, { values: true, chart: true }),
        dialog: null,
        pcb: createPcbTools(),
        saver: createSaver(),
        vault,
        autosave: new Autosave(vault, message => set({ message })),
        recovery: [],
        drc: null,
        routing: null,

        setup: async () => {
            if (get().catalog.supervisor.worker)
                return

            const started = get().catalog.start()
            get().saver.start()    // SALVAR NÃO PODE DEPENDER DA REDE: O WORKER QUE MONTA O .fzz SOBE JÁ NA ABERTURA
            const fonts   = Promise.all(Object.entries(FONT_FILES).map(([key, file]) => loadFont(get().library, key, file)))
            const wasm    = await loadNetlistWasm(await (await fetch(wasmUrl)).arrayBuffer())
            const samples = JSON.parse(await fetchText('/fritzing/sketches.json') ?? '[]')
            const kept    = await migrateParts(get().vault)
            const added   = get().library.addBundle({ sketch: null, parts: kept.filter(file => file.name.startsWith('part.')), svgs: kept.filter(file => file.name.startsWith('svg.')), others: [], bin: null })
            await Promise.all([started, fonts])
            set({ wasm, samples, ready: true, imported: added.flatMap(moduleId => get().library.bundled.get(moduleId) ?? []).map(entryOf) })
            set(withNetlist(get().doc))

            get().autosave.setup()
            const recovery = await get().autosave.getRecoverable()

            if (recovery.length)
                set({ recovery, dialog: 'recovery' })
        },

        open: async (name, bytes) => {
            const { library } = get()
            const bundle      = readFile(name, bytes)

            if (typeof bundle === 'string')
                return set({ message: `${name}: ${bundle}` })

            if (bundle && !bundle.sketch && (bundle.parts.length || bundle.bin)) {
                const added  = library.addBundle(bundle)
                const parts  = added.flatMap(moduleId => library.bundled.get(moduleId) ?? [])
                const listed = bundle.bin?.entries.map(entry => entry.moduleIdRef).filter(moduleId => moduleId !== '__spacer__') ?? []
                const title  = bundle.bin?.title.trim() || name.replace(/\.fzbz?$/i, '')
                get().keepParts([...bundle.parts, ...bundle.svgs])
                set({ imported: [...get().imported.filter(entry => !added.includes(entry.moduleId)), ...parts.map(entryOf)] })

                if (bundle.bin)
                    return get().createBin(title, [...new Set([...listed, ...added])])

                get().addToMine(added)
                return set({ message: `${added.length} peças de ${name} em Meus itens` })
            }

            if (!bundle?.sketch)
                return set({ message: `${name}: arquivo sem sketch legível` })

            if (get().doc !== get().saved && !window.confirm('Descartar as alterações do sketch aberto? (elas ficam nas versões salvas automaticamente)'))
                return

            library.addBundle(bundle)
            const doc = fromSketch(bundle.sketch)
            set({ message: `abrindo ${name}…` })
            await library.load([WIRE, ...Object.values(doc.instances).map(instance => instance.moduleIdRef)])

            const missing = Object.values(doc.instances).filter(instance => !library.getPart(instance.moduleIdRef)).length
            set({ ...withNetlist(doc, null), name, saved: doc, stored: true, past: [], future: [], selection: [], probe: null, hover: null, viewports: {}, pasted: 0, message: missing ? `${missing} peças não encontradas no acervo` : `${name} aberto` })
        },

        save: async () => {
            const { doc }  = get()
            const bundle   = await bundleOf(get())

            if (typeof bundle === 'string')
                return set({ message: `não salvou: ${bundle}` })

            download(`${bundle.base}.fzz`, bundle.bytes, 'application/zip')
            set({ saved: doc, stored: true, message: `${bundle.base}.fzz salvo (${Object.keys(doc.instances).length} itens${bundle.files.length ? `, ${bundle.files.length} arquivos de peça embutidos` : ''})` })
        },

        openSample: async file => {
            const bytes = await fetchBytes(`/fritzing/sketches/${file}`)

            if (!bytes)
                return set({ message: `${file}: não encontrado ou sem rede` })

            await get().open(file.split('/').pop() ?? file, bytes)
        },

        // CIRCUITO DE TESTE: SKETCH NOVO NO ESQUEMÁTICO COM O SIMULADOR LIGADO NO TRANSITÓRIO DO MODELO DELE (SPEC 04 §8.9)
        openBench: async id => {
            const bench = BENCHES.find(item => item.id === id)

            if (!bench || (get().doc !== get().saved && !window.confirm('Descartar as alterações do sketch aberto? (elas ficam nas versões salvas automaticamente)')))
                return

            await get().library.load([...BENCH_PARTS, WIRE])
            const doc = buildBench(get().library, bench)
            set({ ...withNetlist(doc, null), name: bench.title, saved: doc, stored: false, past: [], future: [], selection: [], probe: null, hover: null, viewports: {}, pasted: 0, view: 'schematicView', message: bench.summary, simulation: { ...IDLE, enabled: true, transient: true } })
            get().setReadout('response')
        },

        // VERSÃO SALVA SOZINHA ABERTA COMO DOCUMENTO NÃO SALVO; AS SESSÕES MORTAS OFERECIDAS DEIXAM DE SER OFERECIDAS
        recover: async version => {
            const { recovery, autosave, dialog } = get()
            set({ dialog: null })
            await get().open(version.name, version.bytes)
            set({ saved: emptyDoc(), stored: false, recovery: [], message: `${version.name} recuperado da versão de ${new Date(version.time).toLocaleString('pt-BR')}; salve para guardar o arquivo` })

            if (dialog === 'recovery')
                await autosave.dismiss(recovery)
        },

        dismissRecovery: async () => {
            const { recovery, autosave } = get()
            const failed                 = await autosave.dismiss(recovery)
            set({ recovery: [], dialog: null, message: failed ? `versões não descartadas: ${failed}` : 'versões não salvas descartadas' })
        },

        showVersions: async () => set({ recovery: await get().autosave.getVersions(), dialog: 'versions' }),

        preview: doc => set(withNetlist(doc)),

        commit: (doc, origin = get().doc) => {
            if (doc === origin)
                return set(withNetlist(doc))

            const selection = get().selection.filter(modelIndex => doc.instances[modelIndex])
            const probe     = doc.probes.some(item => item.id === get().probe) ? get().probe : null
            set({ ...withNetlist(doc), past: [...get().past, origin].slice(-HISTORY), future: [], selection, probe, drc: null })
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

        // VÁRIOS PASSOS DE UMA VEZ PELO HISTÓRICO: NEGATIVO DESFAZ, POSITIVO REFAZ (DOCK UNDO HISTORY DO FRITZING)
        jump: steps => {
            const { past, doc, future } = get()
            const timeline              = [...past, doc, ...future]
            const target                = Math.max(0, Math.min(timeline.length - 1, past.length + steps))

            if (target !== past.length)
                set({ ...withNetlist(timeline[target]), past: timeline.slice(0, target), future: timeline.slice(target + 1), hover: null })
        },

        setView: view => set({ view, hover: null, tool: view === 'pcbView' && get().tool !== 'area' ? 'select' : get().tool }),

        select: selection => set({ selection, probe: selection.length ? null : get().probe }),

        setHover: hover => {
            if (get().hover !== hover)
                set({ hover })
        },

        setViewport: (view, viewport) => set({ viewports: { ...get().viewports, [view]: viewport } }),

        setSize: size => set({ size }),

        getGrid: () => get().gridOf(get().view),

        gridOf: view => (toInches(get().doc.settings[view]?.gridSize ?? GRID[view]) ?? 0.1) * PX_PER_INCH,

        isAligned: view => get().doc.settings[view]?.alignToGrid !== '0',

        isOrthogonal: view => view !== 'pcbView' && get().doc.settings[view]?.orthogonalWires !== '0',

        // FIOS QUE A EDIÇÃO ENTORTOU VOLTAM A 90° E DOBRAS QUE FICARAM RETAS SAEM, NAS VISTAS DE FIOS ORTOGONAIS
        tidy: (origin, doc) => {
            const { library, view, isOrthogonal, gridOf } = get()

            if (!isOrthogonal(view))
                return doc

            const squared = squareWires(origin, doc, library, view, gridOf(view))
            return tidyWires(squared, library, view, getChangedWires(origin, squared, view))
        },

        addPart: async (moduleId, point) => {
            const { library, view, viewports, isAligned, gridOf } = get()
            await library.load([moduleId])

            if (library.getPart(moduleId)?.kind === 'copperFill' && view === 'pcbView')
                return get().fillUnit(point)

            const home   = viewports[view]
            const places = Object.fromEntries(VIEWS.map(other => {
                const target = viewports[other]
                return [other, home && target && other !== view ? [target.x + (point[0] - home.x) * home.zoom / target.zoom, target.y + (point[1] - home.y) * home.zoom / target.zoom] : point]
            })) as Record<View, Point>

            const { doc } = get()
            const made    = createInstance(doc, library, moduleId, places)
            const index   = String(doc.nextIndex)
            const values  = Object.entries(FEATURED.find(item => item.moduleId === moduleId)?.values ?? {}).filter(([name]) => !library.getPart(moduleId)?.properties[name]?.trim())
            const next    = values.reduce((current, [name, value]) => setProperty(current, index, name, value), made)

            if (made === doc)
                return set({ message: `${moduleId}: peça não encontrada` })

            get().commit(VIEWS.filter(isAligned).reduce((current, other) => alignToGrid(current, library, other, [index], gridOf(other)), next))
            set({ selection: [index] })
        },

        connect: async (from, to) => {
            await get().library.load([WIRE])
            const { doc, library, view, gridOf, isOrthogonal } = get()
            const made = connectByPath(doc, library, view, from, to, gridOf(view), isOrthogonal(view) || view === 'pcbView')
            get().commit(made.doc)
            set({ selection: made.indexes })
        },

        drawWire: async (from, end, points) => {
            await get().library.load([WIRE])
            const { doc, library, view } = get()
            const made = drawWires(doc, library, view, from, end, points)

            if (!made.indexes.length)
                return

            get().commit(view === 'pcbView' && get().side === 'bottom' ? made.indexes.reduce(setTraceSide, made.doc) : made.doc)
            set({ selection: made.indexes, message: `fio com ${made.indexes.length} ${made.indexes.length > 1 ? 'trechos' : 'trecho'}${end ? '' : ', ponta solta'}` })
        },

        setTool: tool => set({ tool, message: tool === 'select' ? '' : tool === 'area' ? 'Seletor: arraste no quadro para selecionar várias peças (Esc volta)' : `${TOOL_NAMES[tool]}: clique num fio ou num terminal (Shift mantém a ferramenta, Esc ou botão direito sai)` }),

        setPanel: panel => set({ panel }),

        setLeft: left => set({ left }),

        setSide: side => set({ side, message: side === 'both' ? '' : `trilhas novas na face ${side === 'top' ? 'de cima (vermelha)' : 'de baixo (azul)'}; a outra face fica esmaecida` }),

        // PLACA RETANGULAR DE DUAS FACES EM VOLTA DAS PEÇAS COM COBRE; INSTRUMENTOS DE BANCADA (FONTES, MULTÍMETRO, OSCILOSCÓPIO) VÃO PARA UMA COLUNA À ESQUERDA DELA; DEPOIS O AUTOROUTER (SPEC 03 §8.3.1)
        makeBoard: async () => {
            const { doc, library } = get()
            await library.load([BOARD])
            const scene   = new Scene(doc, library, 'pcbView')
            const shown   = Object.values(doc.instances).filter(instance => scene.isShown(instance) && library.getPart(instance.moduleIdRef)?.views.pcbView?.layers.some(layer => layer.startsWith('copper')))
            const bench   = (instance: Instance) => INSTRUMENTS.some(name => (library.getPart(instance.moduleIdRef)?.properties.family ?? '').toLowerCase().includes(name))
            const bounds  = unionBoxes(shown.filter(instance => !bench(instance)).map(instance => scene.getBounds(instance.modelIndex)))

            if (!bounds)
                return set({ message: 'coloque peças antes de criar a placa' })

            const index   = String(doc.nextIndex)
            const size    = [bounds[2] - bounds[0] + 2 * BOARD_MARGIN, bounds[3] - bounds[1] + 2 * BOARD_MARGIN].map(px => (px / PX_PER_INCH * 25.4).toFixed(2))
            const center  = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2] as Point
            const made    = createInstance(doc, library, BOARD, Object.fromEntries(VIEWS.map(view => [view, center])) as Record<View, Point>)
            const sized   = setProperty(setProperty(made, index, 'width', size[0]), index, 'height', size[1])
            const placed  = setPosition(sized, 'pcbView', index, [bounds[0] - BOARD_MARGIN, bounds[1] - BOARD_MARGIN])
            const aside   = shown.filter(bench).reduce((current, instance) => {
                const box = scene.getBounds(instance.modelIndex)
                const top = current.y
                return box ? { doc: moveInstances(current.doc, library, 'pcbView', [instance.modelIndex], bounds[0] - 2 * BOARD_MARGIN - (box[2] - box[0]) - box[0], top - box[1], false), y: top + box[3] - box[1] + BOARD_MARGIN } : current
            }, { doc: placed, y: bounds[1] }).doc
            get().commit(aside)
            set({ selection: [], view: 'pcbView', viewports: { ...get().viewports, pcbView: undefined }, message: 'placa criada em volta das peças; roteando…' })
            await get().autoroute()
        },

        toggleTheme: () => {
            const theme = get().theme === 'dark' ? 'light' : 'dark'
            document.documentElement.dataset.theme = theme
            writeStored(THEME_KEY, theme)
            set({ theme })
        },

        setPlacing: placing => set({ placing, tool: 'select', message: placing ? 'clique no quadro para posicionar a peça (Shift mantém, Esc cancela)' : '' }),

        setReadout: readout => {
            get().setShow({ chart: true })
            set({ readout })
        },

        selectProbe: id => set({ probe: id, selection: id ? [] : get().selection }),

        addProbe: probe => {
            const { doc } = get()
            const used    = new Set(doc.probes.map(item => item.id))
            const id      = `P${Array.from({ length: doc.probes.length + 1 }, (_, i) => i + 1).find(n => !used.has(`P${n}`))}`
            get().commit({ ...doc, probes: [...doc.probes, { ...probe, id }] })
            set({ probe: id, selection: [] })
        },

        updateProbe: (id, patch) => {
            const { doc } = get()
            get().commit({ ...doc, probes: doc.probes.map(probe => probe.id === id ? { ...probe, ...patch } : probe) })
        },

        removeProbes: ids => {
            const { doc } = get()
            get().commit({ ...doc, probes: doc.probes.filter(probe => !ids.includes(probe.id)) })
            set({ probe: null })
        },

        setProjectProperties: values => {
            const { doc } = get()
            get().commit({ ...doc, projectProperties: { ...doc.projectProperties, ...values } })
        },

        remove: minus => {
            const { doc, library, view, selection, probe } = get()

            if (probe && !selection.length)
                return get().removeProbes([probe])

            get().commit(deleteItems(doc, library, view, selection, minus))
            set({ hover: null })
        },

        rotate: degrees => {
            const { doc, library, view, selection } = get()
            const rotated = settle(rotateInstances(doc, library, view, selection, degrees), selection)
            get().commit(view === 'breadboardView' ? snapConnections(rotated, library, selection) : get().tidy(doc, rotated))
        },

        flip: horizontal => {
            const { doc, library, view, selection } = get()
            get().commit(get().tidy(doc, settle(flipInstances(doc, library, view, selection, horizontal), selection)))
        },

        zOrder: mode => {
            const { doc, library, view, selection } = get()
            get().commit(setZOrder(doc, library, view, selection, mode))
        },

        nudge: (dx, dy) => {
            const { doc, library, view, selection } = get()
            const moved = carriedOf(selection)
            const next  = get().tidy(doc, moveInstances(doc, library, view, moved, dx, dy))
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
            const { view, isAligned, gridOf } = get()
            const offset: Point = inPlace ? [0, 0] : [PASTE + PASTE * pasted, -PASTE + PASTE * pasted]
            const result        = pasteItems(get().doc, library, clipboard, offset)
            const scene         = new Scene(result.doc, library, view)
            const anchor        = result.indexes.find(index => !scene.isWire(index) && scene.isShown(result.doc.instances[index]))
            const [dx, dy]      = anchor && isAligned(view) && !inPlace ? getGridShift(scene, anchor, gridOf(view)) : [0, 0]
            get().commit(dx || dy ? moveInstances(result.doc, library, view, result.indexes, dx, dy) : result.doc)
            set({ selection: result.indexes, pasted: inPlace ? pasted : pasted + 1 })
        },

        duplicate: async () => {
            const { doc, selection } = get()
            set({ clipboard: copyItems(doc, selection), pasted: 0 })
            await get().paste(false)
        },

        selectAll: () => {
            const { doc, library, view } = get()
            const scene                  = new Scene(doc, library, view)
            set({ selection: Object.values(doc.instances).filter(instance => scene.isShown(instance)).map(instance => instance.modelIndex) })
        },

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

        // COMUTAÇÃO PROGRAMADA DE UMA CHAVE: AS VARIANTES ACIONADA E SOLTA VÊM DA FAMÍLIA E FICAM CARREGADAS PARA O SIMULADOR; SEM EVENTOS, A PROGRAMAÇÃO SAI (SPEC 04 §8.10)
        setSwitching: async (modelIndex, events) => {
            const { doc, library, catalog } = get()
            const instance = doc.instances[modelIndex]
            const part     = library.getPart(instance?.moduleIdRef ?? '')
            const status   = part?.properties['switch status']

            if (!instance || !part || !status)
                return

            const family = await catalog.family(part.properties.family ?? '')
            const other  = pickSwap(family, part.properties, 'switch status', status === 'Pressed' ? 'Released' : 'Pressed')

            if (!other)
                return set({ message: `${instance.title}: o acervo não tem a outra posição desta chave` })

            await library.load([other.moduleId])
            const plans = getSwitching(get().doc)
            const pair  = status === 'Pressed' ? { pressed: part.moduleId, released: other.moduleId } : { pressed: other.moduleId, released: part.moduleId }
            const kept  = Object.fromEntries(Object.entries(plans).filter(([index]) => index !== modelIndex && get().doc.instances[index]))
            const next  = events.length ? { ...kept, [modelIndex]: { ...pair, events: [...events].sort((a, b) => a[0] - b[0]) } } : kept
            get().setProjectProperties({ [SWITCH_KEY]: Object.keys(next).length ? JSON.stringify(next) : '' })
        },

        newSketch: () => {
            if (get().doc !== get().saved && !window.confirm('Descartar as alterações do sketch aberto? (elas ficam nas versões salvas automaticamente)'))
                return

            const doc = emptyDoc()
            set({ ...withNetlist(doc, null), name: 'sem título', saved: doc, stored: false, past: [], future: [], selection: [], probe: null, hover: null, viewports: {}, pasted: 0, message: 'sketch novo' })
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

        setPcbSettings: values => {
            const { doc } = get()
            set({ doc: { ...doc, settings: { ...doc.settings, pcbView: { ...doc.settings.pcbView, ...values } } }, message: 'ajustes de roteamento gravados no sketch' })
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
            const { doc, library, netlist, view, name, selection } = get()
            const svg = document.getElementById('canvas') as SVGSVGElement | null
            set({ message: 'exportando…' })

            try {
                set({ message: await exportAs(kind, { doc, library, netlist, view, name, svg, bounds: getDrawing(new Scene(doc, library, view), null).bounds, selection }) })
            } catch (error) {
                if (!(error instanceof Error))
                    throw error

                set({ message: `falha ao exportar: ${error.message}` })
            }
        },

        checkRules: async () => {
            const board = await pcbBoard(get())

            if (typeof board === 'string')
                return set({ message: board })

            const { artwork, config } = board
            const groups              = artwork.conductors.map(getGroupOf(get().doc, board.netlist))
            set({ message: 'verificando regras de projeto…' })

            const violations = await get().pcb.request<Violation[]>({ type: 'drc', artwork, groups, keepout: config.keepout })

            if (!violations)
                return set({ message: stopped('DRC', get().pcb.failure) })

            set({ drc: { violations, frame: artwork.board.frame, keepout: config.keepout }, message: violations.length ? `DRC: ${violations.length} problemas com folga de ${config.keepout.toFixed(1)} mil` : `DRC: nenhum problema com folga de ${config.keepout.toFixed(1)} mil` })
        },

        fillCopper: async mode => {
            const cleared = removeFills(get().doc, get().library, get().selection)
            const board   = await pcbBoard({ ...get(), doc: cleared })

            if (typeof board === 'string')
                return set({ message: board })

            const { artwork, config, netlist } = board
            const ground                       = mode === 'ground' ? getGroundNets(cleared, get().library, netlist) : new Set<number>()

            if (typeof ground === 'string')
                return set({ message: ground })

            const grounded  = artwork.conductors.map(conductor => conductor.key !== null && netlist.index.has(conductor.key) && ground.has(netlist.nets.pcbView?.[netlist.index.get(conductor.key) ?? 0] ?? -1))
            const faces     = artwork.board.layers > 1 ? ['bottom', 'top'] as const : ['bottom'] as const
            set({ message: mode === 'ground' ? 'preenchendo com terra…' : 'preenchendo com cobre…' })

            const fragments = await get().pcb.request<FillFragment[]>({ type: 'fill', artwork, grounded, faces: [...faces], mode, keepout: config.fillKeepout })

            if (!fragments)
                return set({ message: stopped('preenchimento', get().pcb.failure) })

            await get().library.load([FILL])
            get().commit(createFills(cleared, fragments, artwork.board.frame, mode))
            set({ message: `${fragments.length} áreas de cobre criadas` })
        },

        // PEÇA "COPPER FILL" SOLTA NA PLACA: SÓ O FRAGMENTO DO PREENCHIMENTO DA FACE DE CIMA (DE BAIXO EM PLACA DE UMA FACE) QUE CONTÉM O PONTO, fillType individual (SPEC 03 §6.1)
        fillUnit: async point => {
            const board = await pcbBoard(get())

            if (typeof board === 'string')
                return set({ message: board })

            const { artwork, config } = board
            const face      = artwork.board.layers > 1 ? 'top' : 'bottom'
            const [x, y]    = apply(artwork.board.frame, point[0], point[1])
            const fragments = await get().pcb.request<FillFragment[]>({ type: 'fill', artwork, grounded: artwork.conductors.map(() => false), faces: [face], mode: 'plain', keepout: config.fillKeepout })
            const hit       = fragments?.find(fragment => contains(fragment.polygons, x, y))

            if (!fragments)
                return set({ message: stopped('preenchimento', get().pcb.failure) })

            if (!hit)
                return set({ message: 'solte o preenchimento numa área livre da placa' })

            const { doc } = get()
            get().commit(createFills(doc, [hit], artwork.board.frame, 'individual'))
            set({ selection: [String(doc.nextIndex)], message: 'preenchimento criado na área do ponto' })
        },

        removeFills: () => {
            const { doc, library, selection } = get()
            const problem                     = boardProblem(doc, library, selection)

            if (problem)
                return set({ message: problem })

            get().commit(removeFills(doc, library, selection))
            set({ message: 'preenchimentos removidos' })
        },

        autoroute: async () => {
            const { doc, library, view } = get()

            if (view === 'breadboardView')
                return set({ message: 'o autorouter roteia o esquemático e a PCB' })

            if (view === 'schematicView')
                return get().autorouteSheet()

            await library.load([VIA, WIRE])
            const cleared = deleteAutorouted(doc, library, 'pcbView', boardArea(doc, library, get().selection))
            const board   = await pcbBoard({ ...get(), doc: cleared })

            if (typeof board === 'string')
                return set({ message: board })

            const { artwork, config, netlist } = board
            const scene     = new Scene(cleared, library, 'pcbView')
            const label     = (labels: Uint32Array | undefined, key: string) => labels?.[netlist.index.get(key) ?? 0] ?? -1
            const keys      = Object.fromEntries(artwork.conductors.flatMap(conductor => conductor.key && netlist.index.has(conductor.key) ? [[conductor.key, [label(netlist.nets.pcbView, conductor.key), label(netlist.routed.pcbView, conductor.key)] as [number, number]]] : []))
            const terminals = Object.fromEntries(Object.keys(keys).flatMap(key => {
                const point = scene.getTerminal(key)
                return point ? [[key, point]] : []
            }))
            set({ routing: { cycle: 0, cycles: config.cycles, connected: 0, requested: 0 }, message: 'autoroteando…' })

            const routed = await get().pcb.request<{ plan: Plan, connected: number, requested: number, vias: number }>({ type: 'route', artwork, keys, terminals, config }, progress => set({ routing: progress }))
            set({ routing: null })

            if (!routed)
                return set({ message: stopped('autorouter', get().pcb.failure) })

            get().commit(applyPlan(cleared, library, 'pcbView', routed.plan, config.traceWidth, config.holeSize), doc)
            set({ message: `autorouter: ${routed.connected} de ${routed.requested} ligações, ${routed.vias} vias` })
        },

        autorouteSheet: async () => {
            const { doc, library, wasm } = get()
            await library.load([WIRE])

            const cleared = deleteAutorouted(doc, library, 'schematicView')
            const sheet   = new Scene(cleared, library, 'schematicView').getSheet()
            const netlist = wasm ? new Netlist(cleared, library, wasm) : null

            if (!netlist || !sheet.pins.length)
                return set({ message: 'nada para rotear no esquemático' })

            netlist.update()
            const label  = (labels: Uint32Array | undefined, key: string) => netlist.index.has(key) ? labels?.[netlist.index.get(key) ?? 0] ?? null : null
            const config = getConfig(doc.settings.pcbView)
            set({ routing: { cycle: 0, cycles: config.cycles, connected: 0, requested: 0 }, message: 'autoroteando o esquemático…' })

            const attempt = (step: number) => {
                const { grid, frame } = buildSheetGrid(sheet, key => label(netlist.nets.schematicView, key), key => label(netlist.routed.schematicView, key), step)
                return get().pcb.request<{ plan: Plan, connected: number, requested: number }>({ type: 'sheet', grid, frame, terminals: Object.fromEntries(sheet.pins), cycles: config.cycles }, progress => set({ routing: progress }))
            }

            const whole  = await attempt(get().getGrid())
            const half   = whole && whole.connected < whole.requested ? await attempt(get().getGrid() / 2) : null
            const routed = half && whole && half.connected > whole.connected ? half : whole
            set({ routing: null })

            if (!routed)
                return set({ message: stopped('autorouter do esquemático', get().pcb.failure) })

            get().commit(applyPlan(cleared, library, 'schematicView', routed.plan, WIRE_STYLE.schematicView.mils, config.holeSize), doc)
            set({ message: `autorouter do esquemático: ${routed.connected} de ${routed.requested} ligações` })
        },

        cancelRouting: () => {
            get().pcb.stop()
            set({ routing: null })
        },

        clearAutorouted: () => {
            const { doc, library, view } = get()
            get().commit(deleteAutorouted(doc, library, view))
        },

        setSimulation: patch => set({ simulation: { ...get().simulation, ...patch } }),

        setShow: patch => {
            const show = { ...get().show, ...patch }
            writeStored(SHOW_KEY, show)
            set({ show })
        },

        simulate: async () => {
            const { doc, library, netlist, simulation, simulator } = get()

            const missing = Object.values(getSwitching(doc)).flatMap(plan => [plan.pressed, plan.released]).filter(moduleId => !library.getPart(moduleId))

            if (!netlist || !simulation.enabled)
                return

            if (missing.length)
                await library.load(missing)

            const circuit  = buildCircuit(doc, library, netlist, simulation.transient)
            const previous = simulation.result
            const before   = previous?.circuit.analysis
            const after    = circuit.analysis
            const same     = before?.type === 'tran' && after.type === 'tran' && before.t0 === after.t0 && before.t1 === after.t1 && before.step === after.step && before.initial === after.initial && !simulation.error
            const keep     = same && previous && simulation.step > 0 && simulation.step < previous.steps - 1 ? simulation.step : 0

            if (!circuit.simulated.length)
                return get().setSimulation({ result: new Simulation(doc, library, circuit, {}), error: 'nenhuma peça simulável ligada ao circuito', busy: false, playing: false })

            get().setSimulation({ busy: true })
            const deck    = keep && previous ? resumeCircuit(circuit, getInitial(previous, circuit, keep), keep).deck : circuit.deck
            const run     = await simulator.run(deck)
            const fresh   = after.type === 'tran' && after.initial === 'zero' ? fromRest(run.vectors) : run.vectors
            const vectors = keep && previous && !run.error ? joinRuns(previous, keep, circuit, run.vectors) : fresh
            const result  = new Simulation(doc, library, circuit, vectors)

            if (get().simulation.enabled && keep && !run.error)
                return get().setSimulation({ busy: false, result, error: null })

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

        exportMine: () => {
            const { mine, library } = get()
            const title             = 'Meus itens'
            download(`${title}.fzbz`, exportBinBundle(title, mine, library.getBundleFiles(mine)), 'application/zip')
            set({ message: `${title}.fzbz exportado com ${mine.length} peças` })
        },

        addToMine: moduleIds => {
            const mine   = [...new Set([...get().mine, ...moduleIds])]
            const failed = writeStored(MINE_KEY, mine)
            set({ mine, ...failed ? { message: `bin não gravado: ${failed}` } : {} })
        },

        createBin: (title, moduleIds) => {
            const userBins = [...get().userBins, { title: title.trim() || `Bin ${get().userBins.length + 1}`, moduleIds: [...new Set(moduleIds)] }]
            const failed   = writeStored(BINS_KEY, userBins)
            set({ userBins, message: failed ? `bin não gravado: ${failed}` : `bin ${userBins[userBins.length - 1].title} com ${moduleIds.length} peças` })
        },

        renameBin: (index, title) => {
            const userBins = get().userBins.map((bin, i) => i === index && title.trim() ? { ...bin, title: title.trim() } : bin)
            writeStored(BINS_KEY, userBins)
            set({ userBins })
        },

        deleteBin: index => {
            const userBins = get().userBins.filter((_, i) => i !== index)
            writeStored(BINS_KEY, userBins)
            set({ userBins })
        },

        addToBin: (index, moduleIds) => {
            const userBins = get().userBins.map((bin, i) => i === index ? { ...bin, moduleIds: [...new Set([...bin.moduleIds, ...moduleIds])] } : bin)
            const failed   = writeStored(BINS_KEY, userBins)
            set({ userBins, message: failed ? `bin não gravado: ${failed}` : `${moduleIds.length} peça(s) em ${userBins[index]?.title}` })
        },

        exportBin: index => {
            const { userBins, library } = get()
            const bin                   = userBins[index]

            if (!bin)
                return

            download(`${bin.title}.fzbz`, exportBinBundle(bin.title, bin.moduleIds, library.getBundleFiles(bin.moduleIds)), 'application/zip')
            set({ message: `${bin.title}.fzbz exportado com ${bin.moduleIds.length} peças` })
        },

        // GUARDA NO NAVEGADOR OS ARQUIVOS DE PEÇAS DE PACOTE, PARA MEUS ITENS E OS BINS VOLTAREM NA PRÓXIMA SESSÃO (SPEC 01 §8A.6)
        keepParts: async files => {
            const failed = await get().vault.save(PARTS, files.map(file => [file.name, file]))

            if (failed)
                set({ message: `peças não guardadas no navegador (${failed}); continuam nesta sessão` })
        },

        editPart: modelIndex => {
            const { doc, library } = get()
            const part             = library.getPart(doc.instances[modelIndex ?? '']?.moduleIdRef ?? '')

            if (modelIndex && !isEditable(part))
                return set({ message: 'esta peça não abre no editor de peças' })

            set({ editing: modelIndex })
        },

        // PEÇA GRAVADA NO EDITOR: ENTRA NO ACERVO COMO PEÇA DE PACOTE, VAI PARA MEUS ITENS E PODE SUBSTITUIR A INSTÂNCIA EDITADA (SPEC 01 §8A.5)
        installPart: async (files, replace) => {
            const { library } = get()
            const [moduleId]  = library.addBundle({ sketch: null, parts: files.filter(file => file.name.startsWith('part.')), svgs: files.filter(file => file.name.startsWith('svg.')), others: [], bin: null })
            await library.load(moduleId ? [moduleId] : [])
            const part        = library.getPart(moduleId ?? '')

            if (!part)
                return set({ message: 'a peça gravada não carregou' })

            get().keepParts(files)
            get().addToMine([part.moduleId])
            set({ imported: [...get().imported.filter(entry => entry.moduleId !== part.moduleId), entryOf(part)], editing: null })

            if (replace)
                await get().swap(replace, part.moduleId)

            set({ message: `${part.title} gravada em Meus itens${replace ? ' e trocada no sketch' : ''}` })
        }
    }
})

// PEDIDO AO WORKER QUE VOLTOU SEM RESULTADO: CANCELADO PELO USUÁRIO OU A CAUSA DA FALHA, COM A SAÍDA
const stopped = (task: string, failure: string) => failure ? `${task}: ${failure}; tente de novo` : `${task} cancelado`

const GROUNDED = new Set(['gnd', 'vss', 'ground'])

// DEPOIS DE GIRAR OU ESPELHAR, O PRIMEIRO TERMINAL VOLTA À GRADE (NO ESQUEMÁTICO E NA PCB; NA PROTOBOARD O ENCAIXE DECIDE)
const settle = (doc: Doc, selection: string[]) => {
    const { library, view, isAligned, gridOf } = useStore.getState()
    return view !== 'breadboardView' && isAligned(view) ? alignToGrid(doc, library, view, selection, gridOf(view)) : doc
}

// CAIXA NA CENA DA PCB DA PLACA DAS OPERAÇÕES; NULO SEM PLACA OU COM VÁRIAS E NENHUMA SELECIONADA (SPEC 03 §2.1)
const boardArea = (doc: Doc, library: Library, selection: string[]) => {
    const scene = new Scene(doc, library, 'pcbView')
    const host  = pickBoard(doc, library, scene, selection).host
    return host ? scene.getBounds(host.modelIndex) : null
}

const removeFills = (doc: Doc, library: Library, selection: string[]) => {
    const area  = boardArea(doc, library, selection)
    const scene = new Scene(doc, library, 'pcbView')
    const fills = Object.values(doc.instances).filter(instance => {
        const box = library.getPart(instance.moduleIdRef)?.kind === 'copperFill' ? scene.getBounds(instance.modelIndex) : null
        return area && box && boxesTouch(box, area)
    })
    return fills.reduce((current, instance) => removeInstance(current, instance.modelIndex), doc)
}

// PLACA PRONTA PARA DRC, PREENCHIMENTO E AUTOROUTER: NETLIST DO DOCUMENTO, ARTE DA PCB E AJUSTES; OU O MOTIVO DE NÃO HAVER
const pcbBoard = async ({ doc, library, wasm, selection }: { doc: Doc, library: Library, wasm: NetlistWasm | null, selection: string[] }) => {
    const problem = boardProblem(doc, library, selection)
    const artwork = wasm && !problem ? getArtwork(doc, library, await getClipper(), new Scene(doc, library, 'pcbView'), selection) : null

    if (!wasm || !artwork)
        return problem ?? 'é preciso uma placa na vista PCB'

    const netlist = new Netlist(doc, library, wasm)
    netlist.update()
    return { artwork, netlist, config: getConfig(doc.settings.pcbView) }
}

// NETS DE TERRA DO PREENCHIMENTO: AS DAS SEMENTES MARCADAS, SENÃO A ÚNICA NET COM CONECTOR gnd/vss/ground (SPEC 03 §6.1)
const getGroundNets = (doc: Doc, library: Library, netlist: Netlist) => {
    const seeds     = Object.values(doc.instances).flatMap(instance => (instance.views.pcbView?.connectors ?? []).filter(connector => connector.groundFillSeed).map(connector => keyOf(instance.modelIndex, connector.id)))
    const named     = netlist.keys.filter(key => GROUNDED.has(library.getPart(doc.instances[splitKey(key)[0]]?.moduleIdRef ?? '')?.connectors.find(connector => connector.id === splitKey(key)[1])?.name.trim().toLowerCase() ?? ''))
    const netOf     = (key: string) => netlist.nets.pcbView?.[netlist.index.get(key) ?? 0] ?? -1
    const nets      = new Set((seeds.length ? seeds : named).filter(key => netlist.index.has(key)).map(netOf))

    if (!nets.size)
        return 'nenhum conector de terra: marque uma semente no menu de um conector'

    if (!seeds.length && nets.size > 1)
        return 'há mais de uma net de terra: marque as sementes no menu de um conector'

    return nets
}

const signature = (doc: Doc) => [...Object.values(doc.instances).filter(instance => instance.moduleIdRef !== WIRE).map(instance => `${instance.modelIndex}:${instance.moduleIdRef}:${instance.title}:${JSON.stringify(instance.properties)}`), ...doc.probes.map(probe => `${probe.id}:${probe.kind}:${probe.key}:${probe.flip}`), JSON.stringify(doc.projectProperties)].join('|')

// MUDANÇA DO DOCUMENTO, DO NOME OU DO ESTADO SALVO AGENDA O SALVAMENTO AUTOMÁTICO; A FOTO É TIRADA NA HORA DE GRAVAR
useStore.subscribe((state, previous) => {
    if (state.ready && (state.doc !== previous.doc || state.saved !== previous.saved || state.name !== previous.name))
        state.autosave.schedule(() => snapshotOf(useStore.getState()))
})

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
