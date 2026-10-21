import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { formatReading, formatSi } from '../../core/Properties'
import type { StepResponse } from '../../engine/Response'

export type Series = { id: string, label: string, unit: 'V' | 'A', color: string, values: ArrayLike<number>, dashed?: boolean }
export type Marks  = { color: string, unit: 'V' | 'A', response: StepResponse }

const DIVISIONS = [3, 4, 5]    // FAIXAS HORIZONTAIS POSSÍVEIS, AS MESMAS NOS DOIS EIXOS
const TICK_W    = 72     // PX MÍNIMOS ENTRE RÓTULOS DO TEMPO
const NICE      = [1, 2, 2.5, 5, 10]
const BAND      = 0.02    // ±2% DO DEGRAU: A MESMA FAIXA DA ACOMODAÇÃO
const RINGING   = 0.005   // SOBRESSINAL QUE VALE MARCAR NO PICO
const CHAR      = 6.8     // PX POR CARACTERE MONO DE 11px NA CAIXA DE LEITURA
const ROW       = 15

const niceStep = (raw: number) => {
    const base = 10 ** Math.floor(Math.log10(raw || 1))
    return (NICE.find(factor => factor * base >= raw * (1 - 1e-9)) ?? 10) * base
}

// ESCALA COM count FAIXAS REDONDAS COBRINDO OS VALORES E O ZERO; DOIS EIXOS COM O MESMO count FICAM COM AS LINHAS DA GRADE ALINHADAS
const getScale = (values: number[], count: number): [number, number] => {
    const low  = Math.min(0, ...values)
    const high = Math.max(0, ...values)
    let step   = niceStep((high - low || 1) / count)

    while (Math.floor(low / step + 1e-9) * step + count * step < high - 1e-12)
        step = niceStep(step * 1.01)

    const start = Math.floor(low / step + 1e-9) * step
    return [start, start + count * step]
}

// NÚMERO DE FAIXAS QUE MENOS DESPERDIÇA ALTURA NOS DOIS EIXOS
const getScales = (volts: Series[], amps: Series[]) => {
    const values = [volts, amps].map(group => group.flatMap(item => Array.from(item.values)))
    const waste  = (count: number) => values.reduce((sum, list) => {
        const [low, high] = getScale(list, count)
        return sum + 1 - (Math.max(0, ...list) - Math.min(0, ...list) || 1) / (high - low)
    }, 0)
    const count  = DIVISIONS.reduce((best, count) => waste(count) < waste(best) - 1e-9 ? count : best)
    return { count, V: getScale(values[0], count), A: getScale(values[1], count) }
}

const axisText = (value: number, unit: string) => formatSi(value, unit, 3).replace(/^(-?[\d.]+)/, '$1 ')

// OSCILOSCÓPIO DO TRANSITÓRIO: TENSÕES À ESQUERDA, CORRENTES À DIREITA, CURVAS ATÉ O PASSO DA ANIMAÇÃO, LEITURA SOB O CURSOR, CLIQUE LEVA AO INSTANTE E, NA RESPOSTA AO DEGRAU, FAIXA DE ±2%, VALOR FINAL, PICO, τ E ACOMODAÇÃO
export const Grapher = ({ time, series, step, marks, seek }: { time: ArrayLike<number>, series: Series[], step: number, marks: Marks | null, seek: (step: number) => void }) => {
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

    const volts   = useMemo(() => series.filter(item => item.unit === 'V'), [series])
    const amps    = useMemo(() => series.filter(item => item.unit === 'A'), [series])
    const scales  = useMemo(() => getScales(volts, amps), [volts, amps])
    const [w, h]  = size
    const margin  = { left: volts.length || !amps.length ? 54 : 14, right: amps.length ? 62 : 16, top: 12, bottom: 26 }
    const plotW   = Math.max(1, w - margin.left - margin.right)
    const plotH   = Math.max(1, h - margin.top - margin.bottom)
    const t0      = time[0] ?? 0
    const t1      = time[time.length - 1] ?? 1
    const shown   = Math.min(step, time.length - 1)
    const at      = cursor ?? shown
    const x       = (t: number) => margin.left + (t - t0) / (t1 - t0 || 1) * plotW
    const y       = (value: number, unit: 'V' | 'A') => margin.top + (1 - (value - scales[unit][0]) / (scales[unit][1] - scales[unit][0] || 1)) * plotH
    const tStep   = niceStep((t1 - t0) / Math.max(1, Math.floor(plotW / TICK_W)))
    const ticks   = Array.from({ length: Math.floor((t1 - t0) / tStep + 1e-9) + 1 }, (_, i) => t0 + i * tStep)
    const lines   = Array.from({ length: scales.count + 1 }, (_, i) => i)
    const level   = (unit: 'V' | 'A', i: number) => scales[unit][0] + i * (scales[unit][1] - scales[unit][0]) / scales.count

    const paths = useMemo(() => series.map(item => Array.from({ length: shown + 1 }, (_, i) => `${x(time[i]).toFixed(1)},${y(item.values[i] ?? 0, item.unit).toFixed(1)}`).join(' ')), [series, shown, w, h, scales, time])

    const pick = (event: MouseEvent<SVGSVGElement>) => {
        const box   = event.currentTarget.getBoundingClientRect()
        const t     = t0 + (event.clientX - box.left - margin.left) / plotW * (t1 - t0)
        const index = Array.from(time).findIndex(value => value >= t)
        return index < 0 ? time.length - 1 : index
    }

    const rows    = [`t = ${formatReading(time[at] ?? 0, 's')}`, ...series.map(item => `${item.label} = ${formatReading(item.values[at] ?? 0, item.unit)}`)]
    const tipW    = Math.max(...rows.map(row => row.length)) * CHAR + 18
    const tipX    = x(time[at] ?? t0) + 12 + tipW > w - 8 ? x(time[at] ?? t0) - 12 - tipW : x(time[at] ?? t0) + 12
    const r       = marks?.response
    const delta   = r ? Math.abs(r.final - r.initial) * BAND : 0

    return (
        <div ref={ref} className="scope">
            <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Formas de onda da simulação no tempo" onPointerMove={event => setCursor(Math.min(pick(event), shown))} onPointerLeave={() => setCursor(null)} onClick={event => seek(pick(event))}>
                {lines.map(i => <line key={i} className={i === 0 ? 'base' : 'gl'} x1={margin.left} x2={margin.left + plotW} y1={margin.top + plotH - i * plotH / scales.count} y2={margin.top + plotH - i * plotH / scales.count} />)}
                {volts.length > 0 && lines.map(i => <text key={`v${i}`} x={margin.left - 8} y={margin.top + plotH - i * plotH / scales.count + 4} textAnchor="end">{axisText(level('V', i), 'V')}</text>)}
                {amps.length > 0 && lines.map(i => <text key={`a${i}`} x={margin.left + plotW + 8} y={margin.top + plotH - i * plotH / scales.count + 4}>{axisText(level('A', i), 'A')}</text>)}
                {ticks.map((t, i) => <text key={t} x={x(t)} y={h - 8} textAnchor={i === 0 ? 'start' : 'middle'}>{axisText(t, 's')}</text>)}
                {r && marks && <rect className="band" x={x(r.from)} width={Math.max(0, x(r.to) - x(r.from))} y={y(r.final + delta, marks.unit)} height={Math.max(1, y(r.final - delta, marks.unit) - y(r.final + delta, marks.unit))} />}
                {r && marks && <line className="ref" x1={x(r.from)} x2={x(r.to)} y1={y(r.final, marks.unit)} y2={y(r.final, marks.unit)} />}
                {series.map((item, i) => <polyline key={item.id} className="tr" points={paths[i]} style={{ stroke: item.color }} strokeDasharray={item.dashed ? '5 3' : undefined} />)}
                {r && marks && r.tau !== null && r.tau <= time[shown] && <g className="mk"><line className="ref" x1={x(r.tau)} x2={x(r.tau)} y1={margin.top} y2={margin.top + plotH} /><text x={x(r.tau) + 5} y={margin.top + plotH - 6} style={{ fill: marks.color }}>τ = {formatReading(r.tau - r.from, 's')}</text></g>}
                {r && marks && r.settling !== null && r.tau === null && r.settling <= time[shown] && <g className="mk"><line className="ref" x1={x(r.settling)} x2={x(r.settling)} y1={margin.top} y2={margin.top + plotH} /><text x={x(r.settling) + 5} y={margin.top + plotH - 6} style={{ fill: marks.color }}>acomoda em {formatReading(r.settling - r.from, 's')}</text></g>}
                {r && marks && r.overshoot > RINGING && r.peak.time <= time[shown] && <g className="mk"><circle cx={x(r.peak.time)} cy={y(r.peak.value, marks.unit)} r={3.5} style={{ fill: marks.color }} /><text x={x(r.peak.time) + 7} y={y(r.peak.value, marks.unit) - 6} style={{ fill: marks.color }}>+{(r.overshoot * 100).toFixed(1)}%</text></g>}
                <line className="cur" x1={x(time[at] ?? t0)} x2={x(time[at] ?? t0)} y1={margin.top} y2={margin.top + plotH} />
                {series.length > 0 && <g className="tip"><rect x={tipX} y={margin.top + 4} width={tipW} height={rows.length * ROW + 10} rx={4} />{rows.map((row, i) => <text key={i} x={tipX + 9} y={margin.top + 20 + i * ROW}>{row}</text>)}</g>}
            </svg>
        </div>
    )
}
