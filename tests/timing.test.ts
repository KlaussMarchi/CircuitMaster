import { describe, expect, it } from 'vitest'
import { evaluate, getTiming, getWindow, spiceNumber } from '../src/core/Timing'

const near = (value: number | undefined, expected: number, tolerance = 0.002) => expect(Math.abs((value ?? Infinity) - expected) / Math.abs(expected)).toBeLessThan(tolerance)

const RC     = ['VV1 1_V1_aux 0 DC 5', 'RV1 1_V1_aux 1 0.1', 'RR1 1 2 1k', 'CC1 2 0 100u IC=0'].join('\n')
const RLC    = ['VV1 1 0 DC 5', 'RR1 1 2 22', 'LL1 2 3 10m IC=0', 'CC1 3 0 10u IC=0'].join('\n')
const DIVIDE = ['VV1 1 0 DC 9', 'RR1 1 2 47k', 'RR2 2 0 10k', 'VS 5 0 SIN(0 0.1 1k)', 'CC1 5 2 10u', 'QQ1 4 2 6 NPN_GENERIC', 'XU1 6 7 8 9 10 OP27G', '.subckt OP27G 1 2 3 4 5', 'R1 1 2 1', 'C1 1 2 1', '.ends'].join('\n')

describe('escala de tempo do circuito pelo deck (spec 04 §5.5)', () => {
    it('lê números e expressões SPICE', () => {
        ;[['100uF', 100e-6], ['1Meg', 1e6], ['60Hz', 60], ['5V', 5], ['2.2k', 2200], ['1e-3', 1e-3], ['0.1Ω', 0.1], ['10mil', 254e-6]].forEach(([text, value]) => near(spiceNumber(text as string), value as number))
        expect(spiceNumber('abc')).toBeNaN()
        expect([evaluate('50/100*10k'), evaluate('(1+2)*3'), evaluate('-2*3')]).toEqual([5000, 9, -6])
        expect(evaluate('1>2?3:4')).toBeNaN()
    })

    it('τ = RC pela resistência que o capacitor vê, com as fontes em curto e o resto aberto', () => {
        near(getTiming(RC).constants[0], 1000.1 * 100e-6)
        near(getTiming(DIVIDE).constants[0], 47e3 * 10e3 / 57e3 * 10e-6)
        near(getTiming('V1 1 0 5\nR1 1 2 {50/100*10k}\nC1 2 0 1u').constants[0], 5e-3)
        near(getTiming('V1 1 0 5\nR1 1 2 10\nL1 2 0 10m').constants[0], 1e-3)
    })

    it('RLC série: frequência natural, amortecimento e acomodação a 2%', () => {
        const [ring] = getTiming(RLC).resonances
        near(ring?.frequency, 1 / (2 * Math.PI * Math.sqrt(10e-3 * 10e-6)))
        near(ring?.damping, 22 / 2 * Math.sqrt(10e-6 / 10e-3))
        near(ring?.settling, 4 / (22 / (2 * 10e-3)))
    })

    it('períodos das fontes PULSE e SIN e a janela automática', () => {
        const square = getTiming(`${RC}\nVV2 5 0 PULSE(0 5 0 1m 1m 500m 1 0)`)
        const sine   = getTiming('VV1 1 0 SIN(0 0.5 1k 0 0 0)\nRR1 1 0 1k')

        expect(square.sources.map(source => [source.kind, source.period])).toEqual([['pulse', 1]])
        expect(sine.sources.map(source => [source.kind, source.period])).toEqual([['sin', 1e-3]])
        expect(getWindow(getTiming(RC))).toEqual({ stop: 0.6, points: 500 })
        expect(getWindow(getTiming(RLC))?.stop).toBe(6e-3)
        expect(getWindow(square)?.stop).toBe(3)
        expect(getWindow(sine)).toEqual({ stop: 3e-3, points: 500 })
        expect(getWindow(getTiming('VV1 1 0 DC 5\nRR1 1 0 1k'))).toBeNull()
    })
})
