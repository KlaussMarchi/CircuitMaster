import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { formatSi } from '../../core/Properties'

export type Series = { id: string, label: string, unit: 'V' | 'A', color: string, values: ArrayLike<number> }

const MARGIN = { left: 56, right: 56, top: 10, bottom: 24 }
const TICKS  = 5
const PAD    = 0.08      // FOLGA VERTICAL ACIMA E ABAIXO DAS CURVAS

const niceStep = (span: number) => {
    const raw  = span / TICKS
    const base = 10 ** Math.floor(Math.log10(raw || 1))
    return [1, 2, 5, 10].map(factor => factor * base).find(step => raw <= step) ?? 10 * base
}

const rangeOf = (series: Series[]) => {
    const values = series.flatMap(item => Array.from(item.values))
    const low    = Math.min(0, ...values)
    const high   = Math.max(0, ...values)
    const pad    = (high - low || 1) * PAD
    return [low - pad, high + pad]
}

// GRÁFICO DO TRANSITÓRIO: TENSÕES À ESQUERDA, CORRENTES À DIREITA, CURVAS ATÉ O PASSO DA ANIMAÇÃO E CURSOR DE LEITURA
export const Grapher = ({ time, series, step }: { time: ArrayLike<number>, series: Series[], step: number }) => {
    const ref                 = useRef<HTMLDivElement>(null)
    const [size, setSize]     = useState<[number, number]>([600, 200])
    const [cursor, setCursor] = useState<number | null>(null)

    useEffect(() => {
        const element  = ref.current
        const observer = new ResizeObserver(([entry]) => setSize([entry.contentRect.width, entry.contentRect.height]))

        if (element)
            observer.observe(element)

        return () => observer.disconnect()
    }, [])

    const [w, h]   = size
    const t0       = time[0] ?? 0
    const t1       = time[time.length - 1] ?? 1
    const volts    = useMemo(() => rangeOf(series.filter(item => item.unit === 'V')), [series])
    const amps     = useMemo(() => rangeOf(series.filter(item => item.unit === 'A')), [series])
    const x        = (t: number) => MARGIN.left + (t - t0) / (t1 - t0 || 1) * (w - MARGIN.left - MARGIN.right)
    const y        = (value: number, unit: 'V' | 'A') => {
        const [low, high] = unit === 'V' ? volts : amps
        return MARGIN.top + (1 - (value - low) / (high - low || 1)) * (h - MARGIN.top - MARGIN.bottom)
    }
    const shown    = Math.min(step, time.length - 1)
    const at       = cursor ?? shown
    const timeStep = niceStep(t1 - t0)
    const ticks    = Array.from({ length: Math.floor((t1 - t0) / timeStep) + 1 }, (_, i) => t0 + i * timeStep)
    const axis     = (unit: 'V' | 'A') => {
        const [low, high] = unit === 'V' ? volts : amps
        const stepSize    = niceStep(high - low)
        return Array.from({ length: Math.floor(high / stepSize) - Math.ceil(low / stepSize) + 1 }, (_, i) => (Math.ceil(low / stepSize) + i) * stepSize)
    }

    const onMove = (event: PointerEvent<SVGSVGElement>) => {
        const box   = event.currentTarget.getBoundingClientRect()
        const t     = t0 + (event.clientX - box.left - MARGIN.left) / (w - MARGIN.left - MARGIN.right) * (t1 - t0)
        const index = Array.from(time).findIndex(value => value >= t)
        setCursor(index < 0 ? time.length - 1 : Math.min(index, shown))
    }

    return (
        <div ref={ref} className="relative h-full min-h-0 w-full">
            <svg width={w} height={h} className="absolute inset-0 text-[10px]" onPointerMove={onMove} onPointerLeave={() => setCursor(null)}>
                <rect x={MARGIN.left} y={MARGIN.top} width={Math.max(0, w - MARGIN.left - MARGIN.right)} height={Math.max(0, h - MARGIN.top - MARGIN.bottom)} fill="#0f172a" />
                {ticks.map(t => <g key={t}><line x1={x(t)} x2={x(t)} y1={MARGIN.top} y2={h - MARGIN.bottom} stroke="#334155" /><text x={x(t)} y={h - 8} textAnchor="middle" fill="#64748b">{formatSi(t, 's', 2)}</text></g>)}
                {series.some(item => item.unit === 'V') && axis('V').map(value => <g key={`v${value}`}><line x1={MARGIN.left} x2={w - MARGIN.right} y1={y(value, 'V')} y2={y(value, 'V')} stroke={value === 0 ? '#64748b' : '#1e293b'} /><text x={MARGIN.left - 4} y={y(value, 'V') + 3} textAnchor="end" fill="#64748b">{formatSi(value, 'V', 2)}</text></g>)}
                {series.some(item => item.unit === 'A') && axis('A').map(value => <text key={`a${value}`} x={w - MARGIN.right + 4} y={y(value, 'A') + 3} fill="#64748b">{formatSi(value, 'A', 2)}</text>)}
                {series.map(item => <polyline key={item.id} points={Array.from({ length: shown + 1 }, (_, i) => `${x(time[i])},${y(item.values[i] ?? 0, item.unit)}`).join(' ')} fill="none" stroke={item.color} strokeWidth={1.5} strokeLinejoin="round" />)}
                <line x1={x(time[at] ?? t0)} x2={x(time[at] ?? t0)} y1={MARGIN.top} y2={h - MARGIN.bottom} stroke="#e2e8f0" strokeDasharray="3 3" />
            </svg>
            <div className="pointer-events-none absolute right-16 top-3 rounded bg-slate-900/85 px-2 py-1 font-mono text-[11px] text-slate-100">
                <div className="text-slate-400">t = {formatSi(time[at] ?? 0, 's', 3)}</div>
                {series.map(item => <div key={item.id} style={{ color: item.color }}>{item.label} = {formatSi(item.values[at] ?? 0, item.unit, 3)}</div>)}
            </div>
        </div>
    )
}
