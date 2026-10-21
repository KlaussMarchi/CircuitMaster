import { describe, expect, it } from 'vitest'
import { Ngspice, type Vectors } from '../src/core/Ngspice'
import { getSpice, opampModel } from '../src/core/Spice'
import { getGain } from '../src/engine/Response'
import { HAS_FRITZING, makeLibrary } from './Fixtures'
import createNgspice from '../src/workers/Simulator/ngspice/ngspice.js'

const LM358  = { a0: 1e5, gbw: 1e6, sr: 0.3e6, vh: 1.5, vl: 0.02, rout: 50, iq: 0.35e-3 }
const SUPPLY = ['VCC vcc 0 DC 9', 'VEE vee 0 DC -9']
const FREQ   = 1000

const session = async () => {
    const ngspice = new Ngspice(await createNgspice())
    ngspice.setup()
    return ngspice
}

const series = (vectors: Vectors, node: string) => vectors[`v(${node})`] ?? vectors[node]

const simulate = async (lines: string[], tran: string) => {
    const run = (await session()).run(['* amp-op', ...SUPPLY, ...lines, opampModel('CM_LM358', LM358), '.option interp', tran, '.end'].join('\n'))
    expect(run.error).toBeNull()
    return run.vectors
}

describe('macro-modelo de amp-op (spec 04 §1.1)', () => {
    it('não inversor 1 + 10k/1k amplifica 11 vezes sem defasar', async () => {
        const vectors = await simulate(['VIN in 0 SIN(0 0.5 1k)', 'XU1 in fb vcc vee out CM_LM358', 'RF out fb 10k', 'RG fb 0 1k'], '.tran 1u 5m')
        const gain    = getGain(vectors.time, series(vectors, 'in'), series(vectors, 'out'), FREQ, 1e-3)

        expect(gain?.gain).toBeGreaterThan(10.9)
        expect(gain?.gain).toBeLessThan(11.05)
        expect(Math.abs(gain?.phase ?? 99)).toBeLessThan(3)
    })

    it('satura a 1,5 V do trilho positivo e encosta no negativo', async () => {
        const vectors = await simulate(['VIN in 0 SIN(0 1.5 1k)', 'XU1 in fb vcc vee out CM_LM358', 'RF out fb 10k', 'RG fb 0 1k'], '.tran 1u 3m')
        const out     = Array.from(series(vectors, 'out'))

        expect(Math.max(...out)).toBeGreaterThan(9 - 1.5 - 0.15)
        expect(Math.max(...out)).toBeLessThan(9 - 1.5 + 0.15)
        expect(Math.min(...out)).toBeLessThan(-9 + 0.2)
    })

    it('seguidor com degrau de 5 V sobe no slew rate de 0,3 V/µs', async () => {
        const vectors = await simulate(['VIN in 0 PULSE(0 5 10u 10n 10n 1m 2m)', 'XU1 in out vcc vee out CM_LM358'], '.tran 0.1u 60u')
        const time    = Array.from(vectors.time)
        const out     = Array.from(series(vectors, 'out'))
        const cross   = (level: number) => time[out.findIndex(value => value >= level)]

        expect(4 / (cross(4.5) - cross(0.5))).toBeGreaterThan(0.25e6)
        expect(4 / (cross(4.5) - cross(0.5))).toBeLessThan(0.36e6)
        expect(out[out.length - 1]).toBeCloseTo(5, 2)
    })
})

describe.skipIf(!HAS_FRITZING)('peças de amp-op do acervo', () => {
    it('o LM358 ganha as duas metades e os ADI recebem o subcircuito que referenciam', async () => {
        const library = makeLibrary()
        await library.load(['a59353bd0db0225dc22770e292c622f3', 'AnalogDevices_OP27GPZ'])
        const lm358 = getSpice(library.getPart('a59353bd0db0225dc22770e292c622f3') as NonNullable<ReturnType<typeof library.getPart>>)
        const op27  = getSpice(library.getPart('AnalogDevices_OP27GPZ') as NonNullable<ReturnType<typeof library.getPart>>)

        expect(lm358.lines).toHaveLength(2)
        expect(lm358.models.join('\n')).toMatch(/^\.subckt CM_LM358 /m)
        expect(op27.models.join('\n')).toMatch(/^\.subckt OP27G inp inn vcc vee out$/m)
    })
})
