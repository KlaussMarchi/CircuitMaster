import { useMemo } from 'react'
import { formatReading } from '../../core/Properties'
import { getStats } from '../../engine/Simulation'
import { signedGain, type Report } from '../../engine/Response'
import { Kv } from '../Inspector'
import { t } from '../../core/Text'

// MEDIDAS DE UMA CURVA DA PONTA NO TRANSITÓRIO: MÉDIA, RMS E PICO A PICO; PERÍODO, SUBIDA, τ, SOBRESSINAL, ACOMODAÇÃO, ζ, GANHO E FASE SÓ QUANDO VALEM (SPEC 04 §8.8)
export const Measures = ({ title, values, unit, time, step, report }: { title: string, values: ArrayLike<number>, unit: 'V' | 'A', time: ArrayLike<number>, step: number, report: Report | null }) => {
    const stats = useMemo(() => getStats(values, time, step), [values, time, step])
    const at    = (seconds: number) => formatReading(seconds, 's')
    const r     = report?.kind === 'step' ? report.response : null
    const gain  = report?.kind === 'gain' ? report.gain : null

    return (
        <div className="sec" aria-label={t(title)}>
            <h3>{t(title)}</h3>
            <Kv label="Média" value={formatReading(stats.mean, unit)} />
            <Kv label="RMS" value={formatReading(stats.rms, unit)} />
            <Kv label="Pico a pico" value={formatReading(stats.pp, unit)} />
            {stats.frequency !== null && !gain && <Kv label="Período" value={`${at(1 / stats.frequency)} · ${formatReading(stats.frequency, 'Hz')}`} />}
            {r && <Kv label="Inicial → final" value={`${formatReading(r.initial, unit)} → ${formatReading(r.final, unit)}`} />}
            {r?.rise && <Kv label="Subida (10–90%)" value={at(r.rise[1] - r.rise[0])} />}
            {r && r.tau !== null && <Kv label="Constante τ (63%)" value={at(r.tau - r.from)} />}
            {r && r.overshoot > 0 && <Kv label="Sobressinal" value={t('{0}% · pico {1}', (r.overshoot * 100).toFixed(1), formatReading(r.peak.value, unit))} />}
            {r && <Kv label="Acomodação (±2%)" value={r.settling !== null ? at(r.settling - r.from) : t('não acomodou na janela')} />}
            {r && r.period !== null && <Kv label="Oscilação" value={`${at(r.period)} · ${formatReading(1 / r.period, 'Hz')}`} />}
            {r && r.damping !== null && <Kv label="Amortecimento ζ" value={r.damping.toFixed(3)} />}
            {gain && <Kv label="Frequência" value={formatReading(gain.frequency, 'Hz')} />}
            {gain && <Kv label="Ganho" value={`${signedGain(gain).toFixed(2)} V/V · ${gain.decibels.toFixed(1)} dB`} />}
            {gain && <Kv label="Fase" value={`${gain.phase.toFixed(0)}°`} />}
            {gain && <Kv label="Nível DC da saída" value={formatReading(gain.output.offset, unit)} />}
            <p className="sub" style={{ marginTop: 6 }}>{r ? (r.tau !== null ? t('1ª ordem: em 5τ = {0} chega a 99% do final.', at(5 * (r.tau - r.from))) : r.damping !== null ? t('Subamortecida (ζ < 1): passa do final em {0}% e oscila até acomodar.', (r.overshoot * 100).toFixed(1)) : t('Sem sobressinal.')) + (r.steady ? '' : ` ${t('A curva ainda varia no fim: aumente o fim da janela.')}`) : gain ? (Math.abs(gain.phase) > 135 ? t('Inversor: a saída fica em oposição de fase à entrada.') : Math.abs(gain.phase) < 45 ? t('Não inversor: a saída acompanha a entrada.') : t('A saída fica defasada da entrada.')) : t('Sem degrau nem senoide para medir resposta nesta curva: escolha Degrau ou Senoide na fonte de tensão.')}</p>
        </div>
    )
}
