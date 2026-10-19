import { useEffect, useRef, useState } from 'react'
import { WIRE_FLAGS } from '../../core/Document'
import { VIEWS, VIEW_LABELS } from '../../core/Layer'
import { Scene } from '../../engine/Scene'
import { MenuList, type MenuEntry } from '../ContextMenu'
import { getMenu } from '../Menus'
import { BOARD_EXPORTS, type ExportKind } from '../Export'
import { useStore } from '../Store'

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
        { label: 'Novo', shortcut: 'Ctrl+N', apply: state.newSketch },
        { label: 'Abrir…', shortcut: 'Ctrl+O', apply: () => document.getElementById('open-file')?.click() },
        { label: 'Exemplos', disabled: !state.samples.length, items: sampleTree(state, state.samples) },
        null,
        { label: 'Salvar', shortcut: 'Ctrl+S', apply: state.save },
        { label: 'Exportar', items: [{ label: 'Como imagem', items: IMAGES.map(item) }, { label: 'Para produção', items: PRODUCTION.map(item) }, null, ...LISTS.map(item)] }
    ]
}

const editMenu = (state: State): MenuEntry[] => [
    { label: 'Desfazer', shortcut: 'Ctrl+Z', disabled: !state.past.length, apply: state.undo },
    { label: 'Refazer', shortcut: 'Ctrl+Shift+Z', disabled: !state.future.length, apply: state.redo },
    null,
    { label: 'Recortar', shortcut: 'Ctrl+X', disabled: !state.selection.length, apply: state.cut },
    { label: 'Copiar', shortcut: 'Ctrl+C', disabled: !state.selection.length, apply: state.copy },
    { label: 'Colar', shortcut: 'Ctrl+V', disabled: !state.clipboard, apply: () => void state.paste(false) },
    { label: 'Colar no lugar', shortcut: 'Ctrl+Shift+V', disabled: !state.clipboard, apply: () => void state.paste(true) },
    { label: 'Duplicar', shortcut: 'Ctrl+D', disabled: !state.selection.length, apply: () => void state.duplicate() },
    { label: 'Apagar', shortcut: 'Delete', disabled: !state.selection.length, apply: () => state.remove(false) },
    { label: 'Apagar sem fios', shortcut: 'Alt+Backspace', disabled: !state.selection.length, apply: () => state.remove(true) },
    null,
    { label: 'Selecionar tudo', shortcut: 'Ctrl+A', apply: state.selectAll },
    { label: 'Desmarcar', shortcut: 'Esc', disabled: !state.selection.length, apply: () => state.select([]) },
    null,
    { label: 'Adicionar nota', apply: () => void state.addNote() }
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
        { label: 'Ampliar', shortcut: 'Ctrl++', apply: () => state.zoom(ZOOM_STEP) },
        { label: 'Reduzir', shortcut: 'Ctrl+-', apply: () => state.zoom(1 / ZOOM_STEP) },
        { label: 'Enquadrar', shortcut: 'Ctrl+0', apply: () => state.setViewport(state.view, undefined) },
        { label: 'Tamanho real', apply: () => state.setZoom(REAL_SIZE) },
        { label: '100%', shortcut: 'Ctrl+Shift+0', apply: () => state.setZoom(1) },
        null,
        { label: 'Alinhar à grade', checked: settings.alignToGrid !== '0', apply: () => state.setViewSetting('alignToGrid', settings.alignToGrid === '0' ? '1' : '0') },
        { label: 'Mostrar grade', checked: settings.showGrid !== '0', apply: () => state.setViewSetting('showGrid', settings.showGrid === '0' ? '1' : '0') },
        null,
        ...VIEWS.map((view, i): MenuEntry => ({ label: VIEW_LABELS[view], shortcut: `Ctrl+${i + 1}`, checked: view === state.view, apply: () => state.setView(view) }))
    ]
}

const routingMenu = (state: State): MenuEntry[] => {
    const wires = { label: state.view === 'breadboardView' ? 'Selecionar todos os fios' : 'Selecionar todas as trilhas', apply: () => state.selectWhere(instance => instance.moduleIdRef === 'WireModuleID' && (state.view === 'breadboardView' || isTrace(state, instance.modelIndex) !== 0)) }

    if (state.view !== 'pcbView')
        return [wires]

    return [
        wires,
        { label: 'Selecionar trilhas autoroteáveis', apply: () => state.selectWhere(instance => instance.moduleIdRef === 'WireModuleID' && ((instance.views.pcbView?.geometry.wireFlags ?? 0) & AUTOROUTED) !== 0) },
        { label: 'Selecionar todas as vias', apply: () => state.selectWhere((_, part) => part?.kind === 'via') },
        { label: 'Selecionar todos os preenchimentos', apply: () => state.selectWhere((_, part) => part?.kind === 'copperFill') }
    ]
}

const helpMenu = (): MenuEntry[] => [
    { label: 'Atalhos de teclado', apply: () => useStore.setState({ dialog: 'shortcuts' }) },
    { label: 'Sobre o CircuitMaster', apply: () => useStore.setState({ dialog: 'about' }) }
]

const MENUS: [string, (state: State) => MenuEntry[]][] = [['Arquivo', fileMenu], ['Editar', editMenu], ['Peça', partMenu], ['Exibir', viewMenu], ['Roteamento', routingMenu], ['Ajuda', helpMenu]]

// BARRA DE MENUS DA JANELA: CLIQUE ABRE, PASSAR POR OUTRO TÍTULO TROCA, CLIQUE FORA OU ESC FECHA (SPEC 02 §10.4)
export const MenuBar = () => {
    const ref             = useRef<HTMLDivElement>(null)
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
        <div ref={ref} className="relative flex h-7 shrink-0 items-center border-b border-neutral-200 bg-neutral-50 px-1 text-[13px]">
            {MENUS.map(([title, build], i) => (
                <div key={title} className="relative">
                    <button className={`rounded px-2 py-0.5 ${open === i ? 'bg-blue-600 text-white' : 'hover:bg-neutral-200'} disabled:opacity-40`} disabled={!ready} onClick={() => setOpen(open === i ? null : i)} onMouseEnter={() => open !== null && setOpen(i)}>{title}</button>
                    {open === i && <div className="absolute left-0 top-full z-50 mt-0.5"><MenuList items={build(useStore.getState())} close={() => setOpen(null)} left={false} /></div>}
                </div>
            ))}
        </div>
    )
}
