import { useEffect } from 'react'
import { useStore } from '../Store'
import { Toolbar } from '../Toolbar'
import { PartsBin } from '../PartsBin'
import { Canvas } from '../Canvas'
import { Inspector } from '../Inspector'
import { StatusBar } from '../StatusBar'
import { SimulationPanel } from '../SimulationPanel'

type State = ReturnType<typeof useStore.getState>

const ZOOM_KEY = 1.25     // FATOR DE Ctrl++ / Ctrl+-

const zoomBy = (state: State, factor: number) => {
    const viewport = state.viewports[state.view]
    const [w, h]   = state.size

    if (!viewport)
        return

    const zoom = viewport.zoom * factor
    state.setViewport(state.view, { x: viewport.x + w / 2 / viewport.zoom - w / 2 / zoom, y: viewport.y + h / 2 / viewport.zoom - h / 2 / zoom, zoom })
}

const nudge = (state: State, dx: number, dy: number) => {
    const step = state.doc.settings[state.view]?.alignToGrid === '0' ? 1 : state.getGrid()
    state.nudge(dx * step, dy * step)
}

// ATALHOS DO FRITZING (SPEC 02 §10.3); SÍMBOLOS JÁ TRAZEM O SHIFT NA PRÓPRIA TECLA (} = Shift+])
const SHORTCUTS: Record<string, (state: State) => void> = {
    'ctrl+s': state => state.save(),
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
    'ctrl+=': state => zoomBy(state, ZOOM_KEY),
    'ctrl++': state => zoomBy(state, ZOOM_KEY),
    'ctrl+-': state => zoomBy(state, 1 / ZOOM_KEY),
    'escape': state => state.select([]),
    'ctrl+1': state => state.setView('breadboardView'),
    'ctrl+2': state => state.setView('schematicView'),
    'ctrl+3': state => state.setView('pcbView'),
    '1': state => state.setView('breadboardView'),
    '2': state => state.setView('schematicView'),
    '3': state => state.setView('pcbView')
}

const onKey = (event: KeyboardEvent) => {
    const key    = event.key.toLowerCase()
    const shift  = event.shiftKey && (key.length > 1 || /[a-z]/.test(key)) ? 'shift+' : ''
    const name   = `${event.ctrlKey || event.metaKey ? 'ctrl+' : ''}${event.altKey ? 'alt+' : ''}${shift}${key}`
    const action = SHORTCUTS[name]

    if (!action || (event.target as HTMLElement).closest('input, select, textarea, [contenteditable="true"]'))
        return

    event.preventDefault()
    action(useStore.getState())
}

export const App = () => {
    const simulating = useStore(state => state.simulation.enabled)

    useEffect(() => {
        useStore.getState().setup().catch(error => useStore.setState({ message: `falha ao iniciar: ${error}` }))
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    return (
        <div className="flex h-full flex-col bg-neutral-100 text-sm text-neutral-800">
            <Toolbar />
            <div className="flex min-h-0 flex-1">
                <PartsBin />
                <div className="flex min-w-0 flex-1 flex-col">
                    <main className="relative min-h-0 flex-1 overflow-hidden">
                        <Canvas />
                    </main>
                    {simulating && <SimulationPanel />}
                </div>
                <Inspector />
            </div>
            <StatusBar />
        </div>
    )
}
