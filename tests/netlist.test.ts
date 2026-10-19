import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readBundle, type Sketch } from '../src/core/Sketch'
import { fromSketch } from '../src/core/Document'
import { Netlist } from '../src/core/Netlist'
import { VIEWS } from '../src/core/Layer'
import { Scene } from '../src/engine/Scene'
import { HAS_FRITZING, listSketches, loadWasm, makeLibrary } from './Fixtures'

const onlyView = (sketch: Sketch, view: typeof VIEWS[number]): Sketch => ({ ...sketch, instances: sketch.instances.map(instance => ({ ...instance, views: Object.fromEntries(Object.entries(instance.views).map(([name, state]) => [name, name === view ? state : { ...state, connectors: state.connectors.map(connector => ({ ...connector, connects: [] })) }])) })) })

const samePartition = (a: Uint32Array, b: Uint32Array) => {
    const forward = new Map<number, number>()
    const back    = new Map<number, number>()

    for (let i = 0; i < a.length; i++) {
        if ((forward.get(a[i]) ?? b[i]) !== b[i] || (back.get(b[i]) ?? a[i]) !== a[i])
            return false

        forward.set(a[i], b[i])
        back.set(b[i], a[i])
    }

    return a.length === b.length
}

describe.skipIf(!HAS_FRITZING)('netlist unificado (spec 02 §2.3, §9)', () => {
    it('a projeção por vista reproduz as conexões gravadas em cada vista', async () => {
        const wasm    = await loadWasm()
        const library = makeLibrary()
        const result  = { same: 0, different: [] as string[] }

        for (const file of listSketches(false)) {
            const bundle = readBundle(fs.readFileSync(file))

            if (!bundle.sketch)
                continue

            library.addBundle(bundle)
            const unified = new Netlist(fromSketch(bundle.sketch), library, wasm)
            await library.load(Object.values(unified.doc.instances).map(instance => instance.moduleIdRef))
            unified.update()

            const equal = VIEWS.every(view => {
                const single = new Netlist(fromSketch(onlyView(bundle.sketch as Sketch, view)), library, wasm)
                single.update()
                return samePartition(unified.nets[view] ?? new Uint32Array(), single.nets[view] ?? new Uint32Array())
            })

            if (equal)
                result.same += 1
            else
                result.different.push(file.split('/').pop() ?? file)
        }

        console.log('topologia', JSON.stringify(result))
        expect(result.same).toBeGreaterThanOrEqual(119)
    })

    it('o ratsnest de cada vista tem uma linha por conexão pendente', async () => {
        const wasm    = await loadWasm()
        const library = makeLibrary()
        const totals  = Object.fromEntries(VIEWS.map(view => [view, { nets: 0, left: 0, ratsnest: 0 }]))

        for (const file of listSketches(true)) {
            const bundle = readBundle(fs.readFileSync(file))

            if (!bundle.sketch)
                continue

            library.addBundle(bundle)
            const doc = fromSketch(bundle.sketch)
            await library.load(Object.values(doc.instances).map(instance => instance.moduleIdRef))

            const netlist = new Netlist(doc, library, wasm)
            netlist.update()

            for (const view of VIEWS) {
                const scene  = new Scene(doc, library, view)
                const status = netlist.getStatus(view)
                totals[view].nets     += status.nets
                totals[view].left     += status.left
                totals[view].ratsnest += netlist.getRatsnest(view, key => scene.getTerminal(key)).length
            }
        }

        console.log('roteamento', JSON.stringify(totals))
        VIEWS.forEach(view => expect(totals[view].ratsnest).toBe(totals[view].left))
        expect(totals.pcbView.left).toBeGreaterThan(0)
    })
})
