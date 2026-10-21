import { describe, expect, it } from 'vitest'
import { getGain, getReport, getStepResponse, getTone } from '../src/engine/Response'

const TAU   = 0.1
const ZETA  = 0.35
const WN    = 3162
const FREQ  = 1000

const sample = (t1: number, count: number, wave: (t: number) => number) => {
    const time = Float64Array.from({ length: count + 1 }, (_, i) => i * t1 / count)
    return { time, values: time.map(wave) }
}

const near = (value: number | null | undefined, expected: number, tolerance: number) => expect(Math.abs((value ?? Infinity) - expected) / Math.abs(expected)).toBeLessThan(tolerance)

describe('resposta ao degrau (spec 04 §8.8)', () => {
    it('1ª ordem: τ a 63,2%, subida de 2,197τ, acomodação a 2% em 3,912τ e sem sobressinal', () => {
        const { time, values } = sample(8 * TAU, 4000, t => 5 * (1 - Math.exp(-t / TAU)))
        const step = getStepResponse(time, values, 0, 8 * TAU)

        near(step?.tau, TAU, 0.005)
        near(step?.rise && step.rise[1] - step.rise[0], Math.log(9) * TAU, 0.005)
        near(step?.settling, Math.log(50) * TAU, 0.005)
        near(step?.final, 5, 0.001)
        expect(step?.overshoot).toBe(0)
        expect(step?.damping).toBeNull()
    })

    it('2ª ordem subamortecida: sobressinal, instante de pico, período amortecido e ζ batem com a teoria', () => {
        const wd = WN * Math.sqrt(1 - ZETA ** 2)
        const { time, values } = sample(0.01, 5000, t => 2 * (1 - Math.exp(-ZETA * WN * t) * (Math.cos(wd * t) + ZETA / Math.sqrt(1 - ZETA ** 2) * Math.sin(wd * t))))
        const step = getStepResponse(time, values, 0, 0.01)

        near(step?.overshoot, Math.exp(-Math.PI * ZETA / Math.sqrt(1 - ZETA ** 2)), 0.005)
        near(step?.peak.time, Math.PI / wd, 0.01)
        near(step?.period, 2 * Math.PI / wd, 0.01)
        near(step?.damping, ZETA, 0.01)
        expect(step?.tau).toBeNull()
        expect(step?.settling).not.toBeNull()
    })

    it('degrau negativo, intervalo parcial, degrau inexistente e resposta que não acomoda', () => {
        const { time, values } = sample(8 * TAU, 800, t => t < 2 * TAU ? 0 : -3 * (1 - Math.exp(-(t - 2 * TAU) / TAU)))
        const late = getStepResponse(time, values, 2 * TAU, 8 * TAU)
        const slow = getStepResponse(time, values, 2 * TAU, 2.5 * TAU)

        near(late?.tau && late.tau - 2 * TAU, TAU, 0.01)
        near(late?.final, -3, 0.01)
        expect(getStepResponse(time, time.map(() => 1.5), 0, 1)).toBeNull()
        expect(slow?.settling).toBeNull()
    })
})

describe('ganho e fase de um amplificador', () => {
    it('acha amplitude, nível DC e fase da componente na frequência dada', () => {
        const { time, values } = sample(5 / FREQ, 2000, t => 1.2 + 0.5 * Math.sin(2 * Math.PI * FREQ * t + 0.3))
        const tone = getTone(time, values, FREQ, 0)

        near(tone?.amplitude, 0.5, 0.002)
        near(tone?.offset, 1.2, 0.002)
        near(tone?.phase, 0.3 * 180 / Math.PI, 0.01)
    })

    it('inversor de ganho 4,7 dá 13,4 dB e 180°; não inversor de ganho 11 dá 0°', () => {
        const input    = sample(5 / FREQ, 2000, t => 0.2 * Math.sin(2 * Math.PI * FREQ * t))
        const inverted = getGain(input.time, input.values, input.time.map(t => 4.86 - 0.94 * Math.sin(2 * Math.PI * FREQ * t)), FREQ, 0)
        const follower = getGain(input.time, input.values, input.time.map(t => 2.2 * Math.sin(2 * Math.PI * FREQ * t)), FREQ, 0)

        near(inverted?.gain, 4.7, 0.002)
        near(inverted?.decibels, 20 * Math.log10(4.7), 0.002)
        expect(Math.abs(inverted?.phase ?? 0)).toBeCloseTo(180, 1)
        near(follower?.gain, 11, 0.002)
        expect(follower?.phase).toBeCloseTo(0, 1)
    })
})

describe('medida conforme a fonte do circuito', () => {
    it('senoide na entrada dá ganho e fase, deixando o primeiro período de fora', () => {
        const input  = sample(5 / FREQ, 2000, t => 0.5 * Math.sin(2 * Math.PI * FREQ * t))
        const output = input.time.map(t => t < 1 / FREQ ? 0 : -5 * Math.sin(2 * Math.PI * FREQ * t))
        const report = getReport(input.time, output, { name: 'V1', kind: 'sin', period: 1 / FREQ, delay: 0, rise: 0, width: 0 }, input.values)

        expect(report?.kind).toBe('gain')
        near(report?.kind === 'gain' ? report.gain.gain : null, 10, 0.002)
    })

    it('pulso mede o degrau só até a descida; na janela toda a carga e descarga não é degrau', () => {
        const { time, values } = sample(1, 4000, t => t < 0.5 ? 5 * (1 - Math.exp(-t / TAU)) : 5 * (1 - Math.exp(-0.5 / TAU)) * Math.exp(-(t - 0.5) / TAU))
        const pulse  = getReport(time, values, { name: 'V1', kind: 'pulse', period: 1, delay: 0, rise: 0, width: 0.5 }, null)
        const whole  = getReport(time, values, null, null)

        near(pulse?.kind === 'step' ? pulse.response.tau : null, TAU, 0.02)
        near(pulse?.kind === 'step' ? pulse.response.final : null, 5, 0.01)
        expect(pulse?.kind === 'step' && pulse.response.to).toBeCloseTo(0.5, 3)
        expect(whole).toBeNull()
    })
})

describe('degrau entre comutações programadas', () => {
    it('mede da primeira à segunda comutação', () => {
        const { time, values } = sample(1, 4000, t => t < 0.1 ? 0 : t < 0.5 ? 5 * (1 - Math.exp(-(t - 0.1) / TAU)) : 5 * (1 - Math.exp(-0.4 / TAU)) * Math.exp(-(t - 0.5) / TAU))
        const report = getReport(time, values, null, null, [0.5, 0.1])

        near(report?.kind === 'step' ? report.response.tau && report.response.tau - 0.1 : null, TAU, 0.05)
        expect(report?.kind === 'step' && report.response.to).toBeCloseTo(0.5, 3)
    })
})

