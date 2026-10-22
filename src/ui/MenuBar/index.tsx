import { useEffect, useRef, useState } from 'react'
import { WIRE_FLAGS } from '../../core/Document'
import { VIEWS, VIEW_LABELS } from '../../core/Layer'
import { Scene } from '../../engine/Scene'
import { clearGroundFillSeeds, setAutoroutable, setTraceSide } from '../../engine/Edit'
import { MenuList, type MenuEntry } from '../ContextMenu'
import { getMenu } from '../Menus'
import { BOARD_EXPORTS, type ExportKind } from '../Export'
import { useStore } from '../Store'
import { shortcutOf } from '../Keys'
import { BENCHES } from '../../engine/Bench'
import { getMode } from '../../core/Spice'
import { TESTS } from '../SimulationPanel'
import { LAYER_GROUPS } from '../Layers'
import { LEVELS } from '../Modes'
import type { ProbeKind } from '../../core/Document'

type State = ReturnType<typeof useStore.getState>

const ZOOM_STEP  = 1.25
const REAL_SIZE  = 96 / 90    // TELA DE 96 PX/in SOBRE CENA DE 90 PX/in
const BOARDS     = ['board', 'resizableBoard']
const AUTOROUTED = 32

const ALIGNS: [string, Parameters<State['align']>[0]][] = [['Esquerda', 'left'], ['Centro horizontal', 'hcenter'], ['Direita', 'right'], ['Topo', 'top'], ['Centro vertical', 'vcenter'], ['Base', 'bottom']]
const IMAGES: [string, ExportKind][] = [['PNG…', 'png'], ['JPG…', 'jpg'], ['SVG…', 'svg'], ['PDF…', 'pdf']]
const PRODUCTION: [string, ExportKind][] = [['Gravável (PDF)…', 'etchablePdf'], ['Gravável (SVG)…', 'etchableSvg'], ['Gerber estendido (RS-274X)…', 'gerber'], ['Pick-and-place…', 'pnp']]
const LISTS: [string, ExportKind][] = [['Lista de materiais (HTML)…', 'bomHtml'], ['Lista de materiais (CSV)…', 'bomCsv'], ['Lista de materiais (PDF)…', 'bomPdf'], ['Netlist IPC-D-356A…', 'ipc'], ['Netlist XML…', 'xml'], ['Netlist SPICE…', 'spice']]

const isTrace = (state: State, modelIndex: string) => (state.doc.instances[modelIndex]?.views[state.view]?.geometry.wireFlags ?? 0) & (WIRE_FLAGS.pcbView | WIRE_FLAGS.schematicView)

// EXEMPLOS DO FRITZING EM SUBMENUS POR PASTA
const sampleTree = (state: State, files: string[], depth = 0): MenuEntry[] => {
    const folders = [...new Set(files.filter(file => file.split('/').length > depth + 1).map(file => file.split('/')[depth]))]
    const leaves  = files.filter(file => file.split('/').length === depth + 1)
    return [...folders.map(folder => ({ label: folder, items: sampleTree(state, files.filter(file => file.split('/')[depth] === folder), depth + 1) })), ...leaves.map(file => ({ label: file.split('/').pop()?.replace(/\.fzz$/, '') ?? file, apply: () => void state.openSample(file) }))]
}

const fileMenu = (state: State): MenuEntry[] => {
    const scene = new Scene(state.doc, state.library, 'pcbView')
    const board = Object.values(state.doc.instances).some(instance => scene.isShown(instance) && BOARDS.includes(state.library.getPart(instance.moduleIdRef)?.kind ?? ''))
    const item  = ([label, kind]: [string, ExportKind]): MenuEntry => ({ label, disabled: BOARD_EXPORTS.includes(kind) && !board, apply: () => void state.exportFile(kind) })

    return [
        { label: 'Novo', shortcut: shortcutOf(state.keys, 'new'), apply: state.newSketch },
        { label: 'Abrir…', shortcut: shortcutOf(state.keys, 'open'), apply: () => document.getElementById('open-file')?.click() },
        { label: 'Exemplos', disabled: !state.samples.length, items: sampleTree(state, state.samples) },
        null,
        { label: 'Salvar', shortcut: shortcutOf(state.keys, 'save'), apply: () => void state.save() },
        { label: 'Versões salvas automaticamente…', apply: () => void state.showVersions() },
        { label: 'Exportar', items: [{ label: 'Como imagem', items: IMAGES.map(item) }, { label: 'Para produção', items: [item(['Tudo para fabricar (zip)…', 'production']), null, ...PRODUCTION.map(item)] }, null, ...LISTS.map(item)] }
    ]
}

const editMenu = (state: State): MenuEntry[] => [
    { label: 'Desfazer', shortcut: shortcutOf(state.keys, 'undo'), disabled: !state.past.length, apply: state.undo },
    { label: 'Refazer', shortcut: shortcutOf(state.keys, 'redo'), disabled: !state.future.length, apply: state.redo },
    { label: 'Histórico de desfazer', disabled: !state.past.length && !state.future.length, apply: () => state.setLeft('project') },
    null,
    { label: 'Recortar', shortcut: shortcutOf(state.keys, 'cut'), disabled: !state.selection.length, apply: state.cut },
    { label: 'Copiar', shortcut: shortcutOf(state.keys, 'copy'), disabled: !state.selection.length, apply: state.copy },
    { label: 'Colar', shortcut: shortcutOf(state.keys, 'paste'), disabled: !state.clipboard, apply: () => void state.paste(false) },
    { label: 'Colar no lugar', shortcut: shortcutOf(state.keys, 'pasteInPlace'), disabled: !state.clipboard, apply: () => void state.paste(true) },
    { label: 'Duplicar', shortcut: shortcutOf(state.keys, 'duplicate'), disabled: !state.selection.length, apply: () => void state.duplicate() },
    { label: 'Apagar', shortcut: shortcutOf(state.keys, 'remove'), disabled: !state.selection.length, apply: () => state.remove(false) },
    { label: 'Apagar sem fios', shortcut: shortcutOf(state.keys, 'removeMinus'), disabled: !state.selection.length, apply: () => state.remove(true) },
    null,
    { label: 'Selecionar tudo', shortcut: shortcutOf(state.keys, 'selectAll'), apply: state.selectAll },
    { label: 'Desmarcar', shortcut: shortcutOf(state.keys, 'escape'), disabled: !state.selection.length, apply: () => state.select([]) },
    null,
    { label: 'Adicionar nota', apply: () => void state.addNote() },
    null,
    { label: 'Preferências…', shortcut: shortcutOf(state.keys, 'preferences'), apply: () => state.setDialog('preferences') }
]

const partMenu = (state: State): MenuEntry[] => {
    const scene  = new Scene(state.doc, state.library, state.view)
    const target = state.selection.find(modelIndex => !scene.isWire(modelIndex))
    const parts  = target ? getMenu({ kind: 'part', modelIndex: target, key: null, point: [0, 0], rat: null }) : []
    const align  = { label: 'Alinhar', disabled: state.selection.length < 2, items: ALIGNS.map(([label, mode]): MenuEntry => ({ label, apply: () => state.align(mode) })) }
    return target ? [...parts.slice(0, 3), align, ...parts.slice(3)] : [{ label: 'Selecione uma peça', disabled: true }]
}

const viewMenu = (state: State): MenuEntry[] => {
    const settings = state.doc.settings[state.view] ?? {}
    return [
        { label: 'Ampliar', shortcut: shortcutOf(state.keys, 'zoomIn'), apply: () => state.zoom(ZOOM_STEP) },
        { label: 'Reduzir', shortcut: shortcutOf(state.keys, 'zoomOut'), apply: () => state.zoom(1 / ZOOM_STEP) },
        { label: 'Enquadrar', shortcut: shortcutOf(state.keys, 'fit'), apply: () => state.setViewport(state.view, undefined) },
        { label: 'Tamanho real', apply: () => state.setZoom(REAL_SIZE) },
        { label: '100%', shortcut: shortcutOf(state.keys, 'actual'), apply: () => state.setZoom(1) },
        null,
        { label: 'Alinhar à grade', checked: settings.alignToGrid !== '0', apply: () => state.setViewSetting('alignToGrid', settings.alignToGrid === '0' ? '1' : '0') },
        { label: 'Mostrar grade', checked: settings.showGrid !== '0', apply: () => state.setViewSetting('showGrid', settings.showGrid === '0' ? '1' : '0') },
        { label: 'Fios ortogonais (90°)', checked: state.isOrthogonal(state.view), disabled: state.view === 'pcbView', apply: () => state.setViewSetting('orthogonalWires', settings.orthogonalWires === '0' ? '1' : '0') },
        null,
        ...VIEWS.map((view, i): MenuEntry => ({ label: VIEW_LABELS[view], shortcut: shortcutOf(state.keys, ['breadboard', 'schematic', 'pcb'][i]), checked: view === state.view, apply: () => state.setView(view) })),
        ...state.view === 'pcbView' ? [{ label: 'Camadas da PCB', items: [...LAYER_GROUPS.map(([id, label]): MenuEntry => ({ label, checked: !state.hiddenLayers.includes(id), apply: () => state.toggleLayer(id) })), null, { label: 'Mostrar todas as camadas', apply: () => state.setHiddenLayers([]) }, { label: 'Ocultar todas as camadas', apply: () => state.setHiddenLayers(LAYER_GROUPS.map(([id]) => id)) }] }] : [],
        null,
        { label: 'Modo da interface', items: LEVELS.map(([level, label]): MenuEntry => ({ label, checked: state.level === level, apply: () => state.setLevel(level) })) },
        { label: state.theme === 'dark' ? 'Tema claro' : 'Tema escuro', apply: state.toggleTheme }
    ]
}

const routingMenu = (state: State): MenuEntry[] => {
    const wires  = { label: state.view === 'breadboardView' ? 'Selecionar todos os fios' : 'Selecionar todas as trilhas', apply: () => state.selectWhere(instance => instance.moduleIdRef === 'WireModuleID' && (state.view === 'breadboardView' || isTrace(state, instance.modelIndex) !== 0)) }
    const traces = state.selection.filter(modelIndex => state.doc.instances[modelIndex]?.moduleIdRef === 'WireModuleID' && isTrace(state, modelIndex))
    const fixed  = traces.length > 0 && traces.every(modelIndex => ((state.doc.instances[modelIndex]?.views[state.view]?.geometry.wireFlags ?? 0) & AUTOROUTED) === 0)
    const busy   = state.routing !== null

    if (state.view === 'schematicView')
        return [{ label: 'Autorotear', shortcut: shortcutOf(state.keys, 'autoroute'), disabled: busy, apply: () => void state.autoroute() }, { label: 'Não rotear automaticamente', checked: fixed, disabled: !traces.length, apply: () => state.edit(doc => traces.reduce((current, modelIndex) => setAutoroutable(current, state.library, state.view, modelIndex, fixed), doc)) }, null, wires, { label: 'Apagar fios autoroteados', disabled: busy, apply: state.clearAutorouted }]

    if (state.view !== 'pcbView')
        return [wires]

    return [
        { label: 'Autorotear', shortcut: shortcutOf(state.keys, 'autoroute'), disabled: busy, apply: () => void state.autoroute() },
        { label: 'Verificar regras (DRC)', shortcut: shortcutOf(state.keys, 'drc'), disabled: busy, apply: () => void state.checkRules() },
        { label: 'Regras do autorouter e DRC…', apply: () => state.setPanel('routing') },
        { label: 'Preenchimento de cobre', disabled: busy, items: [
            { label: 'Preencher com terra', apply: () => void state.fillCopper('ground') },
            { label: 'Preencher com cobre', apply: () => void state.fillCopper('plain') },
            { label: 'Remover preenchimento', apply: state.removeFills },
            null,
            { label: 'Limpar sementes de terra', apply: () => state.edit(clearGroundFillSeeds) }
        ] },
        null,
        { label: 'Mover trilha para a outra face', disabled: !traces.length, apply: () => state.edit(doc => traces.reduce(setTraceSide, doc)) },
        { label: 'Não rotear automaticamente', checked: fixed, disabled: !traces.length, apply: () => state.edit(doc => traces.reduce((current, modelIndex) => setAutoroutable(current, state.library, state.view, modelIndex, fixed), doc)) },
        null,
        wires,
        { label: 'Selecionar trilhas autoroteáveis', apply: () => state.selectWhere(instance => instance.moduleIdRef === 'WireModuleID' && ((instance.views.pcbView?.geometry.wireFlags ?? 0) & AUTOROUTED) !== 0) },
        { label: 'Selecionar todas as vias', apply: () => state.selectWhere((_, part) => part?.kind === 'via') },
        { label: 'Selecionar todos os preenchimentos', apply: () => state.selectWhere((_, part) => part?.kind === 'copperFill') },
        null,
        { label: 'Apagar trilhas autoroteadas', disabled: busy, apply: state.clearAutorouted }
    ]
}

const PROBE_ITEMS: [string, ProbeKind][] = [['Ponta de tensão', 'voltage'], ['Ponta de corrente', 'current'], ['Ponta de tensão e corrente', 'both']]

const simulationMenu = (state: State): MenuEntry[] => {
    const mode = getMode(state.doc)
    return [
        { label: state.simulation.enabled ? 'Parar a simulação' : 'Simular', apply: state.toggleSimulation },
        { label: 'Teste', items: TESTS.map(([id, label]): MenuEntry => ({ label, checked: mode === id, apply: () => state.setTest(id) })) },
        { label: 'Painel de simulação', checked: state.show.chart, apply: () => state.setShow({ chart: !state.show.chart }) },
        null,
        ...PROBE_ITEMS.map(([label, kind]): MenuEntry => ({ label, checked: state.tool === kind, disabled: state.view === 'pcbView', apply: () => state.setTool(kind) })),
        { label: 'Remover todas as pontas de prova', disabled: !state.doc.probes.length, apply: () => state.removeProbes(state.doc.probes.map(probe => probe.id)) },
        null,
        { label: 'Circuitos de teste', items: BENCHES.map(bench => ({ label: bench.title, apply: () => void state.openBench(bench.id) })) }
    ]
}

const helpMenu = (state: State): MenuEntry[] => [
    { label: 'Paleta de comandos', shortcut: shortcutOf(state.keys, 'palette'), apply: () => useStore.setState({ dialog: 'palette' }) },
    { label: 'Atalhos de teclado', apply: () => useStore.setState({ dialog: 'shortcuts' }) },
    { label: 'Sobre o CircuitMaster', apply: () => useStore.setState({ dialog: 'about' }) }
]

const MENUS: [string, (state: State) => MenuEntry[]][] = [['Arquivo', fileMenu], ['Editar', editMenu], ['Peça', partMenu], ['Exibir', viewMenu], ['Roteamento', routingMenu], ['Simulação', simulationMenu], ['Ajuda', helpMenu]]

export type Command = { path: string[], entry: NonNullable<MenuEntry> }

// TODO ITEM DOS MENUS COM O CAMINHO ATÉ ELE, MAIS OS PAINÉIS DO TRILHO, PARA A PALETA DE COMANDOS
export const getCommands = (state: State): Command[] => {
    const walk   = (entries: MenuEntry[], path: string[]): Command[] => entries.flatMap(entry => !entry ? [] : entry.items ? walk(entry.items, [...path, entry.label]) : [{ path, entry }])
    const panels = ([['parts', 'Peças'], ['project', 'Projeto'], ['problems', 'Problemas']] as const).map(([id, label]): Command => ({ path: ['Painéis'], entry: { label, apply: () => state.setLeft(id) } }))
    return [...MENUS.flatMap(([title, build]) => walk(build(state), [title])), ...panels]
}

// BARRA DE MENUS DA JANELA: CLIQUE ABRE, PASSAR POR OUTRO TÍTULO TROCA, CLIQUE FORA OU ESC FECHA (SPEC 02 §10.4)
export const MenuBar = () => {
    const ref             = useRef<HTMLElement>(null)
    const [open, setOpen] = useState<number | null>(null)
    const ready           = useStore(state => state.ready)

    useEffect(() => {
        const onDown = (event: PointerEvent) => {
            if (!ref.current?.contains(event.target as Node))
                setOpen(null)
        }

        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape')
                setOpen(null)
        }

        window.addEventListener('pointerdown', onDown, true)
        window.addEventListener('keydown', onKey, true)
        return () => {
            window.removeEventListener('pointerdown', onDown, true)
            window.removeEventListener('keydown', onKey, true)
        }
    }, [])

    return (
        <nav ref={ref} className="menubar" aria-label="Menu principal">
            {MENUS.map(([title, build], i) => (
                <div key={title} className={`menu ${open === i ? 'open' : ''}`}>
                    <button aria-haspopup="true" aria-expanded={open === i} disabled={!ready} onClick={() => setOpen(open === i ? null : i)} onMouseEnter={() => open !== null && setOpen(i)}>{title}</button>
                    {open === i && <div className="absolute left-0 top-8 z-[60]"><MenuList items={build(useStore.getState())} close={() => setOpen(null)} left={false} /></div>}
                </div>
            ))}
        </nav>
    )
}
