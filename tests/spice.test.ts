import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { emptyDoc, fromSketch, keyOf, type Doc } from '../src/core/Document'
import { readBundle } from '../src/core/Sketch'
import { Netlist } from '../src/core/Netlist'
import { VIEWS } from '../src/core/Layer'
import type { Point } from '../src/core/Geometry'
import { buildCircuit, substitute } from '../src/core/Spice'
import { Ngspice, type Vectors } from '../src/core/Ngspice'
import { Simulation, toDisplay } from '../src/engine/Simulation'
import { createInstance, createWire } from '../src/engine/Edit'
import { ROOTS } from '../tools/Fritzing'
import { HAS_FRITZING, loadWasm, makeLibrary } from './Fixtures'
import createNgspice from '../src/workers/Simulator/ngspice/ngspice.js'

type View = typeof VIEWS[number]

const SIMULATOR   = path.join(ROOTS.sketches, 'core/Simulator/EN')
const NATIVE      = process.env.NGSPICE ?? path.join(import.meta.dirname, '../build/ngspice-native/src/ngspice')
const XSPICE      = process.env.NGSPICE_XSPICE ?? path.join(import.meta.dirname, '../build/ngspice-xspice/src/ngspice')
const ANALOG      = path.join(path.dirname(XSPICE), '../codemodels/analog.cm')
const LOADS       = ['0.1Ω', '10Ω', '100Ω', '120Ω', '1kΩ']    // LIMITANDO A CORRENTE (ATÉ 120 Ω) E REGULANDO A TENSÃO
const RELTOL      = 1e-3      // reltol PADRÃO DO NGSPICE, APLICADO À ESCALA CHEIA DO CIRCUITO
const PERIOD_TOL  = 0.01      // OSCILADOR: A LIBM DIFERENTE DESLOCA A FASE AOS POUCOS; O INTERVALO MÉDIO ENTRE BORDAS TEM DE BATER
const OSCILLATORS = ['trans/555_IC_astable.fzz', 'trans/flipflop_led_flashing_circuit.fzz']

const everywhere = (point: Point) => Object.fromEntries(VIEWS.map(view => [view, point])) as Record<View, Point>

const session = async () => {
    const ngspice = new Ngspice(await createNgspice())
    ngspice.setup()
    return ngspice
}

const getSketches = async (library: ReturnType<typeof makeLibrary>) => {
    const wasm  = await loadWasm()
    const files = [...fs.readdirSync(SIMULATOR).filter(name => name.endsWith('.fzz')), ...fs.readdirSync(path.join(SIMULATOR, 'trans')).map(name => `trans/${name}`)]
    const found = []

    for (const file of files) {
        const bundle = readBundle(fs.readFileSync(path.join(SIMULATOR, file)))
        library.addBundle(bundle)
        const doc = fromSketch(bundle.sketch ?? { fritzingVersion: '', projectProperties: {}, settings: {}, instances: [] })
        await library.load(['WireModuleID', ...Object.values(doc.instances).map(instance => instance.moduleIdRef)])

        const netlist = new Netlist(doc, library, wasm)
        netlist.update()
        found.push({ file, doc, circuit: buildCircuit(doc, library, netlist, file.startsWith('trans/')) })
    }

    return found
}

// RAWFILE BINÁRIO DE UM PLOT: CABEÇALHO EM TEXTO ATÉ "Binary:", DEPOIS UM double POR VARIÁVEL EM CADA PONTO. NO LOTE ELE É GRAVADO EM
// FLUXO: No. Points FICA COM A ESTIMATIVA E UM PASSO REJEITADO REGRAVA O INSTANTE; COMO NO PLOT EM MEMÓRIA, VALE A ÚLTIMA GRAVAÇÃO
const readRaw = (bytes: Buffer): Vectors => {
    const start  = bytes.indexOf('Binary:\n') + 'Binary:\n'.length
    const header = bytes.subarray(0, start).toString('latin1')
    const count  = Number(header.match(/No\. Variables:\s*(\d+)/)?.[1])
    const names  = header.split('Variables:\n')[1].split('\n').slice(0, count).map(line => line.trim().split(/\s+/)[1].toLowerCase())
    const points = Math.floor((bytes.length - start) / (8 * count))
    const data   = new Float64Array(bytes.buffer.slice(bytes.byteOffset + start, bytes.byteOffset + start + 8 * count * points))
    const time   = names[0] === 'time' ? Array.from({ length: points }, (_, p) => data[p * count]) : null
    const kept: number[] = []

    for (let p = points - 1; p >= 0; p--)
        if (!time || !kept.length || time[p] < time[kept[0]])
            kept.unshift(p)

    return Object.fromEntries(names.map((name, v) => [name, Float64Array.from(kept, p => data[p * count + v])]))
}

const runNative = (deck: string) => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ngspice-'))
    fs.writeFileSync(path.join(folder, 'deck.cir'), deck)
    execFileSync(NATIVE, ['-b', '-r', path.join(folder, 'out.raw'), path.join(folder, 'deck.cir')], { stdio: 'pipe' })
    const vectors = readRaw(fs.readFileSync(path.join(folder, 'out.raw')))
    fs.rmSync(folder, { recursive: true })
    return vectors
}

// PONTO DE OPERAÇÃO NO NGSPICE NATIVO COM XSPICE E O CODE MODEL analog, GRAVADO EM RAWFILE; ESTE BUILD CAI AO DESTRUIR O CIRCUITO NA SAÍDA, DEPOIS DE GRAVAR, ENTÃO O CÓDIGO DE SAÍDA NÃO CONTA
const runXspice = (deck: string) => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'xspice-'))
    const runner = ['* runner', '.control', `codemodel ${ANALOG}`, `source ${path.join(folder, 'deck.cir')}`, 'op', `write ${path.join(folder, 'out.raw')}`, '.endc', '.end'].join('\n')
    fs.writeFileSync(path.join(folder, 'deck.cir'), deck)
    fs.writeFileSync(path.join(folder, 'runner.sp'), runner)
    spawnSync(XSPICE, ['-b', path.join(folder, 'runner.sp')], { stdio: 'ignore' })
    const vectors = fs.existsSync(path.join(folder, 'out.raw')) ? readRaw(fs.readFileSync(path.join(folder, 'out.raw'))) : {}
    fs.rmSync(folder, { recursive: true })
    return vectors
}

// NOME DO VETOR DA API COMPARTILHADA NA GRAFIA DO RAWFILE: CORRENTES COMO i(...), TODO NÓ COMO v(...)
const rawName = (name: string) => name === 'time'           ? name :
                                  name.startsWith('@')      ? `i(${name})` :
                                  name.endsWith('#branch')  ? `i(${name.slice(0, -'#branch'.length)})` :
                                  name.startsWith('v(')     ? name : `v(${name})`

const peak = (v: Float64Array) => v.reduce((a, b) => Math.max(a, Math.abs(b)), 0)

// MAIOR DIFERENÇA EM UNIDADES DE reltol DA ESCALA CHEIA, COMO NUM OSCILOSCÓPIO COM TODOS OS CANAIS NA MESMA ESCALA: NÓ QUASE FLUTUANTE
// (1 GΩ AO TERRA) TEM TENSÃO DE RUÍDO QUE MUDA COM O ulp, E ISSO NÃO É DIFERENÇA DO SIMULADOR
const scaleError = (a: Float64Array, b: Float64Array, scale: number) => a.reduce((worst, value, i) => Math.max(worst, Math.abs(value - b[i]) / (RELTOL * scale || Number.MIN_VALUE)), a.length === b.length ? 0 : Infinity)

const swing = (v: Float64Array) => v.reduce((a, b) => Math.max(a, b), -Infinity) - v.reduce((a, b) => Math.min(a, b), Infinity)

// INSTANTES, INTERPOLADOS, EM QUE v CRUZA mid NOS DOIS SENTIDOS
const getEdges = (time: Float64Array, v: Float64Array, mid: number) => Array.from(v.subarray(1), (value, i) => (v[i] < mid) !== (value < mid) ? time[i] + (mid - v[i]) / (value - v[i]) * (time[i + 1] - time[i]) : NaN).filter(Number.isFinite)

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

    it('fonte de bancada: ilimit trocado por fontes B, tensão constante e corrente limitada (spec 04 §10.1)', async () => {
        const library = makeLibrary()
        const parts   = ['1_LabDCPowerSupplyModuleID', 'ResistorModuleID', 'WireModuleID']
        await library.load(parts)

        const simulate = async (ohms: string) => {
            const created = parts.slice(0, 2).reduce((current, moduleId, i) => createInstance(current, library, moduleId, everywhere([300 * i, 0])), emptyDoc())
            const placed: Doc = { ...created, instances: { ...created.instances, 2: { ...created.instances['2'], properties: { resistance: ohms } } } }
            const wired   = [['1/connector0', '2/connector0'], ['2/connector1', '1/connector1']].reduce((current, [a, b]) => createWire(current, library, 'schematicView', a, b), placed)
            const netlist = new Netlist(wired, library, await loadWasm())
            netlist.update()

            const circuit = buildCircuit(wired, library, netlist, false)
            const result  = (await session()).run(circuit.deck)
            return { circuit, result, sim: new Simulation(wired, library, circuit, result.vectors) }
        }

        const light = await simulate('1kΩ')
        const heavy = await simulate('10Ω')

        expect(light.circuit.deck).not.toMatch(/ilimit|^A/im)
        expect(light.circuit.deck).toMatch(/^B\S+p /m)
        expect(light.result.error, light.circuit.deck).toBeNull()
        expect(light.sim.getBetween('1/connector0', '1/connector1', 0)).toBeCloseTo(12 * 1000 / 1001, 2)
        expect(-light.sim.getCurrent('1', 0)).toBeCloseTo(12 / 1001, 4)
        expect(heavy.result.error).toBeNull()
        expect(-heavy.sim.getCurrent('1', 0)).toBeCloseTo(0.1, 4)
        expect(heavy.sim.getBetween('1/connector0', '1/connector1', 0)).toBeCloseTo(1, 2)
        expect(heavy.sim.getEffect('1', 0).display).toEqual([toDisplay(heavy.sim.getBetween('1/connector0', '1/connector1', 0)), toDisplay(-heavy.sim.getCurrent('1', 0))])
    })

    it.skipIf(!fs.existsSync(XSPICE) || !fs.existsSync(ANALOG))('fonte de bancada: as fontes B reproduzem o ilimit do XSPICE nativo (spec 04 §10.1)', async () => {
        const library = makeLibrary()
        const parts   = ['1_LabDCPowerSupplyModuleID', 'ResistorModuleID', 'WireModuleID']
        await library.load(parts)

        for (const ohms of LOADS) {
            const created = parts.slice(0, 2).reduce((current, moduleId, i) => createInstance(current, library, moduleId, everywhere([300 * i, 0])), emptyDoc())
            const placed: Doc = { ...created, instances: { ...created.instances, 2: { ...created.instances['2'], properties: { resistance: ohms } } } }
            const wired   = [['1/connector0', '2/connector0'], ['2/connector1', '1/connector1']].reduce((current, [a, b]) => createWire(current, library, 'schematicView', a, b), placed)
            const netlist = new Netlist(wired, library, await loadWasm())
            netlist.update()

            const circuit = buildCircuit(wired, library, netlist, false)
            const wasm    = (await session()).run(circuit.deck).vectors
            const native  = runXspice(circuit.source)
            const names   = Object.keys(wasm).filter(name => (name.startsWith('v(') || /^\d+$/.test(name) || name.endsWith('#branch')) && native[rawName(name)])

            expect(circuit.source).toMatch(/^A\S+ .* ilimit|^\.model \S+ ilimit/im)
            expect(names.length, ohms).toBeGreaterThan(2)
            names.forEach(name => expect(Math.abs(wasm[name][0] - native[rawName(name)][0]), `${ohms} ${name}`).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(native[rawName(name)][0]))))
        }
    })

    it('os 12 sketches de simulação do Fritzing geram deck que o ngspice aceita', async () => {
        const library = makeLibrary()
        const ngspice = await session()
        const report: string[] = []

        for (const { file, doc, circuit } of await getSketches(library)) {
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

    // BIT A BIT NÃO É GARANTIDO: A LIBM DO EMSCRIPTEN (musl) DIFERE DA glibc EM 1–2 ulp EM exp, pow, sin, cos, tanh, atan... (SPEC 04 §11)
    it.skipIf(!fs.existsSync(NATIVE))('ngspice WASM reproduz o nativo nos mesmos decks (spec 04 §11 item 3)', async () => {
        const library = makeLibrary()
        const ngspice = await session()
        const report: string[] = []

        for (const { file, circuit } of (await getSketches(library)).filter(({ circuit }) => circuit.simulated.length)) {
            const wasm      = Object.fromEntries(Object.entries(ngspice.run(circuit.deck).vectors).map(([name, vector]) => [rawName(name), vector]))
            const native    = runNative(circuit.deck)
            const names     = Object.keys(native)
            const oscillate = OSCILLATORS.includes(file)
            const span      = (vector: Float64Array) => oscillate ? vector.subarray(0, 1) : vector
            const scales    = Object.fromEntries(['v(', 'i(', 'ti'].map(kind => [kind, Math.max(0, ...names.filter(name => name.slice(0, 2) === kind).map(name => peak(native[name])))]))
            const worst     = names.map(name => [name, scaleError(span(wasm[name] ?? new Float64Array()), span(native[name]), scales[name.slice(0, 2)])] as const).reduce((a, b) => b[1] > a[1] ? b : a)
            const identical = names.every(name => wasm[name]?.length === native[name].length && wasm[name].every((value, i) => value === native[name][i]))
            const node      = names.filter(name => name.startsWith('v(')).sort((a, b) => swing(native[b]) - swing(native[a]))[0]
            const mid       = (native[node].reduce((a, b) => Math.max(a, b)) + native[node].reduce((a, b) => Math.min(a, b))) / 2
            const edges     = oscillate ? [getEdges(wasm.time, wasm[node], mid), getEdges(native.time, native[node], mid)] : [[], []]
            const gaps      = edges.map(list => (list[list.length - 1] - list[0]) / (list.length - 1))
            const drift     = Math.abs(gaps[0] - gaps[1]) / gaps[1]
            const shift     = edges[1].reduce((worst, edge, i) => Math.max(worst, Math.abs(edge - edges[0][i])), 0)
            const phase     = oscillate ? `; ${edges[1].length} bordas em ${node}, intervalo médio ${(1000 * gaps[1]).toFixed(3)} ms com diferença de ${(100 * drift).toFixed(4)}%, deslocamento acumulado ${(1000 * shift).toFixed(3)} ms` : ''

            const match     = identical    ? 'idênticos bit a bit' :
                              worst[1] === 0 ? 'ponto inicial idêntico bit a bit' : `maior diferença ${(100 * RELTOL * worst[1]).toFixed(5)}% da escala cheia em ${worst[0]}${oscillate ? ' no ponto inicial' : ''}`

            report.push(`${file}: ${names.length} vetores × ${native[names[0]].length} pontos; ${match}${phase}`)
            expect([...names].sort(), file).toEqual(Object.keys(wasm).sort())
            expect(worst[1], `${file} ${worst[0]}`).toBeLessThanOrEqual(1)

            if (oscillate) {
                expect(edges[1].length, `${file} ${node}`).toBeGreaterThanOrEqual(2)
                expect(edges[0].length, `${file} ${node}`).toBe(edges[1].length)
                expect(drift, `${file} ${node}`).toBeLessThan(PERIOD_TOL)
            }
        }

        fs.writeFileSync(path.join(import.meta.dirname, '../build/ngspice-native-report.txt'), report.join('\n'))
    })
})
