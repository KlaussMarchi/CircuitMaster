import { describe, expect, it } from 'vitest'
import { Netlist } from '../src/core/Netlist'
import { buildCircuit } from '../src/core/Spice'
import { Ngspice } from '../src/core/Ngspice'
import { Simulation, fromRest } from '../src/engine/Simulation'
import { BENCHES, BENCH_PARTS, buildBench } from '../src/engine/Bench'
import { getGain, getStepResponse } from '../src/engine/Response'
import { HAS_FRITZING, loadWasm, makeLibrary } from './Fixtures'
import createNgspice from '../src/workers/Simulator/ngspice/ngspice.js'

const run = async (id: string) => {
    const library = makeLibrary()
    await library.load([...BENCH_PARTS, 'WireModuleID'])
    const doc     = buildBench(library, BENCHES.find(bench => bench.id === id) ?? BENCHES[0])
    const netlist = new Netlist(doc, library, await loadWasm())
    netlist.update()

    const circuit = buildCircuit(doc, library, netlist, true)
    const ngspice = new Ngspice(await createNgspice())
    ngspice.setup()
    const result  = ngspice.run(circuit.deck)
    expect(result.error, circuit.deck).toBeNull()

    const vectors    = circuit.analysis.type === 'tran' && circuit.analysis.initial === 'zero' ? fromRest(result.vectors) : result.vectors
    const simulation = new Simulation(doc, library, circuit, vectors)
    const voltage    = (probe: string) => simulation.getProbe(probe).voltage ?? new Float64Array()
    return { doc, netlist, circuit, simulation, voltage, time: vectors.time }
}

describe.skipIf(!HAS_FRITZING)('circuitos de teste da simulação (spec 04 §8.9)', () => {
    it('todos ficam ligados no esquemático e na protoboard, sem conexão pendente', async () => {
        for (const bench of BENCHES) {
            const { netlist } = await run(bench.id)
            expect(netlist.getStatus('schematicView').left, bench.id).toBe(0)
            expect(netlist.getStatus('breadboardView').left, `${bench.id} na protoboard`).toBe(0)
        }
    })

    it('RC: o capacitor carrega a partir de zero com τ = 100 ms até 5 V', async () => {
        const { circuit, voltage, time } = await run('rc')
        const step = getStepResponse(time, voltage('P1'), 0, Infinity)

        expect(circuit.analysis).toMatchObject({ type: 'tran', t1: 0.6, initial: 'zero' })
        expect(step?.initial).toBeCloseTo(0, 3)
        expect(step?.tau).toBeGreaterThan(0.097)
        expect(step?.tau).toBeLessThan(0.103)
        expect(step?.final).toBeGreaterThan(4.95)
    })

    it('onda quadrada: carrega e descarga a cada meio período', async () => {
        const { circuit, voltage, time } = await run('square')
        const capacitor = Array.from(voltage('P1'))
        const at        = (t: number) => capacitor[Array.from(time).findIndex(value => value >= t)]

        expect(circuit.analysis).toMatchObject({ t1: 3, initial: 'op' })
        expect(at(0.49)).toBeGreaterThan(4.9)
        expect(at(0.99)).toBeLessThan(0.1)
        expect(Math.min(...capacitor)).toBeGreaterThan(-0.05)
    })

    it('RLC: sobressinal perto de 30% com período amortecido de 2,1 ms', async () => {
        const { voltage, time } = await run('rlc')
        const step = getStepResponse(time, voltage('P1'), 0, Infinity)

        expect(step?.overshoot).toBeGreaterThan(0.25)
        expect(step?.overshoot).toBeLessThan(0.36)
        expect(step?.period).toBeGreaterThan(2.0e-3)
        expect(step?.period).toBeLessThan(2.3e-3)
        expect(step?.settling).not.toBeNull()
    })

    it('amp-op inversor: ganho 10 em oposição de fase', async () => {
        const { voltage, time } = await run('opamp')
        const gain = getGain(time, voltage('P1'), voltage('P2'), 1000, 1e-3)

        expect(gain?.gain).toBeGreaterThan(9.8)
        expect(gain?.gain).toBeLessThan(10.1)
        expect(Math.abs(gain?.phase ?? 0)).toBeGreaterThan(175)
    })

    it('emissor comum: ganho perto de −Rc/Re, invertendo a fase', async () => {
        const { voltage, time } = await run('bjt')
        const gain = getGain(time, voltage('P1'), voltage('P2'), 1000, 1e-3)

        expect(gain?.gain).toBeGreaterThan(3.8)
        expect(gain?.gain).toBeLessThan(4.8)
        expect(Math.abs(gain?.phase ?? 0)).toBeGreaterThan(170)
    })

    it('chave temporizada: carrega com o botão fechado entre 100 e 500 ms e descarrega depois', async () => {
        const { circuit, voltage, simulation, time } = await run('switch')
        const capacitor = Array.from(voltage('P1'))
        const current   = Array.from(simulation.getProbe('P2').current ?? [])
        const at        = (series: number[], t: number) => series[Array.from(time).findIndex(value => value >= t)]
        const closed    = 5 * 2.2 / 3.2

        expect(circuit.analysis).toMatchObject({ type: 'tran', t0: 0, t1: 2 })
        expect(circuit.deck).toMatch(/PWL\(0 0 0\.1 0 0\.1\d* 1 0\.5\d* 1 0\.5\d* 0\)/)
        expect(Math.abs(at(capacitor, 0.09))).toBeLessThan(1e-3)
        expect(at(capacitor, 0.49)).toBeGreaterThan(closed * 0.99)
        expect(at(capacitor, 0.72) / closed).toBeGreaterThan(Math.exp(-1) * 0.97)
        expect(at(capacitor, 0.72) / closed).toBeLessThan(Math.exp(-1) * 1.03)
        expect(at(current, 0.11)).toBeGreaterThan(4e-3)
        expect(Math.abs(at(current, 0.6))).toBeLessThan(1e-6)
    })
})
