import type { PartItem } from '../../engine/Drawing'
import type { Effect } from '../../engine/Simulation'
import { milsToPx } from '../../core/Units'

type Shown = 'breadboardView' | 'schematicView'

const SMOKE        = { width: 24, height: 20 }    // PX DO DESENHO DE FUMAÇA SEM ESCALA
const PUFFS        = [[6, 14, 6], [12, 9, 7], [19, 13, 5], [10, 4, 4], [17, 5, 4]]
const GLOW_MIN     = 0.25                         // ABAIXO DISSO O LED NÃO ESPALHA LUZ (SPEC 04 §8.3)
const GLOW_GAIN    = 4
const DIGIT_ASPECT = 0.62                         // LARGURA DO DÍGITO EM UNIDADES DA FONTE
const SCOPE_STROKE = milsToPx(20)
const LEGEND_PX    = milsToPx(60)
const DISPLAYS     = { breadboardView: { width: 0.8, top: 0.07, font: 'DSEG7 Classic, Consolas, monospace' }, schematicView: { width: 0.5, top: 0.13, font: 'Noto Sans, sans-serif' } }

export const Glow = ({ item, effect }: { item: PartItem, effect: Effect }) => {
    const level = Math.min(1, effect.light)

    if (!effect.color || level < GLOW_MIN)
        return null

    const radius = Math.min(item.width, item.height) / 2 * level * GLOW_GAIN
    const id     = `glow-${item.modelIndex}`
    return (
        <g transform={`matrix(${item.matrix.join(' ')})`} pointerEvents="none">
            <defs>
                <radialGradient id={id}>
                    <stop offset="0" stopColor={effect.color} stopOpacity={1} />
                    <stop offset="0.3" stopColor={effect.color} stopOpacity={0.9} />
                    <stop offset="1" stopColor={effect.color} stopOpacity={0} />
                </radialGradient>
            </defs>
            <circle cx={item.width / 2} cy={item.width / 2} r={radius} fill={`url(#${id})`} />
        </g>
    )
}

const Smoke = ({ item }: { item: PartItem }) => {
    const scale  = Math.max(1, Math.min(item.width / SMOKE.width, item.height / SMOKE.height))
    const [x, y] = [item.width / 2 - SMOKE.width * scale, item.height / 2 - SMOKE.height * scale]
    return (
        <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={0.7}>
            {PUFFS.map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} fill={i % 2 ? '#6b6b6b' : '#8a8a8a'} />)}
        </g>
    )
}

const Display = ({ item, lines, view, lab }: { item: PartItem, lines: string[], view: Shown, lab: boolean }) => {
    const style = DISPLAYS[view]
    const width = item.width * (lab ? 0.72 : style.width)
    const size  = width / 5 / DIGIT_ASPECT
    const top   = item.height * (lab ? 0.075 : style.top)
    return (
        <g fill={lab ? 'rgb(200,48,48)' : 'rgb(48,48,48)'} fontFamily={style.font} fontSize={size} style={{ whiteSpace: 'pre' }}>
            {lines.map((line, i) => <text key={i} x={(item.width - width) / 2} y={top + size * (i + 0.85)} textLength={width} lengthAdjust="spacingAndGlyphs">{line}</text>)}
        </g>
    )
}

const Arrow = ({ item, clockwise }: { item: PartItem, clockwise: boolean }) => {
    const r = Math.min(item.width, item.height) * 0.3
    const h = r * 0.45
    return (
        <g transform={`translate(${item.width / 2} ${item.height / 2}) scale(${clockwise ? 1 : -1} 1)`} fill="none" stroke="#1f6feb" strokeWidth={r * 0.18} strokeLinecap="round">
            <path d={`M ${r} 0 A ${r} ${r} 0 1 1 0 ${-r}`} />
            <path d={`M ${-h * 0.2} ${-r - h * 0.6} L 0 ${-r} L ${-h * 0.2} ${-r + h * 0.6}`} strokeLinejoin="round" />
        </g>
    )
}

const Scope = ({ traces }: { traces: NonNullable<Effect['scope']>[Shown] }) => (
    <g pointerEvents="none">
        {traces?.map((trace, i) => (
            <g key={i}>
                <polyline points={trace.points.join(' ')} fill="none" stroke={trace.color} strokeWidth={SCOPE_STROKE} strokeLinejoin="round" />
                <text x={trace.at[0]} y={trace.at[1]} fontSize={LEGEND_PX} fill={trace.color} fontFamily="Droid Sans, sans-serif">{trace.label}</text>
            </g>
        ))}
    </g>
)

export const Overlay = ({ item, effect, view, lab }: { item: PartItem, effect: Effect, view: Shown, lab: boolean }) => (
    <g transform={`matrix(${item.matrix.join(' ')})`} pointerEvents="none">
        {effect.display && <Display item={item} lines={effect.display} view={view} lab={lab} />}
        {effect.arrow && <Arrow item={item} clockwise={effect.arrow === 'cw'} />}
        {effect.scope?.[view] && <Scope traces={effect.scope[view]} />}
        {effect.smoke && <Smoke item={item} />}
    </g>
)
