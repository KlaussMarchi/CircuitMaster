import { useEffect, useRef, useState } from 'react'
import { WIRE_FLAGS } from '../../core/Document'
import { VIEWS, VIEW_LABELS } from '../../core/Layer'
import { Scene } from '../../engine/Scene'
import { clearGroundFillSeeds, setAutoroutable, setTraceSide } from '../../engine/Edit'
import { MenuList, type MenuEntry } from '../ContextMenu'
import { getMenu } from '../Menus'
import { needsBoard, type ExportKind } from '../Export'
import { useStore } from '../Store'
import { getKeyAction, shortcutOf } from '../Keys'
import { BENCHES } from '../../engine/Bench'
import { LAYER_GROUPS } from '../Layers'
import { LEVELS } from '../Modes'
import { LANGUAGES, t } from '../../core/Text'
import { CROSSHAIRS, UNITS, centerOnCursor, centerOnSelection, showIn, useCursor, zoomToSelection } from '../Navigation'
import type { ProbeKind } from '../../core/Document'

type State = ReturnType<typeof useStore.getState>

const ZOOM_STEP  = 1.25
const REAL_SIZE  = 96 / 90    // TELA DE 96 PX/in SOBRE CENA DE 90 PX/in
const BOARDS     = ['board', 'resizableBoard']
const AUTOROUTED = 32
const SHOW_IN: Record<typeof VIEWS[number], string> = { breadboardView: 'Ver na protoboard', schematicView: 'Ver no esquemático', pcbView: 'Ver na PCB' }

const FACES: [Parameters<State['setSide']>[0], string, string][] = [['both', 'As duas faces de cobre clicáveis', 'sideBoth'], ['top', 'Só a face de cima clicável', 'sideTop'], ['bottom', 'Só a face de baixo clicável', 'sideBottom']]
const ALIGNS: [string, Parameters<State['align']>[0]][] = [['Esquerda', 'left'], ['Centro horizontal', 'hcenter'], ['Direita', 'right'], ['Topo', 'top'], ['Centro vertical', 'vcenter'], ['Base', 'bottom']]
const IMAGES: [string, ExportKind][] = [['PNG…', 'png'], ['JPG…', 'jpg'], ['SVG…', 'svg'], ['PDF…', 'pdf']]
const PRODUCTION: [string, ExportKind][] = [['Gravável (PDF)…', 'etchablePdf'], ['Gravável (SVG)…', 'etchableSvg'], ['Gerber estendido (RS-274X)…', 'gerber'], ['Pick-and-place…', 'pnp']]
const LISTS: [string, ExportKind][] = [['Lista de materiais (HTML)…', 'bomHtml'], ['Lista de materiais (CSV)…', 'bomCsv'], ['Lista de materiais (PDF)…', 'bomPdf'], ['Netlist IPC-D-356A…', 'ipc'], ['Netlist XML…', 'xml'], ['Netlist SPICE…', 'spice']]

// TRILHAS QUE O AUTOROUTER PODE REFAZER, OU AS MARCADAS "NÃO ROTEAR AUTOMATICAMENTE"
const routable = (state: State, free: boolean): MenuEntry => ({
    label: free ? 'Selecionar trilhas autoroteáveis' : 'Selecionar trilhas "não rotear"',
    apply: () => state.selectWhere(instance => instance.moduleIdRef === 'WireModuleID' && isTrace(state, instance.modelIndex) !== 0 && (((instance.views[state.view]?.geometry.wireFlags ?? 0) & AUTOROUTED) !== 0) === free)
})

const promptGrid = (state: State) => {
    const text = window.prompt(t('Tamanho da grade da vista (ex.: 0.1in, 2.5mm)'), state.doc.settings[state.view]?.gridSize ?? state.gridsOf(state.view)[0])

    if (text !== null)
        state.setGridSize(text)
}

// O SELETOR DE COR FICA NO PAINEL DOCUMENTO, QUE ABRE E JÁ MOSTRA A PALETA DO SISTEMA
const pickBackground = (state: State) => {
    state.setPanel('document')
    requestAnimationFrame(() => document.getElementById('view-background')?.click())
}

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
    const item  = ([label, kind]: [string, ExportKind]): MenuEntry => ({ label, disabled: needsBoard(kind) && !board, apply: () => void state.exportFile(kind) })

    return [
        { label: 'Novo', shortcut: shortcutOf(state.keys, 'new'), apply: state.newSketch },
        { label: 'Abrir…', shortcut: shortcutOf(state.keys, 'open'), apply: () => document.getElementById('open-file')?.click() },
        { label: 'Abrir recentes', disabled: !state.recent.length, items: [...state.recent.map((entry): MenuEntry => ({ label: entry.name, apply: () => void state.openRecent(entry.name) })), null, { label: 'Limpar recentes', apply: () => void state.clearRecent() }] },
        { label: 'Exemplos', disabled: !state.samples.length, items: sampleTree(state, state.samples) },
        { label: 'Reverter', disabled: !state.file || state.doc === state.saved, apply: () => void state.revert() },
        null,
        { label: 'Salvar', shortcut: shortcutOf(state.keys, 'save'), apply: () => void state.save() },
        { label: 'Salvar como…', shortcut: shortcutOf(state.keys, 'saveAs'), apply: () => void state.saveAs() },
        { label: 'Salvar uma cópia…', apply: () => void state.saveCopy() },
        ...state.sheets.length > 1 ? [{ label: 'Salvar todos', apply: () => void state.saveAll() }] : [],
        { label: 'Versões salvas automaticamente…', apply: () => void state.showVersions() },
        { label: 'Fechar sketch', apply: () => state.closeSheet(state.sheet) },
        { label: 'Imprimir…', shortcut: shortcutOf(state.keys, 'print'), apply: () => void state.print() },
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
    { label: 'Copiar como texto', shortcut: shortcutOf(state.keys, 'copyText'), disabled: !state.selection.length, apply: state.copyAsText },
    { label: 'Apagar com cliques', checked: state.tool === 'erase', apply: () => state.setTool(state.tool === 'erase' ? 'select' : 'erase') },
    null,
    { label: 'Selecionar tudo', shortcut: shortcutOf(state.keys, 'selectAll'), apply: state.selectAll },
    { label: 'Seleção por laço', checked: state.tool === 'lasso', apply: () => state.setTool(state.tool === 'lasso' ? 'select' : 'lasso') },
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
    const others = VIEWS.filter(view => view !== state.view).map((view): MenuEntry => ({ label: SHOW_IN[view], apply: () => showIn(state, view) }))
    const outdated = state.selection.some(modelIndex => state.library.getPart(state.doc.instances[modelIndex]?.moduleIdRef ?? '')?.replacedBy)
    const always   = [
        { label: 'Localizar peça no sketch…', shortcut: shortcutOf(state.keys, 'find'), apply: () => getKeyAction('find')?.apply(state) },
        { label: 'Selecionar peças travadas', apply: () => state.selectWhere(instance => !!instance.views[state.view]?.locked) },
        { label: 'Selecionar peças desatualizadas', apply: () => state.selectWhere((_, part) => !!part?.replacedBy) },
        { label: 'Atualizar peças selecionadas', disabled: !outdated, apply: () => void state.updateParts() },
        { label: 'Exportar peça…', disabled: !target, apply: () => target && void state.exportPart(state.doc.instances[target]?.moduleIdRef ?? '') }
    ]
    return [...target ? [...parts.slice(0, 3), align, ...parts.slice(3), null, ...others] : [{ label: 'Selecione uma peça', disabled: true }], null, ...always]
}

const viewMenu = (state: State): MenuEntry[] => {
    const settings = state.doc.settings[state.view] ?? {}
    return [
        { label: 'Ampliar', shortcut: shortcutOf(state.keys, 'zoomIn'), apply: () => state.zoom(ZOOM_STEP) },
        { label: 'Reduzir', shortcut: shortcutOf(state.keys, 'zoomOut'), apply: () => state.zoom(1 / ZOOM_STEP) },
        { label: 'Enquadrar', shortcut: shortcutOf(state.keys, 'fit'), apply: () => state.setViewport(state.view, undefined) },
        { label: 'Zoom na seleção', disabled: !state.selection.length, apply: () => zoomToSelection(state) },
        { label: 'Zoom na área arrastada', shortcut: shortcutOf(state.keys, 'zoomArea'), apply: () => state.setTool('zoomArea') },
        { label: 'Desfazer o último zoom', disabled: !state.zooms[state.view]?.back.length, apply: state.undoZoom },
        { label: 'Refazer o último zoom', disabled: !state.zooms[state.view]?.ahead.length, apply: state.redoZoom },
        { label: 'Centralizar na seleção', disabled: !state.selection.length, apply: () => centerOnSelection(state) },
        { label: 'Centralizar no cursor', shortcut: shortcutOf(state.keys, 'centerCursor'), disabled: !useCursor.getState().point, apply: () => centerOnCursor(state) },
        { label: 'Tamanho real', apply: () => state.setZoom(REAL_SIZE) },
        { label: '100%', shortcut: shortcutOf(state.keys, 'actual'), apply: () => state.setZoom(1) },
        null,
        { label: 'Grade', items: [
            ...state.gridsOf(state.view).map((size, i): MenuEntry => ({ label: size, shortcut: i < 2 ? shortcutOf(state.keys, i ? 'fastGrid2' : 'fastGrid1') : undefined, checked: (settings.gridSize ?? state.gridsOf(state.view)[0]) === size, apply: () => state.setViewSetting('gridSize', size) })),
            null,
            { label: 'Próxima grade', shortcut: shortcutOf(state.keys, 'nextGrid'), apply: () => state.cycleGrid(1) },
            { label: 'Grade anterior', shortcut: shortcutOf(state.keys, 'previousGrid'), apply: () => state.cycleGrid(-1) },
            { label: 'Alternar grade rápida', shortcut: shortcutOf(state.keys, 'cycleFastGrid'), apply: state.cycleFastGrid },
            { label: 'Tamanho da grade…', apply: () => promptGrid(state) },
            { label: 'Restaurar a grade padrão', apply: () => state.setGridSize(null) },
            { label: 'Editar grades…', apply: () => state.setDialog('preferences') },
            null,
            { label: 'Colocar a origem da grade', checked: state.tool === 'origin', apply: () => state.setTool('origin') },
            { label: 'Origem da grade no cursor', disabled: !useCursor.getState().point, apply: () => state.setGridOrigin(useCursor.getState().point) },
            { label: 'Restaurar a origem da grade', disabled: !settings.gridOrigin, apply: () => state.setGridOrigin(null) }
        ] },
        { label: 'Unidades', items: [...UNITS.map(([unit, label]): MenuEntry => ({ label, checked: state.preferences.units === unit, apply: () => state.setPreferences({ units: unit }) })), null, { label: 'Alternar unidades', shortcut: shortcutOf(state.keys, 'units'), apply: () => state.setPreferences({ units: state.preferences.units === 'mm' ? 'in' : 'mm' }) }, { label: 'Coordenadas polares', checked: state.preferences.polar, apply: () => state.setPreferences({ polar: !state.preferences.polar }) }] },
        { label: 'Cursor', items: [...CROSSHAIRS.map(([shape, label]): MenuEntry => ({ label, checked: state.preferences.crosshair === shape, apply: () => state.setPreferences({ crosshair: shape }) })), null, { label: 'Sempre mostrar o cursor em cruz', checked: state.preferences.crosshairAlways, apply: () => state.setPreferences({ crosshairAlways: !state.preferences.crosshairAlways }) }] },
        { label: 'Painel da esquerda', checked: !state.leftHidden, apply: state.toggleLeft },
        { label: 'Cor de fundo…', apply: () => pickBackground(state) },
        { label: 'Bin em ícones', checked: !state.preferences.binList, apply: () => state.setPreferences({ binList: false }) },
        { label: 'Bin em lista', checked: state.preferences.binList, apply: () => state.setPreferences({ binList: true }) },
        null,
        { label: 'Alinhar à grade', checked: settings.alignToGrid !== '0', apply: () => state.setViewSetting('alignToGrid', settings.alignToGrid === '0' ? '1' : '0') },
        { label: 'Mostrar grade', checked: settings.showGrid !== '0', apply: () => state.setViewSetting('showGrid', settings.showGrid === '0' ? '1' : '0') },
        { label: 'Fios ortogonais (90°)', checked: state.isOrthogonal(state.view), disabled: state.view === 'pcbView', apply: () => state.setViewSetting('orthogonalWires', settings.orthogonalWires === '0' ? '1' : '0') },
        ...state.view === 'breadboardView' ? [{ label: 'Colorir fios pelo comprimento', checked: state.preferences.lengthColors, apply: () => state.setPreferences({ lengthColors: !state.preferences.lengthColors }) }] : [],
        null,
        ...VIEWS.map((view, i): MenuEntry => ({ label: VIEW_LABELS[view], shortcut: shortcutOf(state.keys, ['breadboard', 'schematic', 'pcb'][i]), checked: view === state.view, apply: () => state.setView(view) })),
        { label: 'Camadas', items: [...LAYER_GROUPS[state.view].map(([id, label]): MenuEntry => ({ label, checked: !state.hiddenLayers[state.view]?.includes(id), apply: () => state.toggleLayer(id) })), null, { label: 'Mostrar todas as camadas', apply: () => state.setHiddenLayers([]) }, { label: 'Ocultar todas as camadas', apply: () => state.setHiddenLayers(LAYER_GROUPS[state.view].map(([id]) => id)) }] },
        null,
        { label: 'Modo da interface', items: LEVELS.map(([level, label]): MenuEntry => ({ label, checked: state.level === level, apply: () => state.setLevel(level) })) },
        { label: 'Idioma', items: LANGUAGES.map(([language, label]): MenuEntry => ({ label, checked: state.language === language, apply: () => void state.setLanguage(language) })) },
        { label: state.theme === 'dark' ? 'Tema claro' : 'Tema escuro', apply: state.toggleTheme }
    ]
}

const routingMenu = (state: State): MenuEntry[] => {
    const wires  = { label: state.view === 'breadboardView' ? 'Selecionar todos os fios' : 'Selecionar todas as trilhas', apply: () => state.selectWhere(instance => instance.moduleIdRef === 'WireModuleID' && (state.view === 'breadboardView' || isTrace(state, instance.modelIndex) !== 0)) }
    const traces = state.selection.filter(modelIndex => state.doc.instances[modelIndex]?.moduleIdRef === 'WireModuleID' && isTrace(state, modelIndex))
    const fixed  = traces.length > 0 && traces.every(modelIndex => ((state.doc.instances[modelIndex]?.views[state.view]?.geometry.wireFlags ?? 0) & AUTOROUTED) === 0)
    const busy   = state.routing !== null
    const shown  = { label: 'Mostrar não roteadas', apply: state.showUnrouted }

    if (state.view === 'schematicView')
        return [{ label: 'Autorotear', shortcut: shortcutOf(state.keys, 'autoroute'), disabled: busy, apply: () => void state.autoroute() }, { label: 'Não rotear automaticamente', checked: fixed, disabled: !traces.length, apply: () => state.edit(doc => traces.reduce((current, modelIndex) => setAutoroutable(current, state.library, state.view, modelIndex, fixed), doc)) }, null, wires, routable(state, true), routable(state, false), shown, { label: 'Apagar fios autoroteados', disabled: busy, apply: state.clearAutorouted }]

    if (state.view !== 'pcbView')
        return [wires, shown]

    return [
        { label: 'Autorotear', shortcut: shortcutOf(state.keys, 'autoroute'), disabled: busy, apply: () => void state.autoroute() },
        { label: 'Verificar regras (DRC)', shortcut: shortcutOf(state.keys, 'drc'), disabled: busy, apply: () => void state.checkRules() },
        { label: 'Regras do autorouter e DRC…', apply: () => state.setPanel('routing') },
        { label: 'Preenchimento de cobre', disabled: busy, items: [
            { label: 'Preencher com terra', apply: () => void state.fillCopper('ground') },
            { label: 'Preencher com cobre', apply: () => void state.fillCopper('plain') },
            { label: 'Remover preenchimento', apply: state.removeFills },
            null,
            { label: 'Escolher sementes…', apply: () => state.setDialog('seeds') },
            { label: 'Limpar sementes de terra', apply: () => state.edit(clearGroundFillSeeds) }
        ] },
        null,
        { label: 'Mover trilha para a outra face', disabled: !traces.length, apply: () => state.edit(doc => traces.reduce(setTraceSide, doc)) },
        { label: 'Não rotear automaticamente', checked: fixed, disabled: !traces.length, apply: () => state.edit(doc => traces.reduce((current, modelIndex) => setAutoroutable(current, state.library, state.view, modelIndex, fixed), doc)) },
        null,
        wires,
        routable(state, true),
        routable(state, false),
        { label: 'Selecionar todos os jumpers', apply: () => state.selectWhere((_, part) => part?.kind === 'jumper') },
        { label: 'Selecionar todas as vias', apply: () => state.selectWhere((_, part) => part?.kind === 'via') },
        { label: 'Selecionar todos os preenchimentos', apply: () => state.selectWhere((_, part) => part?.kind === 'copperFill') },
        shown,
        null,
        { label: 'Ver de baixo', checked: state.fromBelow, apply: () => state.setFromBelow(!state.fromBelow) },
        ...FACES.map(([side, label, id]): MenuEntry => ({ label, shortcut: shortcutOf(state.keys, id), checked: state.side === side, apply: () => state.setSide(side) })),
        null,
        { label: 'Apagar trilhas autoroteadas', disabled: busy, apply: state.clearAutorouted }
    ]
}

const PROBE_ITEMS: [string, ProbeKind][] = [['Ponta de tensão', 'voltage'], ['Ponta de corrente', 'current'], ['Ponta de tensão e corrente', 'both']]

const simulationMenu = (state: State): MenuEntry[] => [
    { label: state.simulation.enabled ? 'Parar a simulação' : 'Simular', apply: state.toggleSimulation },
    { label: 'Painel de simulação', checked: state.show.chart, apply: () => state.setShow({ chart: !state.show.chart }) },
    null,
    ...PROBE_ITEMS.map(([label, kind]): MenuEntry => ({ label, checked: state.tool === kind, disabled: state.view === 'pcbView', apply: () => state.setTool(kind) })),
    { label: 'Remover todas as pontas de prova', disabled: !state.doc.probes.length, apply: () => state.removeProbes(state.doc.probes.map(probe => probe.id)) },
    null,
    { label: 'Circuitos de teste', items: BENCHES.map(bench => ({ label: bench.title, apply: () => void state.openBench(bench.id) })) }
]

const helpMenu = (state: State): MenuEntry[] => [
    { label: 'Paleta de comandos', shortcut: shortcutOf(state.keys, 'palette'), apply: () => useStore.setState({ dialog: 'palette' }) },
    { label: 'Atalhos de teclado', apply: () => useStore.setState({ dialog: 'shortcuts' }) },
    { label: 'Guia de uso', apply: () => useStore.setState({ dialog: 'guide' }) },
    { label: 'Tour da interface', apply: () => state.showTour(state.level) },
    { label: 'Boas-vindas', apply: () => useStore.setState({ welcome: true }) },
    { label: 'Sobre o CircuitMaster', apply: () => useStore.setState({ dialog: 'about' }) }
]

const MENUS: [string, (state: State) => MenuEntry[]][] = [['Arquivo', fileMenu], ['Editar', editMenu], ['Peça', partMenu], ['Exibir', viewMenu], ['Roteamento', routingMenu], ['Simulação', simulationMenu], ['Ajuda', helpMenu]]

export type Command = { path: string[], entry: NonNullable<MenuEntry> }

// TODO ITEM DOS MENUS COM O CAMINHO ATÉ ELE, MAIS OS PAINÉIS DO TRILHO, PARA A PALETA DE COMANDOS
export const getCommands = (state: State): Command[] => {
    const walk   = (entries: MenuEntry[], path: string[]): Command[] => entries.flatMap(entry => !entry ? [] : entry.items ? walk(entry.items, [...path, entry.label]) : [{ path, entry }])
    const panels = ([['parts', 'Peças'], ['ready', 'Prontos'], ['project', 'Projeto'], ['problems', 'Problemas']] as const).map(([id, label]): Command => ({ path: ['Painéis'], entry: { label, apply: () => state.setLeft(id) } }))
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
        <nav ref={ref} className="menubar" aria-label={t('Menu principal')}>
            {MENUS.map(([title, build], i) => (
                <div key={title} className={`menu ${open === i ? 'open' : ''}`}>
                    <button aria-haspopup="true" aria-expanded={open === i} disabled={!ready} onClick={() => setOpen(open === i ? null : i)} onMouseEnter={() => open !== null && setOpen(i)}>{t(title)}</button>
                    {open === i && <div className="absolute left-0 top-8 z-[60]"><MenuList items={build(useStore.getState())} close={() => setOpen(null)} left={false} /></div>}
                </div>
            ))}
        </nav>
    )
}
