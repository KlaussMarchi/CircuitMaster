import { describe, expect, it } from 'vitest'
import { emptyDoc, fromSketch, keyOf, type Doc, type Probe } from '../src/core/Document'
import { exportSketch, readSketch } from '../src/core/Sketch'
import { Netlist } from '../src/core/Netlist'
import { VIEWS } from '../src/core/Layer'
import type { Point } from '../src/core/Geometry'
import { buildCircuit } from '../src/core/Spice'
import { Ngspice } from '../src/core/Ngspice'
import { Simulation, getStats } from '../src/engine/Simulation'
import { createInstance, createWire } from '../src/engine/Edit'
import { HAS_FRITZING, loadWasm, makeLibrary } from './Fixtures'
import createNgspice from '../src/workers/Simulator/ngspice/ngspice.js'

type View = typeof VIEWS[number]

const PARTS = ['77c36646df552e9fe72f360837f556ccleg', 'ResistorModuleID', 'LED-genedb611bf8177f41ac9c325217070f0c62ColorLEDModuleID', 'WireModuleID']

const everywhere = (point: Point) => Object.fromEntries(VIEWS.map(view => [view, point])) as Record<View, Point>

const probe = (id: string, kind: Probe['kind'], key: string, flip = false): Probe => ({ id, kind, view: 'schematicView', key, t: 0.5, offset: [8, -14], flip })

// BATERIA 9 V → 470 Ω → LED → BATERIA; FIOS 4 (BATERIA-R), 5 (R-LED) E 6 (LED-BATERIA)
const setup = async () => {
    const library = makeLibrary()
    await library.load(PARTS)
    const created = PARTS.slice(0, 3).reduce((current, moduleId, i) => createInstance(current, library, moduleId, everywhere([200 * i, 0])), emptyDoc())
    const placed: Doc = { ...created, instances: { ...created.instances, 2: { ...created.instances['2'], properties: { resistance: '470Ω' } } } }
    const wired = [['1/connector1', '2/connector0'], ['2/connector1', '3/connector1'], ['3/connector0', '1/connector0']].reduce((current, [a, b]) => createWire(current, library, 'schematicView', a, b), placed)
    return { library, doc: wired, wasm: await loadWasm() }
}

const simulate = async (doc: Doc, library: ReturnType<typeof makeLibrary>, wasm: Awaited<ReturnType<typeof loadWasm>>) => {
    const netlist = new Netlist(doc, library, wasm)
    netlist.update()
    const circuit = buildCircuit(doc, library, netlist, false)
    const ngspice = new Ngspice(await createNgspice())
    ngspice.setup()
    const run = ngspice.run(circuit.deck)
    return { circuit, run, sim: new Simulation(doc, library, circuit, run.vectors) }
}

describe('estatísticas das pontas (spec 04 §8.7)', () => {
    it('senoide: média zero, RMS = A/√2, pico a pico 2A e frequência', () => {
        const time   = Float64Array.from({ length: 2001 }, (_, i) => i * 1e-5)
        const values = time.map(t => 3 * Math.sin(2 * Math.PI * 500 * t))
        const stats  = getStats(values, time, time.length - 1)
        expect(stats.mean).toBeCloseTo(0, 3)
        expect(stats.rms).toBeCloseTo(3 / Math.SQRT2, 2)
        expect(stats.pp).toBeCloseTo(6, 2)
        expect(stats.frequency).toBeCloseTo(500, 0)
    })

    it('nível constante com ruído numérico não tem pico a pico nem frequência', () => {
        const time   = Float64Array.from({ length: 401 }, (_, i) => i * 0.025)
        const values = time.map((_, i) => 2.099 + (i % 2 ? 1e-9 : -1e-9))
        const stats  = getStats(values, time, 400)
        expect(stats.pp).toBe(0)
        expect(stats.frequency).toBeNull()
    })
})

describe.skipIf(!HAS_FRITZING)('pontas de prova no circuito (spec 04 §8.7)', () => {
    it('ficam gravadas no .fz numa propriedade de projeto e voltam iguais', async () => {
        const { doc } = await setup()
        const probes  = [probe('P1', 'voltage', keyOf('5', 'connector0')), probe('P2', 'both', keyOf('3', 'connector1'), true)]
        const text    = exportSketch({ ...doc, probes })
        const back    = fromSketch(readSketch(text) ?? { fritzingVersion: '', projectProperties: {}, settings: {}, instances: [] })

        expect(text).toContain('<circuitmaster_probes value=')
        expect(back.probes).toEqual(probes)
        expect(back.projectProperties.circuitmaster_probes).toBeUndefined()
    })

    it('corrente pelo fio e pelo pino igual à do LED, com o sinal do sentido; tensão igual à da net', async () => {
        const { library, doc, wasm } = await setup()
        const plain  = await simulate(doc, library, wasm)
        const probes = [probe('P1', 'both', keyOf('5', 'connector0')), probe('P2', 'current', keyOf('3', 'connector1')), probe('P3', 'current', keyOf('3', 'connector0')), probe('P4', 'current', keyOf('4', 'connector0'), true)]
        const probed = await simulate({ ...doc, probes }, library, wasm)
        const led    = probed.sim.getCurrent('3', 0)
        const read   = (id: string) => probed.sim.getProbe(id)
        const RELTOL = 1e-3    // AS FONTES DE 0 V MUDAM A MATRIZ: MESMA SOLUÇÃO A MENOS DO reltol DO NGSPICE
        const NEWTON = 1e-5    // @d[id] DO DIODO SAI DA ÚLTIMA ITERAÇÃO, A CORRENTE DE RAMO DA SOLUÇÃO

        expect(probed.run.error, probed.circuit.deck).toBeNull()
        expect(probed.circuit.deck.match(/^Vprobe_P\d \S+ \S+ DC 0$/gm)).toHaveLength(4)
        expect(led).toBeGreaterThan(0.01)
        expect(Math.abs((read('P1').current?.[0] ?? 0) / led - 1)).toBeLessThan(NEWTON)
        expect(Math.abs((read('P2').current?.[0] ?? 0) / led - 1)).toBeLessThan(NEWTON)
        expect(Math.abs((read('P3').current?.[0] ?? 0) / -led - 1)).toBeLessThan(NEWTON)
        expect(Math.abs((read('P4').current?.[0] ?? 0) / -led - 1)).toBeLessThan(NEWTON)
        expect(read('P1').current?.[0]).toBe(read('P2').current?.[0])
        expect(read('P1').voltage?.[0]).toBeCloseTo(probed.sim.getVoltage(keyOf('3', 'connector1'), 0), 9)
        expect(Math.abs(led / plain.sim.getCurrent('3', 0) - 1)).toBeLessThan(RELTOL)
        expect(Math.abs((read('P1').voltage?.[0] ?? 0) / plain.sim.getVoltage(keyOf('3', 'connector1'), 0) - 1)).toBeLessThan(RELTOL)
    })

    it('fio em laço (dois fios em paralelo) não mede corrente e fio solto mede zero', async () => {
        const { library, doc, wasm } = await setup()
        const looped = createWire(doc, library, 'schematicView', '2/connector1', '3/connector1')
        const loose  = createWire(looped, library, 'schematicView', '2/connector0', null, [0, 300])
        const probes = [probe('P1', 'current', keyOf('7', 'connector0')), probe('P2', 'current', keyOf('8', 'connector0'))]
        const result = await simulate({ ...loose, probes }, library, wasm)

        expect(result.run.error, result.circuit.deck).toBeNull()
        expect(result.circuit.meters.get('P1')?.current).toBeNull()
        expect(result.sim.getProbe('P1').current).toBeNull()
        expect(result.sim.getProbe('P2').current?.[0]).toBe(0)
        expect(result.sim.getProbe('P2').voltage?.[0]).toBeGreaterThan(8)
    })
})
