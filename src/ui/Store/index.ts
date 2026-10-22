import { create } from 'zustand'
import { Library } from '../../core/Library'
import { Netlist, loadNetlistWasm, type NetlistWasm } from '../../core/Netlist'
import { emptyDoc, fromSketch, keyOf, removeInstance, splitKey, type Doc, type Probe, type ProbeKind } from '../../core/Document'
import { exportBinBundle, readFile, type BundleFile, type Instance } from '../../core/Sketch'
import type { Part } from '../../core/Part'
import { VIEWS } from '../../core/Layer'
import { PX_PER_INCH, toInches } from '../../core/Units'
import { formatSi } from '../../core/Properties'
import { apply, boxesTouch, unionBoxes, type Matrix, type Point } from '../../core/Geometry'
import { INITIAL_KEY, PRESET_KEY, START_KEY, STOP_KEY, SWITCH_KEY, buildCircuit, getSwitching, projectValue, resumeCircuit, type Event, type Mode } from '../../core/Spice'
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
import { LEVELS, type Level } from '../Modes'
import type { Crosshair, Unit } from '../Navigation'
import { getTag, setWords, t, type Language } from '../../core/Text'
import { boardProblem, download, getClipper, type ExportKind } from '../Export'
import { PARTS, Vault } from '../Vault'
import { Autosave, type Snapshot, type Version } from '../Autosave'
import wasmUrl from '../../core/Netlist/netlist.wasm?url'

export type View       = typeof VIEWS[number]
export type Viewport   = { x: number, y: number, zoom: number }
export type Tool       = 'select' | 'area' | 'lasso' | 'erase' | 'zoomArea' | 'origin' | ProbeKind
export type GridKind   = 'parts' | 'wires'
export type Panel      = 'properties' | 'routing' | 'document'
export type Left       = 'parts' | 'project' | 'problems'
export type Theme      = 'dark' | 'light'
export type Side       = 'both' | 'top' | 'bottom'
export type UserBin    = { title: string, moduleIds: string[] }
export type Dialog     = 'shortcuts' | 'about' | 'recovery' | 'versions' | 'palette' | 'preferences' | 'guide' | null
export type Preferences = { wheel: 'zoom' | 'scroll', curvy: boolean, units: Unit, polar: boolean, crosshair: Crosshair, crosshairAlways: boolean, grids: Partial<Record<View, string[]>>, overrides: Record<GridKind, string> }
export type Checked    = { violations: Violation[], frame: Matrix, keepout: number }
export type Show       = { values: boolean, chart: boolean }
export type Sheet      = { id: number, name: string, doc: Doc, saved: Doc, stored: boolean, past: Doc[], future: Doc[], viewports: Partial<Record<View, Viewport>>, view: View, selection: string[], probe: string | null, drc: Checked | null }
export type Simulating = { enabled: boolean, busy: boolean, result: Simulation | null, error: string | null, step: number, playing: boolean, started: number, series: string[], focus: string | null }

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
    leftHidden: boolean
    welcome: boolean
    theme: Theme
    side: Side
    placing: string | null
    saved: Doc
    stored: boolean
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
    sheets: Sheet[]
    sheet: number
    hiddenLayers: string[]
    level: Level
    language: Language
    preferences: Preferences
    tour: Level | null
    toured: Level[]
    keys: Record<string, string[]>
    routing: Progress | null
    setup: () => Promise<void>
    open: (name: string, bytes: Uint8Array) => Promise<void>
    save: () => Promise<void>
    saveAll: () => Promise<void>
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
    gridOf: (view: View, kind: GridKind) => number
    originOf: (view: View) => Point
    gridsOf: (view: View) => string[]
    cycleGrid: (step: number) => void
    setFastGrid: (index: number) => void
    cycleFastGrid: () => void
    setGridOrigin: (point: Point | null) => void
    zooms: Partial<Record<View, { back: Viewport[], ahead: Viewport[] }>>
    undoZoom: () => void
    redoZoom: () => void
    copyAsText: () => void
    isAligned: (view: View) => boolean
    isOrthogonal: (view: View) => boolean
    tidy: (origin: Doc, doc: Doc) => Doc
    addPart: (moduleId: string, point: Point) => Promise<void>
    connect: (from: string, to: string) => Promise<void>
    drawWire: (from: string[], end: WireEnd | null, points: Point[]) => Promise<void>
    setTool: (tool: Tool) => void
    setPanel: (panel: Panel) => void
    setLeft: (left: Left) => void
    setMessage: (message: string) => void
    toggleLeft: () => void
    resetSettings: () => void
    rebuildIndex: () => void
    toggleTheme: () => void
    setSide: (side: Side) => void
    makeBoard: () => Promise<void>
    setPlacing: (moduleId: string | null) => void
    toggleSimulation: () => void
    toggleLayer: (id: string) => void
    setLevel: (level: Level) => void
    setLanguage: (language: Language) => Promise<void>
    setPreferences: (patch: Partial<Preferences>) => void
    setKeys: (keys: Record<string, string[]>) => void
    setDialog: (dialog: Dialog) => void
    showTour: (level: Level) => void
    finishTour: () => void
    setHiddenLayers: (ids: string[]) => void
    setTest: (mode: Mode) => void
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
    switchSheet: (id: number) => void
    closeSheet: (id: number) => void
    addNote: () => Promise<void>
    zoom: (factor: number) => void
    setZoom: (zoom: number) => void
    setViewSetting: (key: string, value: string) => void
    setPcbSettings: (values: Record<string, string>) => void
    align: (mode: AlignMode) => void
    selectWhere: (test: (instance: Instance, part: Part | undefined) => boolean) => void
    exportFile: (kind: ExportKind) => Promise<void>
    checkRules: (quiet?: boolean) => Promise<void>
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
const START_VIEW: View = 'schematicView'    // O APP, O SKETCH NOVO E O ARQUIVO ABERTO COMEÇAM NO ESQUEMÁTICO (FRIZING_KICAD §5, DECISÃO 1)
const TOOL_NAMES: Record<ProbeKind, string> = { voltage: 'Ponta de tensão', current: 'Ponta de corrente', both: 'Ponta de tensão e corrente' }
const TOOL_HINTS: Partial<Record<Tool, string>> = { area: 'Seletor: arraste no quadro para selecionar várias peças (Esc volta)', lasso: 'Laço: desenhe em volta das peças para selecioná-las (Esc volta)', erase: 'Apagar: clique em cada peça ou fio para apagar (Esc volta)', zoomArea: 'Zoom na área: arraste um retângulo no quadro', origin: 'Origem da grade: clique no ponto que vira a origem (Esc cancela)' }
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
const LEVEL_KEY = 'circuitmaster.level'    // MODO DA INTERFACE: INICIANTE, MAKER OU PROFISSIONAL
const LANG_KEY  = 'circuitmaster.language'
const PREFS_KEY = 'circuitmaster.preferences'
const TOUR_KEY  = 'circuitmaster.toured'    // MODOS CUJO TOUR JÁ FOI VISTO OU PULADO: CADA UM APARECE UMA VEZ SÓ
const KEYS_KEY  = 'circuitmaster.keys'      // TECLAS ESCOLHIDAS NAS PREFERÊNCIAS NO LUGAR DAS PADRÃO
const PREFERENCES: Preferences = { wheel: 'zoom', curvy: false, units: 'mm', polar: false, crosshair: 'small', crosshairAlways: false, grids: {}, overrides: { parts: '', wires: '' } }    // COMO NO FRITZING: RODA DÁ ZOOM E ARRASTAR O FIO FAZ DOBRA
export const GRID_SIZES: Record<View, string[]> = { breadboardView: ['0.1in', '0.05in', '2.54mm'], schematicView: ['0.1in', '0.05in', '7.5mm'], pcbView: ['0.05in', '0.025in', '0.1in', '1mm'] }    // AS DUAS PRIMEIRAS SÃO AS GRADES RÁPIDAS 1 E 2 (Alt+1, Alt+2)
const ZOOMS = 50    // ZOOMS GUARDADOS POR VISTA PARA DESFAZER

// ORIGEM DA GRADE GRAVADA NA VISTA COMO "x,y" EM PX DA CENA; SEM ELA, O ZERO
export const parseOrigin = (text: string | undefined): Point => {
    const [x, y] = (text ?? '').split(',').map(Number)
    return text && Number.isFinite(x) && Number.isFinite(y) ? [x, y] : [0, 0]
}
const THEME_KEY = 'cm-theme'               // MESMA CHAVE QUE O <head> LÊ ANTES DE DESENHAR (DESIGN.md §7)
const INDEX_DB  = 'circuitmaster'          // BANCO DO workers/Indexer
const PARTS_KEY = 'circuitmaster.parts'    // ARQUIVOS DAS PEÇAS QUE VIERAM DE .fzpz/.fzbz OU DO EDITOR (SPEC 01 §8A.6)
const PASTE     = 20     // PX POR COLAGEM SEGUIDA (SPEC 02 §10.3)
const GRID: Record<View, string> = { breadboardView: '0.1in', schematicView: '0.1in', pcbView: '0.05in' }
const DEBOUNCE  = 200    // MS ENTRE A ÚLTIMA MUDANÇA E A NOVA SIMULAÇÃO (SPEC 04 §5.4)
const DRC_DELAY = 600    // MS ENTRE A ÚLTIMA MUDANÇA NA PCB E O DRC AUTOMÁTICO

const IDLE: Simulating = { enabled: false, busy: false, result: null, error: null, step: 0, playing: false, started: 0, series: [], focus: null }

const blankSheet = (): Omit<Sheet, 'id'> => {
    const doc = emptyDoc()
    return { name: 'sem título', doc, saved: doc, stored: false, past: [], future: [], viewports: {}, view: START_VIEW, selection: [], probe: null, drc: null }
}

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
    return bytes ? { base, files, bytes } : t('o .fzz não foi montado ({0})', saver.failure || t('cancelado'))
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
            return set({ indexed: { done: status.total, total: status.total, ready: true }, message: t('{0} peças indexadas', status.count) })

        set({ bins: status.bins })
    }

    const carriedOf = (selection: string[]) => {
        const { doc, library, view } = get()
        return [...new Set(selection.filter(modelIndex => doc.instances[modelIndex]?.moduleIdRef !== WIRE && !doc.instances[modelIndex]?.views[view]?.locked).flatMap(modelIndex => getCarried(doc, library, view, modelIndex)))]
    }

    // O SKETCH ATIVO GUARDADO NA SUA ABA
    const stash = (): Sheet => {
        const { sheet: id, name, doc, saved, stored, past, future, viewports, view, selection, probe, drc } = get()
        return { id, name, doc, saved, stored, past, future, viewports, view, selection, probe, drc }
    }

    // ABA QUE VIRA A ATIVA: O NETLIST É REFEITO E A SIMULAÇÃO, SE LIGADA, RECOMEÇA NO SKETCH DELA
    const activate = ({ id, ...sheet }: Sheet, sheets: Sheet[], message: string) => {
        set({ ...sheet, ...withNetlist(sheet.doc, null), sheet: id, sheets: sheets.map(item => item.id === id ? { id, ...sheet } : item), hover: null, pasted: 0, placing: null, zooms: {}, simulation: { ...get().simulation, result: null, error: null, playing: false, step: 0 }, message })
    }

    // SKETCH ABERTO OU NOVO NUMA ABA NOVA; A ATIVA É REUSADA SE ESTÁ VAZIA SEM MUDANÇA OU É O MESMO ARQUIVO SEM MUDANÇA
    const place = (sheet: Omit<Sheet, 'id'>, message: string) => {
        const { doc, saved, stored, name, sheets, sheet: active } = get()
        const reuse = doc === saved && (stored ? name === sheet.name : !Object.keys(doc.instances).length)
        const id    = reuse ? active : Math.max(...sheets.map(item => item.id)) + 1
        activate({ id, ...sheet }, reuse ? sheets : [...sheets.map(item => item.id === active ? stash() : item), { id, ...sheet }], message)
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
        view: START_VIEW,
        selection: [],
        probe: null,
        tool: 'select',
        panel: 'properties',
        left: 'parts',
        leftHidden: false,
        welcome: false,
        theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
        side: 'both',
        placing: null,
        saved: blank,
        stored: false,
        hover: null,
        past: [],
        future: [],
        viewports: {},
        zooms: {},
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
        sheets: [{ id: 1, ...blankSheet() }],
        sheet: 1,
        hiddenLayers: [],
        level: readStored<Level>(LEVEL_KEY, 1),
        language: readStored<Language>(LANG_KEY, 'pt'),
        preferences: { ...PREFERENCES, ...readStored<Partial<Preferences>>(PREFS_KEY, {}) },
        keys: readStored<Record<string, string[]>>(KEYS_KEY, {}),
        tour: null,
        toured: readStored<Level[]>(TOUR_KEY, []),
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

            if (!get().toured.includes(get().level))
                get().showTour(get().level)
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
                return set({ message: t('{0} peças de {1} em Meus itens', added.length, name) })
            }

            if (!bundle?.sketch)
                return set({ message: t('{0}: arquivo sem sketch legível', name) })

            library.addBundle(bundle)
            const doc = fromSketch(bundle.sketch)
            set({ message: t('abrindo {0}…', name) })
            await library.load([WIRE, ...Object.values(doc.instances).map(instance => instance.moduleIdRef)])

            const missing = Object.values(doc.instances).filter(instance => !library.getPart(instance.moduleIdRef)).length
            place({ name, doc, saved: doc, stored: true, past: [], future: [], selection: [], probe: null, viewports: {}, drc: null, view: START_VIEW }, missing ? t('{0} peças não encontradas no acervo', missing) : t('{0} aberto', name))
        },

        save: async () => {
            const { doc }  = get()
            const bundle   = await bundleOf(get())

            if (typeof bundle === 'string')
                return set({ message: t('não salvou: {0}', bundle) })

            download(`${bundle.base}.fzz`, bundle.bytes, 'application/zip')
            set({ saved: doc, stored: true })

            // A VERSÃO AUTOMÁTICA VIRA "SALVA" JÁ, COM OS MESMOS BYTES: FECHAR A ABA LOGO DEPOIS DE SALVAR NÃO OFERECE RECUPERAR O QUE FOI SALVO
            get().autosave.schedule(String(get().sheet), async () => ({ name: get().name, dirty: false, count: Object.keys(doc.instances).length, bytes: bundle.bytes }))
            await get().autosave.flush()
            set({ message: bundle.files.length ? t('{0}.fzz salvo ({1} itens, {2} arquivos de peça embutidos)', bundle.base, Object.keys(doc.instances).length, bundle.files.length) : t('{0}.fzz salvo ({1} itens)', bundle.base, Object.keys(doc.instances).length) })
        },

        // SALVAR TODOS: CADA SKETCH DAS OUTRAS ABAS COM ALTERAÇÕES BAIXA O SEU .fzz; O DA ABA ATIVA, POR ÚLTIMO
        saveAll: async () => {
            const { sheets, sheet, library, saver, autosave } = get()
            const changed                                     = sheets.filter(item => item.id !== sheet && item.doc !== item.saved)

            for (const item of changed) {
                const bundle = await bundleOf({ doc: item.doc, name: item.name, library, saver })

                if (typeof bundle === 'string')
                    return set({ message: t('{0} não salvou: {1}', t(item.name), bundle) })

                download(`${bundle.base}.fzz`, bundle.bytes, 'application/zip')
                autosave.schedule(String(item.id), async () => ({ name: item.name, dirty: false, count: Object.keys(item.doc.instances).length, bytes: bundle.bytes }))
                set({ sheets: get().sheets.map(other => other.id === item.id ? { ...other, saved: item.doc, stored: true } : other) })
            }

            if (get().doc !== get().saved)
                return get().save()

            set({ message: changed.length ? t('{0} sketches salvos', changed.length) : t('nenhum sketch com alterações') })
        },

        openSample: async file => {
            const bytes = await fetchBytes(`/fritzing/sketches/${file}`)

            if (!bytes)
                return set({ message: t('{0}: não encontrado ou sem rede', file) })

            await get().open(file.split('/').pop() ?? file, bytes)
        },

        // CIRCUITO DE TESTE: SKETCH NOVO NO ESQUEMÁTICO COM O SIMULADOR LIGADO NO TRANSITÓRIO DO MODELO DELE (SPEC 04 §8.9)
        openBench: async id => {
            const bench = BENCHES.find(item => item.id === id)

            if (!bench)
                return

            await get().library.load([...BENCH_PARTS, WIRE])
            const doc = buildBench(get().library, bench)
            place({ name: bench.title, doc, saved: doc, stored: false, past: [], future: [], selection: [], probe: null, viewports: {}, drc: null, view: 'schematicView' }, t(bench.summary))
            set({ simulation: { ...IDLE, enabled: true } })
            get().setShow({ chart: true })
        },

        // VERSÃO SALVA SOZINHA ABERTA NUMA ABA COMO DOCUMENTO NÃO SALVO; AQUELE SKETCH DEIXA DE SER OFERECIDO E OS OUTROS DA SESSÃO MORTA SEGUEM NA LISTA
        recover: async version => {
            const { recovery, autosave, dialog } = get()
            const same                           = (other: Version) => other.session === version.session && other.sheet === version.sheet
            const rest                           = dialog === 'recovery' ? recovery.filter(other => !same(other)) : []
            set({ dialog: rest.length ? dialog : null })
            await get().open(version.name, version.bytes)
            set({ saved: emptyDoc(), stored: false, recovery: rest, message: t('{0} recuperado da versão de {1}; salve para guardar o arquivo', t(version.name), new Date(version.time).toLocaleString(getTag())) })

            if (dialog === 'recovery')
                await autosave.dismiss(recovery.filter(same))
        },

        dismissRecovery: async () => {
            const { recovery, autosave } = get()
            const failed                 = await autosave.dismiss(recovery)
            set({ recovery: [], dialog: null, message: failed ? t('versões não descartadas: {0}', failed) : t('versões não salvas descartadas') })
        },

        showVersions: async () => set({ recovery: await get().autosave.getVersions(), dialog: 'versions' }),

        preview: doc => set(withNetlist(doc)),

        commit: (doc, origin = get().doc) => {
            if (doc === origin)
                return set(withNetlist(doc))

            const selection = get().selection.filter(modelIndex => doc.instances[modelIndex])
            const probe     = doc.probes.some(item => item.id === get().probe) ? get().probe : null
            set({ ...withNetlist(doc), past: [...get().past, origin].slice(-HISTORY), future: [], selection, probe })
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

        // ZOOM (E ENQUADRAR) GUARDA O ENQUADRAMENTO ANTERIOR PARA DESFAZER; SÓ MOVER A VISTA NÃO GUARDA
        setViewport: (view, viewport) => {
            const { viewports, zooms } = get()
            const before               = viewports[view]
            const history              = zooms[view] ?? { back: [], ahead: [] }
            const zoomed               = before !== undefined && (viewport === undefined || viewport.zoom !== before.zoom)
            set({ viewports: { ...viewports, [view]: viewport }, ...zoomed ? { zooms: { ...zooms, [view]: { back: [...history.back, before].slice(-ZOOMS), ahead: [] } } } : {} })
        },

        undoZoom: () => {
            const { view, viewports, zooms } = get()
            const history                    = zooms[view]
            const last                       = history?.back.at(-1)
            const current                    = viewports[view]

            if (!history || !last || !current)
                return set({ message: t('nenhum zoom para desfazer') })

            set({ viewports: { ...viewports, [view]: last }, zooms: { ...zooms, [view]: { back: history.back.slice(0, -1), ahead: [...history.ahead, current] } } })
        },

        redoZoom: () => {
            const { view, viewports, zooms } = get()
            const history                    = zooms[view]
            const next                       = history?.ahead.at(-1)
            const current                    = viewports[view]

            if (!history || !next || !current)
                return set({ message: t('nenhum zoom para refazer') })

            set({ viewports: { ...viewports, [view]: next }, zooms: { ...zooms, [view]: { back: [...history.back, current], ahead: history.ahead.slice(0, -1) } } })
        },

        // COPIAR COMO TEXTO: UMA LINHA POR PEÇA SELECIONADA (RÓTULO, PEÇA E PROPRIEDADES), PARA COLAR EM OUTROS PROGRAMAS
        copyAsText: () => {
            const { doc, library, selection } = get()
            const lines = selection.map(modelIndex => doc.instances[modelIndex]).filter(instance => instance && instance.moduleIdRef !== WIRE).map(instance => [instance.title, library.getPart(instance.moduleIdRef)?.title ?? instance.moduleIdRef, ...Object.entries(instance.properties).map(([key, value]) => `${key}=${value}`)].join('\t'))

            if (!lines.length)
                return set({ message: t('selecione peças para copiar como texto') })

            void navigator.clipboard?.writeText(lines.join('\n')).then(() => set({ message: t('{0} linhas copiadas como texto', lines.length) }), () => set({ message: t('o navegador não deixou copiar') }))
        },

        setSize: size => set({ size }),

        // A GRADE DA VISTA, OU A DO TIPO DE OBJETO QUANDO AS PREFERÊNCIAS A SOBREPÕEM (GRID OVERRIDES DO KICAD)
        gridOf: (view, kind) => (toInches(get().preferences.overrides[kind] || (get().doc.settings[view]?.gridSize ?? GRID[view])) ?? 0.1) * PX_PER_INCH,

        originOf: view => parseOrigin(get().doc.settings[view]?.gridOrigin),

        gridsOf: view => get().preferences.grids[view] ?? GRID_SIZES[view],

        // PRÓXIMA OU ANTERIOR DA LISTA DE GRADES DA VISTA (N, Shift+N)
        cycleGrid: step => {
            const { doc, view, gridsOf } = get()
            const list    = gridsOf(view)
            const current = list.indexOf(doc.settings[view]?.gridSize ?? GRID[view])
            const next    = list[(Math.max(0, current) + step + list.length) % list.length]
            get().setViewSetting('gridSize', next)
            set({ message: t('grade de {0}', next) })
        },

        setFastGrid: index => {
            const next = get().gridsOf(get().view)[index]

            if (!next)
                return

            get().setViewSetting('gridSize', next)
            set({ message: t('grade rápida {0}: {1}', index + 1, next) })
        },

        cycleFastGrid: () => {
            const { doc, view, gridsOf } = get()
            get().setFastGrid((doc.settings[view]?.gridSize ?? GRID[view]) === gridsOf(view)[0] ? 1 : 0)
        },

        setGridOrigin: point => {
            get().setViewSetting('gridOrigin', point ? `${+point[0].toFixed(3)},${+point[1].toFixed(3)}` : '')
            set({ message: point ? t('origem da grade no cursor') : t('origem da grade de volta a zero') })
        },

        isAligned: view => get().doc.settings[view]?.alignToGrid !== '0',

        isOrthogonal: view => view !== 'pcbView' && get().doc.settings[view]?.orthogonalWires !== '0',

        // FIOS QUE A EDIÇÃO ENTORTOU VOLTAM A 90° E DOBRAS QUE FICARAM RETAS SAEM, NAS VISTAS DE FIOS ORTOGONAIS
        tidy: (origin, doc) => {
            const { library, view, isOrthogonal, gridOf } = get()

            if (!isOrthogonal(view))
                return doc

            const squared = squareWires(origin, doc, library, view, gridOf(view, 'wires'))
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
                return set({ message: t('{0}: peça não encontrada', moduleId) })

            get().commit(VIEWS.filter(isAligned).reduce((current, other) => alignToGrid(current, library, other, [index], gridOf(other, 'parts'), get().originOf(other)), next))
            set({ selection: [index] })
        },

        connect: async (from, to) => {
            await get().library.load([WIRE])
            const { doc, library, view, gridOf, isOrthogonal } = get()
            const made = connectByPath(doc, library, view, from, to, gridOf(view, 'wires'), isOrthogonal(view) || view === 'pcbView')
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
            set({ selection: made.indexes, message: t(made.indexes.length > 1 ? (end ? 'fio com {0} trechos' : 'fio com {0} trechos, ponta solta') : (end ? 'fio com {0} trecho' : 'fio com {0} trecho, ponta solta'), made.indexes.length) })
        },

        setTool: tool => set({ tool, message: tool === 'select' ? '' : TOOL_HINTS[tool] ? t(TOOL_HINTS[tool]) : t('{0}: clique num fio ou num terminal (Shift mantém a ferramenta, Esc ou botão direito sai)', t(TOOL_NAMES[tool as ProbeKind])) }),

        setPanel: panel => set({ panel }),

        setLeft: left => set({ left, leftHidden: false }),

        setMessage: message => set({ message }),

        // OCULTAR A ÁRVORE DE BIBLIOTECAS (KICAD): O PAINEL ESQUERDO SAI E O QUADRO GANHA A LARGURA; O MESMO BOTÃO DO TRILHO VOLTA
        toggleLeft: () => set({ leftHidden: !get().leftHidden }),

        // MANUTENÇÃO: PREFERÊNCIAS, TECLAS, MODO, LÍNGUA, TEMA, PAINEL E TOURS VOLTAM AO PADRÃO; PEÇAS, BINS E VERSÕES FICAM
        resetSettings: () => {
            [PREFS_KEY, KEYS_KEY, LEVEL_KEY, LANG_KEY, THEME_KEY, SHOW_KEY, TOUR_KEY].forEach(key => writeStored(key, null))
            location.reload()
        },

        // ÍNDICE DO ACERVO REFEITO DO ZERO: O BANCO DO INDEXADOR SAI E A PÁGINA RECARREGA (A EXCLUSÃO TERMINA QUANDO O WORKER FECHA)
        rebuildIndex: () => {
            indexedDB.deleteDatabase(INDEX_DB)
            location.reload()
        },

        setSide: side => set({ side, message: side === 'both' ? '' : t(side === 'top' ? 'trilhas novas na face de cima (vermelha); a outra face fica esmaecida' : 'trilhas novas na face de baixo (azul); a outra face fica esmaecida') }),

        // PLACA RETANGULAR DE DUAS FACES EM VOLTA DAS PEÇAS COM COBRE; INSTRUMENTOS DE BANCADA (FONTES, MULTÍMETRO, OSCILOSCÓPIO) VÃO PARA UMA COLUNA À ESQUERDA DELA; DEPOIS O AUTOROUTER (SPEC 03 §8.3.1)
        makeBoard: async () => {
            const { doc, library } = get()
            await library.load([BOARD])
            const scene   = new Scene(doc, library, 'pcbView')
            const shown   = Object.values(doc.instances).filter(instance => scene.isShown(instance) && library.getPart(instance.moduleIdRef)?.views.pcbView?.layers.some(layer => layer.startsWith('copper')))
            const bench   = (instance: Instance) => INSTRUMENTS.some(name => (library.getPart(instance.moduleIdRef)?.properties.family ?? '').toLowerCase().includes(name))
            const bounds  = unionBoxes(shown.filter(instance => !bench(instance)).map(instance => scene.getBounds(instance.modelIndex)))

            if (!bounds)
                return set({ message: t('coloque peças antes de criar a placa') })

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
            set({ selection: [], view: 'pcbView', viewports: { ...get().viewports, pcbView: undefined }, message: t('placa criada em volta das peças; roteando…') })
            await get().autoroute()
        },

        toggleTheme: () => {
            const theme = get().theme === 'dark' ? 'light' : 'dark'
            document.documentElement.dataset.theme = theme
            writeStored(THEME_KEY, theme)
            set({ theme })
        },

        setPlacing: placing => set({ placing, tool: 'select', message: placing ? t('clique no quadro para posicionar a peça (Shift mantém, Esc cancela)') : '' }),

        toggleLayer: id => set({ hiddenLayers: get().hiddenLayers.includes(id) ? get().hiddenLayers.filter(other => other !== id) : [...get().hiddenLayers, id] }),

        setHiddenLayers: ids => set({ hiddenLayers: ids }),

        setPreferences: patch => {
            const preferences = { ...get().preferences, ...patch }
            set({ preferences, message: writeStored(PREFS_KEY, preferences) ?? t('preferências gravadas neste navegador') })
        },

        setKeys: keys => set({ keys, message: writeStored(KEYS_KEY, keys) ?? t('atalhos gravados neste navegador') }),

        setDialog: dialog => set({ dialog }),

        showTour: level => set({ tour: level }),

        finishTour: () => {
            const { tour, toured } = get()
            const seen             = tour && !toured.includes(tour) ? [...toured, tour] : toured
            writeStored(TOUR_KEY, seen)
            set({ tour: null, toured: seen })
        },

        // O DICIONÁRIO DO INGLÊS SÓ CARREGA QUANDO ESCOLHIDO; TROCAR A LÍNGUA REMONTA A INTERFACE (ui/App) COM OS TEXTOS NOVOS
        setLanguage: async language => {
            setWords(language, language === 'en' ? (await import('../../core/Text/en')).EN : {})
            document.documentElement.lang = getTag()
            writeStored(LANG_KEY, JSON.stringify(language))
            set({ language })
        },

        setLevel: level => {
            writeStored(LEVEL_KEY, level)
            set({ level, tour: get().toured.includes(level) ? get().tour : level, message: t('modo {0}: {1}; a paleta (Ctrl+K) acha tudo em qualquer modo', t(LEVELS.find(([id]) => id === level)?.[1] ?? ''), t(LEVELS.find(([id]) => id === level)?.[2] ?? '')) })
        },

        // TESTE DO TRANSITÓRIO NO PROJETO; O MANUAL COMEÇA DA JANELA QUE ESTAVA VALENDO (SPEC 04 §5.5)
        setTest: mode => {
            const { doc, simulation, setProjectProperties } = get()
            const analysis = simulation.result?.circuit.analysis.type === 'tran' ? simulation.result.circuit.analysis : null
            const kept: Record<string, string> = mode === 'custom' && analysis && !projectValue(doc, STOP_KEY) ? { [START_KEY]: formatSi(analysis.t0, 's', 6), [STOP_KEY]: formatSi(analysis.t1, 's', 6), simulator_number_of_steps: String(analysis.steps), simulator_time_step_mode: 'false', [INITIAL_KEY]: analysis.initial } : {}
            setProjectProperties({ [PRESET_KEY]: mode, ...kept })
        },

        // SIMULAR LIGA E ABRE O PAINEL; PARAR DESLIGA E LIMPA O RESULTADO (FRIZING_KICAD §5, DECISÃO 2)
        toggleSimulation: () => {
            const enabled = !get().simulation.enabled
            get().setSimulation({ enabled, result: null, error: null, playing: false, step: 0 })

            if (enabled)
                get().setShow({ chart: true })
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
            const [dx, dy]      = anchor && isAligned(view) && !inPlace ? getGridShift(scene, anchor, gridOf(view, 'parts'), get().originOf(view)) : [0, 0]
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
                return set({ message: t('{0}: o acervo não tem a outra posição desta chave', instance.title) })

            await library.load([other.moduleId])
            const plans = getSwitching(get().doc)
            const pair  = status === 'Pressed' ? { pressed: part.moduleId, released: other.moduleId } : { pressed: other.moduleId, released: part.moduleId }
            const kept  = Object.fromEntries(Object.entries(plans).filter(([index]) => index !== modelIndex && get().doc.instances[index]))
            const next  = events.length ? { ...kept, [modelIndex]: { ...pair, events: [...events].sort((a, b) => a[0] - b[0]) } } : kept
            get().setProjectProperties({ [SWITCH_KEY]: Object.keys(next).length ? JSON.stringify(next) : '' })
        },

        newSketch: () => {
            place(blankSheet(), t('sketch novo'))
        },

        switchSheet: id => {
            const { sheets, sheet } = get()
            const target            = sheets.find(item => item.id === id)

            if (target && id !== sheet)
                activate(target, sheets.map(item => item.id === sheet ? stash() : item), t(target.name))
        },

        // FECHAR A ABA: COM ALTERAÇÕES, PERGUNTA ANTES; A ÚLTIMA ABA FECHADA DÁ LUGAR A UM SKETCH NOVO
        closeSheet: id => {
            const { sheets, sheet, autosave } = get()
            const index                       = sheets.findIndex(item => item.id === id)
            const target                      = id === sheet ? stash() : sheets[index]
            const rest                        = sheets.filter(item => item.id !== id)
            const fresh                       = { id: id + 1, ...blankSheet() }

            if (!target || (target.doc !== target.saved && !window.confirm(t('Fechar {0} sem salvar? (as alterações ficam nas versões salvas automaticamente)', t(target.name)))))
                return

            void autosave.close(String(id))

            if (!rest.length)
                return activate(fresh, [fresh], t('{0} fechado', t(target.name)))

            if (id === sheet)
                return activate(rest[Math.max(0, index - 1)], rest, t('{0} fechado', t(target.name)))

            set({ sheets: rest, message: t('{0} fechado', t(target.name)) })
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
            set({ doc: { ...doc, settings: { ...doc.settings, pcbView: { ...doc.settings.pcbView, ...values } } }, message: t('ajustes de roteamento gravados no sketch') })
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
            set({ message: t('exportando…') })

            try {
                set({ message: await (await import('../Output')).exportAs(kind, { doc, library, netlist, view, name, svg, bounds: getDrawing(new Scene(doc, library, view), null).bounds, selection }) })
            } catch (error) {
                if (!(error instanceof Error))
                    throw error

                set({ message: t('falha ao exportar: {0}', error.message) })
            }
        },

        // quiet: O DRC AUTOMÁTICO DA PCB, SEM MENSAGEM NA BARRA; AS MARCAS ANTIGAS FICAM ATÉ O NOVO RESULTADO E O DE UM DOCUMENTO QUE JÁ MUDOU É DESCARTADO
        checkRules: async (quiet = false) => {
            const { doc } = get()
            const board   = await pcbBoard(get())

            if (typeof board === 'string')
                return set(quiet ? { drc: null } : { message: board })

            const { artwork, config } = board
            const groups              = artwork.conductors.map(getGroupOf(doc, board.netlist))

            if (!quiet)
                set({ message: t('verificando regras de projeto…') })

            const violations = await get().pcb.request<Violation[]>({ type: 'drc', artwork, groups, keepout: config.keepout })
            const message    = !violations ? stopped('DRC', get().pcb.failure) : violations.length ? t('DRC: {0} problemas com folga de {1} mil', violations.length, config.keepout.toFixed(1)) : t('DRC: nenhum problema com folga de {0} mil', config.keepout.toFixed(1))

            if (get().doc !== doc)
                return

            set({ ...violations ? { drc: { violations, frame: artwork.board.frame, keepout: config.keepout } } : {}, ...quiet ? {} : { message } })
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
            set({ message: mode === 'ground' ? t('preenchendo com terra…') : t('preenchendo com cobre…') })

            const fragments = await get().pcb.request<FillFragment[]>({ type: 'fill', artwork, grounded, faces: [...faces], mode, keepout: config.fillKeepout })

            if (!fragments)
                return set({ message: stopped('preenchimento', get().pcb.failure) })

            await get().library.load([FILL])
            get().commit(createFills(cleared, fragments, artwork.board.frame, mode))
            set({ message: t('{0} áreas de cobre criadas', fragments.length) })
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
                return set({ message: t('solte o preenchimento numa área livre da placa') })

            const { doc } = get()
            get().commit(createFills(doc, [hit], artwork.board.frame, 'individual'))
            set({ selection: [String(doc.nextIndex)], message: t('preenchimento criado na área do ponto') })
        },

        removeFills: () => {
            const { doc, library, selection } = get()
            const problem                     = boardProblem(doc, library, selection)

            if (problem)
                return set({ message: t(problem) })

            get().commit(removeFills(doc, library, selection))
            set({ message: t('preenchimentos removidos') })
        },

        autoroute: async () => {
            const { doc, library, view } = get()

            if (view === 'breadboardView')
                return set({ message: t('o autorouter roteia o esquemático e a PCB') })

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
            set({ routing: { cycle: 0, cycles: config.cycles, connected: 0, requested: 0 }, message: t('autoroteando…') })

            const routed = await get().pcb.request<{ plan: Plan, connected: number, requested: number, vias: number }>({ type: 'route', artwork, keys, terminals, config }, progress => set({ routing: progress }))
            set({ routing: null })

            if (!routed)
                return set({ message: stopped('autorouter', get().pcb.failure) })

            get().commit(applyPlan(cleared, library, 'pcbView', routed.plan, config.traceWidth, config.holeSize), doc)
            set({ message: t('autorouter: {0} de {1} ligações, {2} vias', routed.connected, routed.requested, routed.vias) })
        },

        autorouteSheet: async () => {
            const { doc, library, wasm } = get()
            await library.load([WIRE])

            const cleared = deleteAutorouted(doc, library, 'schematicView')
            const sheet   = new Scene(cleared, library, 'schematicView').getSheet()
            const netlist = wasm ? new Netlist(cleared, library, wasm) : null

            if (!netlist || !sheet.pins.length)
                return set({ message: t('nada para rotear no esquemático') })

            netlist.update()
            const label  = (labels: Uint32Array | undefined, key: string) => netlist.index.has(key) ? labels?.[netlist.index.get(key) ?? 0] ?? null : null
            const config = getConfig(doc.settings.pcbView)
            set({ routing: { cycle: 0, cycles: config.cycles, connected: 0, requested: 0 }, message: t('autoroteando o esquemático…') })

            const attempt = (step: number) => {
                const { grid, frame } = buildSheetGrid(sheet, key => label(netlist.nets.schematicView, key), key => label(netlist.routed.schematicView, key), step)
                return get().pcb.request<{ plan: Plan, connected: number, requested: number }>({ type: 'sheet', grid, frame, terminals: Object.fromEntries(sheet.pins), cycles: config.cycles }, progress => set({ routing: progress }))
            }

            const whole  = await attempt(get().gridOf('schematicView', 'wires'))
            const half   = whole && whole.connected < whole.requested ? await attempt(get().gridOf('schematicView', 'wires') / 2) : null
            const routed = half && whole && half.connected > whole.connected ? half : whole
            set({ routing: null })

            if (!routed)
                return set({ message: stopped('autorouter do esquemático', get().pcb.failure) })

            get().commit(applyPlan(cleared, library, 'schematicView', routed.plan, WIRE_STYLE.schematicView.mils, config.holeSize), doc)
            set({ message: t('autorouter do esquemático: {0} de {1} ligações', routed.connected, routed.requested) })
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

            const circuit  = buildCircuit(doc, library, netlist, true)
            const previous = simulation.result
            const before   = previous?.circuit.analysis
            const after    = circuit.analysis
            const same     = before?.type === 'tran' && after.type === 'tran' && before.t0 === after.t0 && before.t1 === after.t1 && before.step === after.step && before.initial === after.initial && !simulation.error
            const keep     = same && previous && simulation.step > 0 && simulation.step < previous.steps - 1 ? simulation.step : 0

            if (!circuit.simulated.length)
                return get().setSimulation({ result: new Simulation(doc, library, circuit, {}), error: t('nenhuma peça simulável ligada ao circuito'), busy: false, playing: false })

            get().setSimulation({ busy: true })
            const deck    = keep && previous ? resumeCircuit(circuit, getInitial(previous, circuit, keep), keep).deck : circuit.deck
            const run     = await simulator.run(deck)
            const fresh   = after.type === 'tran' && after.initial === 'zero' ? fromRest(run.vectors) : run.vectors
            const vectors = keep && previous && !run.error ? joinRuns(previous, keep, circuit, run.vectors) : fresh
            const result  = new Simulation(doc, library, circuit, vectors)

            if (get().simulation.enabled && keep && !run.error)
                return get().setSimulation({ busy: false, result, error: null })

            if (get().simulation.enabled)
                get().setSimulation({ busy: false, result, error: run.error, step: 0, playing: !run.error && !result.isStill(), started: performance.now() })
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
            set({ message: t('{0}.fzbz exportado com {1} peças', title, mine.length) })
        },

        addToMine: moduleIds => {
            const mine   = [...new Set([...get().mine, ...moduleIds])]
            const failed = writeStored(MINE_KEY, mine)
            set({ mine, ...failed ? { message: t('bin não gravado: {0}', failed) } : {} })
        },

        createBin: (title, moduleIds) => {
            const userBins = [...get().userBins, { title: title.trim() || `Bin ${get().userBins.length + 1}`, moduleIds: [...new Set(moduleIds)] }]
            const failed   = writeStored(BINS_KEY, userBins)
            set({ userBins, message: failed ? t('bin não gravado: {0}', failed) : t('bin {0} com {1} peças', userBins[userBins.length - 1].title, moduleIds.length) })
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
            set({ userBins, message: failed ? t('bin não gravado: {0}', failed) : t('{0} peça(s) em {1}', moduleIds.length, userBins[index]?.title ?? '') })
        },

        exportBin: index => {
            const { userBins, library } = get()
            const bin                   = userBins[index]

            if (!bin)
                return

            download(`${bin.title}.fzbz`, exportBinBundle(bin.title, bin.moduleIds, library.getBundleFiles(bin.moduleIds)), 'application/zip')
            set({ message: t('{0}.fzbz exportado com {1} peças', bin.title, bin.moduleIds.length) })
        },

        // GUARDA NO NAVEGADOR OS ARQUIVOS DE PEÇAS DE PACOTE, PARA MEUS ITENS E OS BINS VOLTAREM NA PRÓXIMA SESSÃO (SPEC 01 §8A.6)
        keepParts: async files => {
            const failed = await get().vault.save(PARTS, files.map(file => [file.name, file]))

            if (failed)
                set({ message: t('peças não guardadas no navegador ({0}); continuam nesta sessão', failed) })
        },

        editPart: modelIndex => {
            const { doc, library } = get()
            const part             = library.getPart(doc.instances[modelIndex ?? '']?.moduleIdRef ?? '')

            if (modelIndex && !isEditable(part))
                return set({ message: t('esta peça não abre no editor de peças') })

            set({ editing: modelIndex })
        },

        // PEÇA GRAVADA NO EDITOR: ENTRA NO ACERVO COMO PEÇA DE PACOTE, VAI PARA MEUS ITENS E PODE SUBSTITUIR A INSTÂNCIA EDITADA (SPEC 01 §8A.5)
        installPart: async (files, replace) => {
            const { library } = get()
            const [moduleId]  = library.addBundle({ sketch: null, parts: files.filter(file => file.name.startsWith('part.')), svgs: files.filter(file => file.name.startsWith('svg.')), others: [], bin: null })
            await library.load(moduleId ? [moduleId] : [])
            const part        = library.getPart(moduleId ?? '')

            if (!part)
                return set({ message: t('a peça gravada não carregou') })

            get().keepParts(files)
            get().addToMine([part.moduleId])
            set({ imported: [...get().imported.filter(entry => entry.moduleId !== part.moduleId), entryOf(part)], editing: null })

            if (replace)
                await get().swap(replace, part.moduleId)

            set({ message: t(replace ? '{0} gravada em Meus itens e trocada no sketch' : '{0} gravada em Meus itens', part.title) })
        }
    }
})

// PEDIDO AO WORKER QUE VOLTOU SEM RESULTADO: CANCELADO PELO USUÁRIO OU A CAUSA DA FALHA, COM A SAÍDA
const stopped = (task: string, failure: string) => failure ? t('{0}: {1}; tente de novo', t(task), failure) : t('{0} cancelado', t(task))

const GROUNDED = new Set(['gnd', 'vss', 'ground'])

// DEPOIS DE GIRAR OU ESPELHAR, O PRIMEIRO TERMINAL VOLTA À GRADE (NO ESQUEMÁTICO E NA PCB; NA PROTOBOARD O ENCAIXE DECIDE)
const settle = (doc: Doc, selection: string[]) => {
    const { library, view, isAligned, gridOf, originOf } = useStore.getState()
    return view !== 'breadboardView' && isAligned(view) ? alignToGrid(doc, library, view, selection, gridOf(view, 'parts'), originOf(view)) : doc
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
        return problem ?? t('é preciso uma placa na vista PCB')

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
        return t('nenhum conector de terra: marque uma semente no menu de um conector')

    if (!seeds.length && nets.size > 1)
        return t('há mais de uma net de terra: marque as sementes no menu de um conector')

    return nets
}

const signature = (doc: Doc) => [...Object.values(doc.instances).filter(instance => instance.moduleIdRef !== WIRE).map(instance => `${instance.modelIndex}:${instance.moduleIdRef}:${instance.title}:${JSON.stringify(instance.properties)}`), ...doc.probes.map(probe => `${probe.id}:${probe.kind}:${probe.key}:${probe.flip}`), JSON.stringify(doc.projectProperties)].join('|')

// MUDANÇA DO DOCUMENTO, DO NOME OU DO ESTADO SALVO AGENDA O SALVAMENTO AUTOMÁTICO DO SKETCH DAQUELA ABA; O .fzz É MONTADO NA HORA DE GRAVAR
useStore.subscribe((state, previous) => {
    if (state.ready && (state.doc !== previous.doc || state.saved !== previous.saved || state.name !== previous.name))
        state.autosave.schedule(String(state.sheet), () => snapshotOf(state))
})

let pending: ReturnType<typeof setTimeout> | undefined
let checking: ReturnType<typeof setTimeout> | undefined

// NA PCB, MUDANÇA DO DOCUMENTO OU A CHEGADA NA VISTA REFAZ O DRC SOZINHO: O PROBLEMA APARECE MARCADO NO DESENHO E EM PROBLEMAS (FRIZING_KICAD §5)
useStore.subscribe((state, previous) => {
    if (!state.ready || state.view !== 'pcbView' || state.routing || (state.doc === previous.doc && state.view === previous.view))
        return

    clearTimeout(checking)
    checking = setTimeout(() => void useStore.getState().checkRules(true), DRC_DELAY)
})

// COM O SIMULADOR LIGADO, MUDANÇA DE TOPOLOGIA, DE PEÇA OU DE PROPRIEDADE AGENDA NOVA SIMULAÇÃO
useStore.subscribe((state, previous) => {
    const toggled = state.simulation.enabled !== previous.simulation.enabled
    const changed = state.netlist !== previous.netlist || (state.doc !== previous.doc && signature(state.doc) !== signature(previous.doc))

    if (!state.simulation.enabled || !(toggled || changed))
        return

    clearTimeout(pending)
    pending = setTimeout(() => void useStore.getState().simulate(), DEBOUNCE)
})
