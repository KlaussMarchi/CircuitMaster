import { useEffect, type ChangeEvent } from 'react'
import { useStore } from '../Store'
import { Topbar } from '../Topbar'
import { Rail, toggleSheet } from '../Rail'
import { LeftPanel } from '../LeftPanel'
import { Stage } from '../Stage'
import { SimulationPanel } from '../SimulationPanel'
import { SidePanel } from '../SidePanel'
import { StatusBar } from '../StatusBar'
import { Dialog } from '../Dialog'
import { PartEditor } from '../PartEditor'
import { Boundary } from '../Boundary'

type State = ReturnType<typeof useStore.getState>

const ZOOM_KEY = 1.25     // FATOR DE Ctrl++ / Ctrl+-

const nudge = (state: State, dx: number, dy: number) => {
    const step = state.doc.settings[state.view]?.alignToGrid === '0' ? 1 : state.getGrid()
    state.nudge(dx * step, dy * step)
}

// ATALHOS DO FRITZING (SPEC 02 §10.3); SÍMBOLOS JÁ TRAZEM O SHIFT NA PRÓPRIA TECLA (} = Shift+])
const SHORTCUTS: Record<string, (state: State) => void> = {
    'ctrl+n': state => state.newSketch(),
    'ctrl+shift+a': state => void state.autoroute(),
    'ctrl+shift+d': state => void state.checkRules(),
    'ctrl+s': state => void state.save(),
    'ctrl+o': () => document.getElementById('open-file')?.click(),
    'ctrl+z': state => state.undo(),
    'ctrl+shift+z': state => state.redo(),
    'ctrl+y': state => state.redo(),
    'ctrl+x': state => state.cut(),
    'ctrl+c': state => state.copy(),
    'ctrl+v': state => void state.paste(false),
    'ctrl+shift+v': state => void state.paste(true),
    'ctrl+d': state => void state.duplicate(),
    'ctrl+a': state => state.selectAll(),
    'delete': state => state.remove(false),
    'backspace': state => state.remove(false),
    'alt+backspace': state => state.remove(true),
    ']': state => state.rotate(90),
    '[': state => state.rotate(-90),
    '|': state => state.view === 'schematicView' && state.flip(true),
    'ctrl+}': state => state.zOrder('front'),
    'ctrl+]': state => state.zOrder('forward'),
    'ctrl+[': state => state.zOrder('backward'),
    'ctrl+{': state => state.zOrder('back'),
    'arrowup': state => nudge(state, 0, -1),
    'arrowdown': state => nudge(state, 0, 1),
    'arrowleft': state => nudge(state, -1, 0),
    'arrowright': state => nudge(state, 1, 0),
    'shift+arrowup': state => nudge(state, 0, -10),
    'shift+arrowdown': state => nudge(state, 0, 10),
    'shift+arrowleft': state => nudge(state, -10, 0),
    'shift+arrowright': state => nudge(state, 10, 0),
    'ctrl+0': state => state.setViewport(state.view, undefined),
    'ctrl+)': state => state.setZoom(1),
    'ctrl+=': state => state.zoom(ZOOM_KEY),
    'ctrl++': state => state.zoom(ZOOM_KEY),
    'ctrl+-': state => state.zoom(1 / ZOOM_KEY),
    'escape': state => state.dialog ? useStore.setState({ dialog: null }) : state.tool !== 'select' ? state.setTool('select') : state.select([]),
    'ctrl+1': state => state.setView('breadboardView'),
    'ctrl+2': state => state.setView('schematicView'),
    'ctrl+3': state => state.setView('pcbView'),
    'v': state => state.setTool('area'),
    'h': state => state.setTool('select'),
    '1': state => state.setView('breadboardView'),
    '2': state => state.setView('schematicView'),
    '3': state => state.setView('pcbView')
}

const onKey = (event: KeyboardEvent) => {
    const key    = event.key.toLowerCase()
    const shift  = event.shiftKey && (key.length > 1 || /[a-z]/.test(key)) ? 'shift+' : ''
    const name   = `${event.ctrlKey || event.metaKey ? 'ctrl+' : ''}${event.altKey ? 'alt+' : ''}${shift}${key}`
    const action = SHORTCUTS[name]

    if (!action || useStore.getState().editing || (event.target as HTMLElement).closest('input, select, textarea, [contenteditable="true"]'))
        return

    event.preventDefault()
    action(useStore.getState())
}

// ABA ESCONDIDA OU FECHANDO GRAVA JÁ O SALVAMENTO AUTOMÁTICO AGENDADO
const onHide = () => document.visibilityState === 'hidden' && void useStore.getState().autosave.flush()

const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (file)
        await useStore.getState().open(file.name, new Uint8Array(await file.arrayBuffer()))
}

// JANELA DO EDITOR: BARRA SUPERIOR, TRILHO, PAINEL ESQUERDO, PALCO COM A DOCA DE SIMULAÇÃO, INSPETOR E BARRA DE STATUS (DESIGN.md §6)
export const App = () => {
    useEffect(() => {
        useStore.getState().setup().catch(error => useStore.setState({ message: `falha ao iniciar: ${error}` }))
        window.addEventListener('keydown', onKey)
        document.addEventListener('visibilitychange', onHide)
        window.addEventListener('pagehide', onHide)
        return () => {
            window.removeEventListener('keydown', onKey)
            document.removeEventListener('visibilitychange', onHide)
            window.removeEventListener('pagehide', onHide)
        }
    }, [])

    return (
        <div className="app">
            <Boundary name="Barra superior" className="topbar"><Topbar /></Boundary>
            <div className="shell">
                <Boundary name="Trilho" className="rail"><Rail /></Boundary>
                <Boundary name="Painel lateral" className="left card"><LeftPanel /></Boundary>
                <main className="center">
                    <Boundary name="Quadro" className="stage card"><Stage /></Boundary>
                    <Boundary name="Simulação" className="dock card"><SimulationPanel /></Boundary>
                </main>
                <Boundary name="Inspetor" className="inspector card"><SidePanel /></Boundary>
                <button className="sheet-scrim" aria-label="Fechar painel" onClick={() => toggleSheet(null)} />
            </div>
            <Boundary name="Barra de status" className="status"><StatusBar /></Boundary>
            <input id="open-file" type="file" accept=".fzz,.fz,.fzpz,.fzbz,.fzb" hidden onChange={onFile} />
            <Boundary name="Diálogo" className="modal" close={() => useStore.setState({ dialog: null })}><Dialog /></Boundary>
            <Boundary name="Editor de peças" className="modal" close={() => useStore.getState().editPart(null)}><PartEditor /></Boundary>
        </div>
    )
}
