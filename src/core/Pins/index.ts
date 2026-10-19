import type { Part } from '../Part'
import type { Leg, SvgFile } from '../SvgFile'
import type { ViewName } from '../Layer'
import type { Box, Point } from '../Geometry'

export type PinGeometry = { rect: Box, terminal: Point, leg: Leg | null, hybrid: boolean }

const EPSILON     = 0.001
const SQUARE_LOW  = 0.9
const SQUARE_HIGH = 1.1

const centerOf = ([x0, y0, x1, y1]: Box): Point => [(x0 + x1) / 2, (y0 + y1) / 2]

// EXTREMIDADE AUTOMÁTICA DO PINO ESQUEMÁTICO SEM TERMINALID (SPEC 01 §3.6, REGRA 3)
const autoTerminal = (rect: Box, svg: SvgFile): Point => {
    const [x0, y0, x1, y1] = rect
    const [w, h]   = [x1 - x0, y1 - y0]
    const [cx, cy] = centerOf(rect)

    if (Math.abs(w) < EPSILON && Math.abs(h) < EPSILON)
        return [cx, cy]

    if (Math.abs(h) >= EPSILON && w / h >= SQUARE_LOW && w / h <= SQUARE_HIGH)
        return [cx, cy]

    if (w > h)
        return cx < Math.round(svg.width) / 2 ? [x0, cy] : [x1, cy]

    return cy < Math.round(svg.height) / 2 ? [cx, y0] : [cx, y1]
}

export const getPins = (part: Part, svg: SvgFile, view: ViewName, layer: string) => {
    const pins  = new Map<string, PinGeometry>()
    const scope = view !== 'schematicView' && (part.views[view]?.layers.length ?? 0) > 1 ? layer : null

    for (const connector of part.connectors) {
        const pin = connector.views[view]?.find(candidate => candidate.layer === layer)

        if (!pin)
            continue

        const box = svg.getBox(pin.svgId, scope)

        if (!box && !pin.hybrid)
            continue

        const rect        = box ?? [0, 0, 0, 0] as Box
        const terminalBox = pin.terminalId && !part.ignoreTerminalPoints ? svg.getBox(pin.terminalId, scope) : null
        const terminal    = view === 'schematicView' && !pin.terminalId ? autoTerminal(rect, svg) : centerOf(terminalBox ?? rect)
        const leg         = pin.legId && view === 'breadboardView' ? svg.getLeg(pin.legId, scope) : null
        pins.set(connector.id, { rect, terminal, leg, hybrid: pin.hybrid })
    }

    return pins
}
