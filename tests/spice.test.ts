import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { emptyDoc, fromSketch, keyOf, type Doc } from '../src/core/Document'
import { readBundle } from '../src/core/Sketch'
import { Netlist } from '../src/core/Netlist'
import { VIEWS } from '../src/core/Layer'
import type { Point } from '../src/core/Geometry'
import { buildCircuit, substitute } from '../src/core/Spice'
import { Ngspice } from '../src/core/Ngspice'
import { Simulation, toDisplay } from '../src/engine/Simulation'
import { createInstance, createWire } from '../src/engine/Edit'
import { ROOTS } from '../tools/Fritzing'
import { HAS_FRITZING, loadWasm, makeLibrary } from './Fixtures'
import createNgspice from '../src/workers/Simulator/ngspice/ngspice.js'

type View = typeof VIEWS[number]

const everywhere = (point: Point) => Object.fromEntries(VIEWS.map(view => [view, point])) as Record<View, Point>

const session = async () => {
    const ngspice = new Ngspice(await createNgspice())
    ngspice.setup()
    return ngspice
}

describe('substituição de tokens SPICE (spec 04 §3)', () => {
    const resolve = (values: Record<string, string>) => (token: string, before: string) => {
        if (token === 'instanceTitle')
            return before === 'R' ? '1' : 'R1'

        return token in values ? values[token] : null
    }

    it('prefixo repetido, expressão aninhada e token desconhecido sem laço', () => {
        expect(substitute('R{instanceTitle} {a} {b}', resolve({ a: '1', b: '2' }))).toBe('R1 1 2')
        expect(substitute('B{instanceTitle} DC {{d}<5?3.3*({d}/5):1}', resolve({ d: '50' }))).toBe('BR1 DC {50<5?3.3*(50/5):1}')
        expect(substitute('X {unknown} {a}', resolve({ a: '7' }))).toBe('X {unknown} 7')
    })

    it('toDisplay segue o formato de 5 posições do multímetro', () => {
        expect(toDisplay(9)).toBe(' 9.000')
        expect(toDisplay(0.0302668)).toBe('30.27m')
        expect(toDisplay(4700)).toBe('4.700K')
        expect(toDisplay(1e-15)).toBe(' 0.000')
    })
})

describe.skipIf(!HAS_FRITZING)('simulação com ngspice em WASM (spec 04)', () => {
    it('bateria 9 V + 220 Ω + LED vermelho: deck da spec §4.1 e ponto de operação', async () => {
        const library = makeLibrary()
        const parts   = ['77c36646df552e9fe72f360837f556ccleg', 'ResistorModuleID', 'LED-genedb611bf8177f41ac9c325217070f0c62ColorLEDModuleID', 'WireModuleID']
        await library.load(parts)

        const created = parts.slice(0, 3).reduce((current, moduleId, i) => createInstance(current, library, moduleId, everywhere([200 * i, 0])), emptyDoc())
        const placed: Doc = { ...created, instances: { ...created.instances, 2: { ...created.instances['2'], properties: { resistance: '470Ω' } } } }
        const wired  = [['1/connector1', '2/connector0'], ['2/connector1', '3/connector1'], ['3/connector0', '1/connector0']].reduce((current, [a, b]) => createWire(current, library, 'schematicView', a, b), placed)
        const netlist = new Netlist(wired, library, await loadWasm())
        netlist.update()

        const circuit = buildCircuit(wired, library, netlist, false)
        const result  = (await session()).run(circuit.deck)
        const sim     = new Simulation(wired, library, circuit, result.vectors)

        expect(circuit.deck).toMatch(/^Simulator Netlist\n/)
        expect(circuit.deck).toContain(`${wired.instances['1'].title} `)
        expect(circuit.deck).toContain('.option savecurrents')
        expect(result.error).toBeNull()
        expect(circuit.deck).toContain(' 470\n')
        expect(sim.getCurrent('3', 0)).toBeGreaterThan(0.012)
        expect(sim.getCurrent('3', 0)).toBeLessThan(0.016)
        expect(sim.getBetween(keyOf('3', 'connector1'), keyOf('3', 'connector0'), 0)).toBeGreaterThan(1.5)
        expect(sim.getEffect('3', 0).light).toBeGreaterThan(0)
    })

    it('os 12 sketches de simulação do Fritzing geram deck que o ngspice aceita', async () => {
        const wasm    = await loadWasm()
        const library = makeLibrary()
        const ngspice = await session()
        const folder  = path.join(ROOTS.sketches, 'core/Simulator/EN')
        const files   = [...fs.readdirSync(folder).filter(name => name.endsWith('.fzz')), ...fs.readdirSync(path.join(folder, 'trans')).map(name => `trans/${name}`)]
        const report: string[] = []

        for (const file of files) {
            const bundle = readBundle(fs.readFileSync(path.join(folder, file)))
            library.addBundle(bundle)
            const doc = fromSketch(bundle.sketch ?? { fritzingVersion: '', projectProperties: {}, settings: {}, instances: [] })
            await library.load(['WireModuleID', ...Object.values(doc.instances).map(instance => instance.moduleIdRef)])

            const netlist = new Netlist(doc, library, wasm)
            netlist.update()

            const circuit = buildCircuit(doc, library, netlist, file.startsWith('trans/'))

            if (!circuit.simulated.length) {
                report.push(`${file} sem peças ligadas`)
                continue
            }

            const result  = ngspice.run(circuit.deck)
            const sim     = new Simulation(doc, library, circuit, result.vectors)
            const effects = [...sim.getEffects(sim.steps - 1)]
            const shown   = effects.flatMap(([modelIndex, effect]) => [...effect.display ? [`${doc.instances[modelIndex].title}=[${effect.display.join('|')}]`] : [], ...effect.smoke ? [`${doc.instances[modelIndex].title}:fumaça`] : [], ...effect.light > 0 ? [`${doc.instances[modelIndex].title}:luz ${effect.light.toFixed(2)}`] : [], ...effect.scope ? [`${doc.instances[modelIndex].title}:${effect.scope.breadboardView?.map(trace => trace.points.length).join('/')} pts`] : []])

            report.push(`${file} passos=${sim.steps} erro=${result.error ?? '-'} ${shown.join(' ')}`)
            expect(result.error, `${file}\n${circuit.deck}\n${result.log.join('\n')}`).toBeNull()
        }

        fs.writeFileSync(path.join(import.meta.dirname, '../build/simulator-report.txt'), report.join('\n'))
    })
})
