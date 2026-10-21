import type { Source } from '../../core/Timing'

export type StepResponse = { from: number, to: number, initial: number, final: number, steady: boolean, rise: [number, number] | null, tau: number | null, peak: { time: number, value: number }, overshoot: number, settling: number | null, period: number | null, damping: number | null }
export type Tone         = { amplitude: number, phase: number, offset: number }
export type Gain         = { gain: number, decibels: number, phase: number, input: Tone, output: Tone, frequency: number }
export type Report       = { kind: 'step', response: StepResponse } | { kind: 'gain', gain: Gain }

const BAND      = 0.02                 // FAIXA DE ACOMODAÇÃO EM TORNO DO VALOR FINAL
const LEVELS    = [0.1, 0.9]           // SUBIDA DE 10% A 90% DO DEGRAU
const TAU_LEVEL = 1 - Math.exp(-1)     // 63,2%: UMA CONSTANTE DE TEMPO NA RESPOSTA DE 1ª ORDEM
const TAIL      = 0.02                 // FRAÇÃO FINAL DO INTERVALO QUE DÁ O VALOR FINAL
const CHECK     = 0.1                  // FRAÇÃO FINAL QUE TEM DE ESTAR PARADA (DENTRO DE MEIA FAIXA) PARA O VALOR FINAL VALER
const STEP_MIN  = 1e-3                 // VARIAÇÃO MENOR QUE ISSO DA ESCALA DO SINAL NÃO É DEGRAU
const RINGING   = 0.005                // SOBRESSINAL MENOR QUE ISSO É RESPOSTA SEM OSCILAÇÃO (τ VALE)
const LIMIT     = 1                    // SOBRESSINAL ACIMA DE 100% NÃO É DEGRAU (A CURVA VOLTA AO INÍCIO)
const SKIP      = 3                    // COM 3+ PERÍODOS NA JANELA, O PRIMEIRO FICA DE FORA (PARTIDA DO CIRCUITO)

const at = (t: number[], r: number[], k: number, level: number) => t[k - 1] + (level - r[k - 1]) / (r[k] - r[k - 1] || 1) * (t[k] - t[k - 1])

// PRIMEIRO INSTANTE EM QUE A RESPOSTA NORMALIZADA ALCANÇA level, INTERPOLADO ENTRE AMOSTRAS
const crossing = (t: number[], r: number[], level: number) => {
    const k = r.findIndex(value => value >= level)
    return k < 0 ? null : k === 0 ? t[0] : at(t, r, k, level)
}

// RESPOSTA AO DEGRAU NO INTERVALO [from, to]: VALOR FINAL PELA MÉDIA DO FIM (steady SE O FIM JÁ PAROU), SUBIDA 10–90%, τ A 63,2%, PICO E SOBRESSINAL, ACOMODAÇÃO A ±2%, PERÍODO ENTRE PICOS E ζ PELO SOBRESSINAL
export const getStepResponse = (time: ArrayLike<number>, values: ArrayLike<number>, from: number, to: number): StepResponse | null => {
    const kept    = Array.from({ length: Math.min(time.length, values.length) }, (_, i) => i).filter(i => time[i] >= from && time[i] <= to)
    const t       = kept.map(i => time[i])
    const y       = kept.map(i => values[i])
    const tail    = y.slice(Math.min(y.length - 1, Math.floor(y.length * (1 - TAIL))))
    const initial = y[0]
    const final   = tail.reduce((sum, value) => sum + value, 0) / Math.max(1, tail.length)
    const delta   = final - initial
    const scale   = y.reduce((max, value) => Math.max(max, Math.abs(value)), 0)

    if (y.length < 3 || Math.abs(delta) <= STEP_MIN * scale || delta === 0)
        return null

    const r         = y.map(value => (value - initial) / delta)
    const end       = r.slice(Math.floor(r.length * (1 - CHECK)))
    const steady    = Math.max(...end) - Math.min(...end) <= BAND / 2
    const top       = r.reduce((best, value, i) => value > r[best] ? i : best, 0)
    const overshoot = top < r.length - tail.length ? Math.max(0, r[top] - 1) : 0
    const outside   = r.map((value, i) => Math.abs(value - 1) > BAND ? i : -1).filter(i => i >= 0).pop()
    const settling  = !steady || outside === r.length - 1 ? null : outside === undefined ? t[0] : at(t, r.map(value => -Math.abs(value - 1)), outside + 1, -BAND)
    const rise      = LEVELS.map(level => crossing(t, r, level))
    const peaks     = r.map((value, i) => i > 0 && i < r.length - 1 && value > r[i - 1] && value >= r[i + 1] && value > 1 + BAND / 2 ? t[i] : null).filter((value): value is number => value !== null)
    const ln        = Math.log(overshoot)
    const ringing   = overshoot > RINGING

    return {
        from: t[0],
        to: t[t.length - 1],
        initial,
        final,
        steady,
        rise: rise[0] !== null && rise[1] !== null ? [rise[0], rise[1]] : null,
        tau: ringing ? null : crossing(t, r, TAU_LEVEL),
        peak: { time: t[top], value: y[top] },
        overshoot,
        settling,
        period: peaks.length > 1 ? peaks[1] - peaks[0] : null,
        damping: ringing ? -ln / Math.sqrt(Math.PI ** 2 + ln ** 2) : null
    }
}

// COMPONENTE NA FREQUÊNCIA f: AMPLITUDE E FASE (GRAUS) PELA TRANSFORMADA NUM NÚMERO INTEIRO DE PERÍODOS A PARTIR DE from, NÍVEL DC PELA MÉDIA
export const getTone = (time: ArrayLike<number>, values: ArrayLike<number>, frequency: number, from: number): Tone | null => {
    const kept    = Array.from({ length: Math.min(time.length, values.length) }, (_, i) => i).filter(i => time[i] >= from)
    const periods = kept.length > 1 ? Math.floor((time[kept[kept.length - 1]] - time[kept[0]]) * frequency) : 0
    const end     = kept.length ? time[kept[0]] + periods / frequency : 0
    const used    = kept.filter(i => time[i] <= end + 1e-12)

    if (periods < 1 || used.length < 8)
        return null

    const span    = time[used[used.length - 1]] - time[used[0]]
    const w       = 2 * Math.PI * frequency
    const segment = used.slice(1).map((i, k) => [used[k], i])
    const average = segment.reduce((sum, [a, b]) => sum + (values[a] + values[b]) / 2 * (time[b] - time[a]), 0) / span
    const project = (wave: (t: number) => number) => segment.reduce((sum, [a, b]) => sum + ((values[a] - average) * wave(time[a]) + (values[b] - average) * wave(time[b])) / 2 * (time[b] - time[a]), 0) * 2 / span
    const sine    = project(t => Math.sin(w * t))
    const cosine  = project(t => Math.cos(w * t))
    return { amplitude: Math.hypot(sine, cosine), phase: Math.atan2(cosine, sine) * 180 / Math.PI, offset: average }
}

const wrap = (degrees: number) => ((degrees + 180) % 360 + 360) % 360 - 180

// GANHO DE UM AMPLIFICADOR ENTRE DUAS SÉRIES NA FREQUÊNCIA DA ENTRADA: RAZÃO DAS AMPLITUDES, EM dB, E DEFASAGEM DA SAÍDA EM (−180°, 180°]
export const getGain = (time: ArrayLike<number>, input: ArrayLike<number>, output: ArrayLike<number>, frequency: number, from: number): Gain | null => {
    const a = getTone(time, input, frequency, from)
    const b = getTone(time, output, frequency, from)

    if (!a || !b || a.amplitude <= 0)
        return null

    const gain  = b.amplitude / a.amplitude
    const phase = wrap(b.phase - a.phase)
    return { gain, decibels: 20 * Math.log10(gain), phase: phase === -180 ? 180 : phase, input: a, output: b, frequency }
}

// MEDIDA DE UMA CURVA CONFORME A FONTE DO CIRCUITO: SENOIDE DÁ GANHO E FASE FRENTE À ENTRADA; PULSO, O DEGRAU DA PRIMEIRA SUBIDA ATÉ A DESCIDA; COMUTAÇÃO PROGRAMADA, O DEGRAU DA PRIMEIRA ATÉ A SEGUNDA; SEM ELES, O DEGRAU NA JANELA TODA
export const getReport = (time: ArrayLike<number>, values: ArrayLike<number>, source: Source | null, input: ArrayLike<number> | null, events: number[] = []): Report | null => {
    const t0 = time[0] ?? 0
    const t1 = time[time.length - 1] ?? 0

    if (source?.kind === 'sin' && input) {
        const start = Math.max(t0, source.delay)
        const gain  = getGain(time, input, values, 1 / source.period, (t1 - start) / source.period >= SKIP ? start + source.period : start)
        return gain && { kind: 'gain', gain }
    }

    const sorted     = [...events].sort((a, b) => a - b)
    const [from, to] = source?.kind === 'pulse' ? [source.delay, source.delay + source.rise + source.width] : sorted.length ? [sorted[0], sorted[1] ?? t1] : [t0, t1]
    const response   = getStepResponse(time, values, from, to)
    return response && response.overshoot <= LIMIT ? { kind: 'step', response } : null
}
