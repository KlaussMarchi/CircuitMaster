import { create } from 'zustand'
import type { Box, Point } from '../../core/Geometry'
import { PX_PER_INCH, MIL_PER_INCH } from '../../core/Units'
import { t } from '../../core/Text'
import { Scene } from '../../engine/Scene'
import type { useStore, View, Viewport } from '../Store'

type State = ReturnType<typeof useStore.getState>

export type Unit      = 'mm' | 'in' | 'mil'
export type Crosshair = 'small' | 'full' | 'diagonal'

export const UNITS: [Unit, string][] = [['in', 'Polegadas'], ['mm', 'Milímetros'], ['mil', 'Mils']]
export const CROSSHAIRS: [Crosshair, string][] = [['small', 'Pequeno'], ['full', 'Na janela toda'], ['diagonal', 'A 45°']]

const PER_INCH: Record<Unit, number> = { mm: 25.4, in: 1, mil: MIL_PER_INCH }
const DECIMALS: Record<Unit, number> = { mm: 2, in: 4, mil: 0 }
const ZOOM_MIN   = 0.05
const ZOOM_MAX   = 64
const FIT_MARGIN = 0.9
const FAST       = 10      // PASSOS DE GRADE DO CURSOR COM Ctrl (CURSOR RÁPIDO DO KICAD)
const PAN        = 0.25    // FRAÇÃO DA JANELA QUE Shift+SETA MOVE A VISTA
const EDGE       = 24      // PX DA BORDA EM QUE O CURSOR DO TECLADO EMPURRA A VISTA

// CURSOR DO QUADRO NA CENA (NA GRADE), A ORIGEM DAS COORDENADAS RELATIVAS E SE É O TECLADO QUE O MOVE; FORA DO STORE PRINCIPAL PORQUE MUDA A CADA MOVIMENTO DO MOUSE
export const useCursor = create<{ point: Point | null, origin: Point | null, keyboard: boolean }>(() => ({ point: null, origin: null, keyboard: false }))

export const clampZoom = (zoom: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))

// ENQUADRAMENTO QUE MOSTRA A CAIXA INTEIRA COM FOLGA; SEM CAIXA, A ORIGEM NO CENTRO
export const fit = (bounds: Box | null, [w, h]: Point): Viewport => {
    if (!bounds)
        return { x: -w / 2, y: -h / 2, zoom: 1 }

    const zoom = clampZoom(Math.min(w / Math.max(1, bounds[2] - bounds[0]), h / Math.max(1, bounds[3] - bounds[1])) * FIT_MARGIN)
    return { x: (bounds[0] + bounds[2]) / 2 - w / zoom / 2, y: (bounds[1] + bounds[3]) / 2 - h / zoom / 2, zoom }
}

export const formatLength = (px: number, unit: Unit) => (px / PX_PER_INCH * PER_INCH[unit]).toFixed(DECIMALS[unit])

export const lengthToPx = (value: number, unit: Unit) => value / PER_INCH[unit] * PX_PER_INCH

// COORDENADAS DA BARRA DE STATUS: X E Y PELA ORIGEM DA GRADE E, COM ORIGEM LOCAL, dX E dY (OU r E θ NAS POLARES)
export const formatCursor = (point: Point, grid: Point, origin: Point | null, unit: Unit, polar: boolean) => {
    const [x, y]   = [point[0] - grid[0], point[1] - grid[1]]
    const [dx, dy] = origin ? [point[0] - origin[0], point[1] - origin[1]] : [0, 0]
    const relative = !origin ? '' : polar ? `  r ${formatLength(Math.hypot(dx, dy), unit)}  θ ${(Math.atan2(-dy, dx) * 180 / Math.PI).toFixed(1)}°` : `  dX ${formatLength(dx, unit)}  dY ${formatLength(dy, unit)}`
    return `X ${formatLength(x, unit)}  Y ${formatLength(y, unit)}${relative} ${unit}`
}

const getCanvas = () => document.getElementById('canvas')?.parentElement?.getBoundingClientRect() ?? null

// PONTO DA CENA NA TELA, PELO ENQUADRAMENTO DA VISTA CORRENTE
export const clientOf = (state: State, [x, y]: Point): Point | null => {
    const rect = getCanvas()
    const vp   = state.viewports[state.view]
    const sx   = vp ? (x - vp.x) * vp.zoom : 0
    return rect && vp ? [state.fromBelow && state.view === 'pcbView' ? rect.right - sx : rect.left + sx, rect.top + (y - vp.y) * vp.zoom] : null
}

const centerOf = (state: State): Point | null => {
    const vp = state.viewports[state.view]
    return vp ? [vp.x + state.size[0] / 2 / vp.zoom, vp.y + state.size[1] / 2 / vp.zoom] : null
}

// VISTA COM O PONTO NO CENTRO, NO MESMO ZOOM
export const centerAt = (state: State, [x, y]: Point, view = state.view) => {
    const vp = state.viewports[view]

    if (vp)
        state.setViewport(view, { ...vp, x: x - state.size[0] / 2 / vp.zoom, y: y - state.size[1] / 2 / vp.zoom })
}

// CURSOR DO TECLADO: ANDA dx, dy PASSOS DE GRADE (Ctrl: RÁPIDO) A PARTIR DO CURSOR OU DO CENTRO; PERTO DA BORDA A VISTA ACOMPANHA
export const moveCursor = (state: State, dx: number, dy: number) => {
    const { view, size } = state
    const grid  = state.gridOf(view, 'parts')
    const start = useCursor.getState().point ?? centerOf(state)
    const vp    = state.viewports[view]

    if (!start || !vp)
        return

    const point: Point = [start[0] + dx * grid, start[1] + dy * grid]
    const [sx, sy]     = [(point[0] - vp.x) * vp.zoom, (point[1] - vp.y) * vp.zoom]
    useCursor.setState({ point, keyboard: true })

    if (sx < EDGE || sy < EDGE || sx > size[0] - EDGE || sy > size[1] - EDGE)
        state.setViewport(view, { ...vp, x: vp.x + Math.min(0, sx - EDGE) / vp.zoom + Math.max(0, sx - size[0] + EDGE) / vp.zoom, y: vp.y + Math.min(0, sy - EDGE) / vp.zoom + Math.max(0, sy - size[1] + EDGE) / vp.zoom })
}

export const moveCursorFast = (state: State, dx: number, dy: number) => moveCursor(state, dx * FAST, dy * FAST)

// Shift+SETA SEM SELEÇÃO: A VISTA ANDA UM QUARTO DA JANELA
export const panBy = (state: State, dx: number, dy: number) => {
    const vp = state.viewports[state.view]

    if (vp)
        state.setViewport(state.view, { ...vp, x: vp.x + dx * PAN * state.size[0] / vp.zoom, y: vp.y + dy * PAN * state.size[1] / vp.zoom })
}

export const centerOnCursor = (state: State) => {
    const point = useCursor.getState().point

    if (point)
        centerAt(state, point)
}

const selectionBox = ({ doc, library, selection }: State, view: View): Box | null => {
    const scene = new Scene(doc, library, view)
    const boxes = selection.map(modelIndex => scene.getBounds(modelIndex)).filter((box): box is Box => box !== null)
    return boxes.length ? [Math.min(...boxes.map(box => box[0])), Math.min(...boxes.map(box => box[1])), Math.max(...boxes.map(box => box[2])), Math.max(...boxes.map(box => box[3]))] : null
}

export const centerOnSelection = (state: State) => {
    const box = selectionBox(state, state.view)

    if (!box)
        return state.setMessage(t('selecione algo para centralizar'))

    centerAt(state, [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2])
}

export const zoomToSelection = (state: State) => {
    const box = selectionBox(state, state.view)

    if (!box)
        return state.setMessage(t('selecione algo para enquadrar'))

    state.setViewport(state.view, fit(box, state.size))
}

// Espaço: AS COORDENADAS RELATIVAS DA BARRA DE STATUS PASSAM A CONTAR DO CURSOR
export const resetOrigin = () => useCursor.setState(cursor => ({ origin: cursor.point }))

// Enter E End NO CURSOR DO TECLADO: O QUADRO RECEBE O CLIQUE (OU O DUPLO CLIQUE) COMO SE FOSSE DO MOUSE
export const clickAtCursor = (state: State, double: boolean) => {
    const point  = useCursor.getState().point
    const client = point ? clientOf(state, point) : null
    const target = client ? document.elementFromPoint(...client) : null

    if (!client || !target?.closest('#canvas'))
        return

    const init = { bubbles: true, cancelable: true, clientX: client[0], clientY: client[1], button: 0, buttons: 1, pointerId: 1, isPrimary: true }
    target.dispatchEvent(new PointerEvent('pointerdown', init))
    target.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }))

    if (double)
        target.dispatchEvent(new MouseEvent('dblclick', init))
}

// VER A SELEÇÃO EM OUTRA VISTA (SELEÇÃO CRUZADA DO KICAD): A MESMA SELEÇÃO, CENTRALIZADA NA VISTA ESCOLHIDA; NA VISTA AINDA NÃO ABERTA, O QUADRO ENQUADRA TUDO
export const showIn = (state: State, view: View) => {
    const box = selectionBox(state, view)
    state.setView(view)

    if (box)
        centerAt(state, [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2], view)
}
