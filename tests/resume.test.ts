import { describe, expect, it } from 'vitest'
import { emptyDoc, type Doc } from '../src/core/Document'
import { Netlist } from '../src/core/Netlist'
import { VIEWS } from '../src/core/Layer'
import type { Point } from '../src/core/Geometry'
import { buildCircuit, resumeCircuit, shiftSources } from '../src/core/Spice'
import { Ngspice } from '../src/core/Ngspice'
import { Simulation, getInitial, joinRuns } from '../src/engine/Simulation'
import { createInstance, createWire } from '../src/engine/Edit'
import { HAS_FRITZING, loadWasm, makeLibrary } from './Fixtures'
import createNgspice from '../src/workers/Simulator/ngspice/ngspice.js'

type View = typeof VIEWS[number]

const PARTS  = ['DCPulseSourceModuleID', 'ResistorModuleID', 'SmallElectrolyticCapacitorModuleID', 'WireModuleID']
const KEEP   = 120      // PASSO EM QUE O CIRCUITO "MUDA" (t = 3,6 s NA JANELA AUTOMÁTICA DE 12 s, 3 PERÍODOS DO PULSO)
const RELTOL = 1e-3
const VOLTS  = 5        // AMPLITUDE DO PULSO

const everywhere = (point: Point) => Object.fromEntries(VIEWS.map(view => [view, point])) as Record<View, Point>

// RC DE 1 s (10 kΩ, 100 µF) NUM PULSO DE 0 A 5 V COM PERÍODO DE 4 s (2 s EM CIMA)
const setup = async (ohms: string) => {
    const library = makeLibrary()
    await library.load(PARTS)
    const created = PARTS.slice(0, 3).reduce((current, moduleId, i) => createInstance(current, library, moduleId, everywhere([200 * i, 0])), emptyDoc())
    const placed: Doc = { ...created, instances: { ...created.instances, 1: { ...created.instances['1'], properties: { period: '4s', 'pulse width': '2s' } }, 2: { ...created.instances['2'], properties: { resistance: ohms } }, 3: { ...created.instances['3'], properties: { capacitance: '100µF' } } } }
    const wired = [['1/connector1', '2/connector0'], ['2/connector1', '3/connector0'], ['3/connector1', '1/connector0']].reduce((current, [a, b]) => createWire(current, library, 'schematicView', a, b), placed)
    const netlist = new Netlist(wired, library, await loadWasm())
    netlist.update()
    return { library, doc: wired, circuit: buildCircuit(wired, library, netlist, true) }
}

// NÓ DO CAPACITOR QUE NÃO É O TERRA (O "−" DO ELETROLÍTICO PODE SER ESCOLHIDO COMO TERRA, SPEC 04 §2.1)
const capacitorNode = (circuit: { nodes: Map<string, string> }) => ['3/connector0', '3/connector1'].map(key => circuit.nodes.get(key)).find(node => node && node !== '0') ?? ''

const session = async () => {
    const ngspice = new Ngspice(await createNgspice())
    ngspice.setup()
    return ngspice
}

describe.skipIf(!HAS_FRITZING)('continuação do transitório ao mudar o circuito (spec 04 §5.3)', () => {
    it('retomar no passo k com o mesmo circuito reproduz a curva inteira', async () => {
        const { library, doc, circuit } = await setup('10kΩ')
        const ngspice = await session()
        const full    = new Simulation(doc, library, circuit, ngspice.run(circuit.deck).vectors)
        const resumed = resumeCircuit(circuit, getInitial(full, circuit, KEEP), KEEP)
        const run     = ngspice.run(resumed.deck)
        const joined  = joinRuns(full, KEEP, circuit, run.vectors)
        const node    = capacitorNode(circuit)
        const charged = full.getNodeSeries(node)
        const both    = joined[`v(${node})`]

        expect(run.error, resumed.deck).toBeNull()
        expect(resumed.deck).toMatch(/^\.ic v\(\d+\)=/m)
        expect(resumed.deck).toMatch(/\.TRAN \S+ \S+ 0 UIC$/m)
        expect(joined.time).toHaveLength(full.steps)
        joined.time.forEach((t, i) => expect(t).toBeCloseTo(full.vectors.time[i], 9))
        expect(Math.max(...charged) - Math.min(...charged)).toBeGreaterThan(VOLTS / 2)
        expect(Math.max(...Array.from(both, (value, i) => Math.abs(value - charged[i])))).toBeLessThan(RELTOL * VOLTS)
    })

    it('trocar o resistor no meio continua a carga do capacitor de onde estava', async () => {
        const slow    = await setup('10kΩ')
        const fast    = await setup('1kΩ')
        const ngspice = await session()
        const first   = new Simulation(slow.doc, slow.library, slow.circuit, ngspice.run(slow.circuit.deck).vectors)
        const resumed = resumeCircuit(fast.circuit, getInitial(first, fast.circuit, KEEP), KEEP)
        const joined  = joinRuns(first, KEEP, fast.circuit, ngspice.run(resumed.deck).vectors)
        const before  = first.getNodeSeries(capacitorNode(slow.circuit))
        const after   = joined[`v(${capacitorNode(fast.circuit)})`]
        const settle  = (series: ArrayLike<number>, at: number) => Math.abs(series[at] - series[at - 1])

        expect(Math.abs(after[KEEP] - before[KEEP])).toBeLessThan(RELTOL * VOLTS)
        expect(Array.from(after.slice(0, KEEP))).toEqual(Array.from(before.slice(0, KEEP)))
        expect(settle(after, KEEP + 30)).toBeLessThan(settle(before, KEEP + 30))
    })
})

describe('continuação com comutação programada (spec 04 §5.3, §8.10)', () => {
    it('o PWL passa a começar no valor do instante da continuação, com os tempos deslocados', () => {
        const deck = 'VS1_sw sw_S1 0 PWL(0 0 0.1 0 0.101 1 0.5 1 0.501 0)'

        expect(shiftSources(deck, 0.3)).toBe('VS1_sw sw_S1 0 PWL(0 1 0.2 1 0.201 0)')
        expect(shiftSources(deck, 0.1005)).toBe('VS1_sw sw_S1 0 PWL(0 0.5 0.0005 1 0.3995 1 0.4005 0)')
        expect(shiftSources(deck, 0.7)).toBe('VS1_sw sw_S1 0 PWL(0 0)')
    })
})

