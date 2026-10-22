import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readBundle } from '../src/core/Sketch'
import { fromSketch, removeInstance, WIRE_FLAGS, type Doc } from '../src/core/Document'
import { Netlist } from '../src/core/Netlist'
import { Scene } from '../src/engine/Scene'
import { Clipper } from '../src/core/Clipper'
import { getArtwork } from '../src/core/Cam'
import { checkRules, getGroupOf } from '../src/core/Drc'
import { buildGrid, buildSheetGrid, getPlan, loadRouterWasm, routeGrid, ROUTE_DEFAULTS } from '../src/core/Router'
import { applyPlan } from '../src/engine/Edit'
import type { Library } from '../src/core/Library'
import { HAS_FRITZING, listSketches, loadWasm, makeLibrary, writeReport } from './Fixtures'
import createClipper from '../src/core/Clipper/clipper2.js'

const SAMPLES = ['Knock', 'Amplification', 'AnalogInputPot', 'Button', 'Op-amp', 'Relay', 'Timer', 'Shift_Register', 'LCD', 'Stepper_Motor']
const HOLE    = '0.4mm,0.3mm'

const unrouted = (doc: Doc, library: Library) => Object.values(doc.instances).filter(instance => (instance.moduleIdRef === 'WireModuleID' && (instance.views.pcbView?.geometry.wireFlags ?? 0) & WIRE_FLAGS.pcbView) || library.getPart(instance.moduleIdRef)?.kind === 'via').reduce((current, instance) => removeInstance(current, instance.modelIndex), doc)

describe.skipIf(!HAS_FRITZING)('autorouter de PCB (spec 03 §8)', () => {
    it('roteia exemplos sem trilhas e o resultado passa no DRC', async () => {
        const clipper = new Clipper(await createClipper())
        const wasm    = await loadWasm()
        const router  = await loadRouterWasm(fs.readFileSync(new URL('../src/core/Router/router.wasm', import.meta.url)))
        const library = makeLibrary()
        const report: string[] = []

        for (const file of listSketches(true).filter(file => SAMPLES.includes(path.basename(file, '.fzz')))) {
            const bundle = readBundle(fs.readFileSync(file))
            library.addBundle(bundle)

            const loaded = fromSketch(bundle.sketch ?? { fritzingVersion: '', projectProperties: {}, settings: {}, instances: [] })
            await library.load([...Object.values(loaded.instances).map(instance => instance.moduleIdRef), 'ViaModuleID', 'WireModuleID'])

            const doc     = unrouted(loaded, library)
            const netlist = new Netlist(doc, library, wasm)
            netlist.update()

            const scene   = new Scene(doc, library, 'pcbView')
            const artwork = getArtwork(doc, library, clipper, scene)

            if (!artwork)
                continue

            const started = performance.now()
            const netOf   = (key: string) => netlist.index.has(key) ? netlist.nets.pcbView?.[netlist.index.get(key) ?? 0] ?? null : null
            const subOf   = (key: string) => netlist.index.has(key) ? netlist.routed.pcbView?.[netlist.index.get(key) ?? 0] ?? null : null
            const grid    = buildGrid(clipper, artwork, netOf, subOf, ROUTE_DEFAULTS)
            const pass    = routeGrid(router, grid, ROUTE_DEFAULTS.cycles)
            const plan    = getPlan(grid, pass, artwork.board.frame, key => scene.getTerminal(key))
            const routed  = applyPlan(doc, library, 'pcbView', plan, ROUTE_DEFAULTS.traceWidth, HOLE)
            const elapsed = performance.now() - started

            const after   = new Netlist(routed, library, wasm)
            after.update()

            const status  = after.getStatus('pcbView')
            const result  = getArtwork(routed, library, clipper, new Scene(routed, library, 'pcbView'))
            const before  = checkRules(clipper, artwork, getGroupOf(doc, netlist), ROUTE_DEFAULTS.keepout).length
            const found   = result ? checkRules(clipper, result, getGroupOf(routed, after), ROUTE_DEFAULTS.keepout) : []
            const traces  = found.filter(violation => violation.owners.some(owner => routed.instances[owner]?.moduleIdRef === 'WireModuleID' && !doc.instances[owner]))

            report.push(`${path.basename(file, '.fzz')}: grade ${grid.width}×${grid.height}×${grid.layers}, ${pass.connected}/${pass.requested} ligações, ${pass.vias} vias, ${plan.wires.length} trechos, ${elapsed.toFixed(0)} ms; nets roteadas ${status.routed}/${status.nets}; DRC ${before} → ${found.length} (${traces.length} com trilha nova)`)
            expect(pass.connected).toBeGreaterThan(0)
            expect(status.routed).toBeGreaterThan(0)
            expect(traces.length, path.basename(file)).toBe(0)
            expect(status.routed, path.basename(file)).toBe(status.nets)
        }

        writeReport('router-report.txt', report.join('\n'))
        expect(report.length).toBeGreaterThan(5)
    })

    it('roteia o esquemático dos exemplos sem fios', async () => {
        const wasm    = await loadWasm()
        const router  = await loadRouterWasm(fs.readFileSync(new URL('../src/core/Router/router.wasm', import.meta.url)))
        const library = makeLibrary()
        const report: string[] = []

        for (const file of listSketches(true).filter(file => SAMPLES.includes(path.basename(file, '.fzz')))) {
            const bundle = readBundle(fs.readFileSync(file))
            library.addBundle(bundle)

            const loaded = fromSketch(bundle.sketch ?? { fritzingVersion: '', projectProperties: {}, settings: {}, instances: [] })
            await library.load([...Object.values(loaded.instances).map(instance => instance.moduleIdRef), 'WireModuleID'])

            const doc     = Object.values(loaded.instances).filter(instance => instance.moduleIdRef === 'WireModuleID' && (instance.views.schematicView?.geometry.wireFlags ?? 0) & WIRE_FLAGS.schematicView).reduce((current, instance) => removeInstance(current, instance.modelIndex), loaded)
            const netlist = new Netlist(doc, library, wasm)
            netlist.update()

            const sheet   = new Scene(doc, library, 'schematicView').getSheet()
            const label   = (labels: Uint32Array | undefined, key: string) => netlist.index.has(key) ? labels?.[netlist.index.get(key) ?? 0] ?? null : null
            const started = performance.now()
            const attempt = (step: number) => {
                const built = buildSheetGrid(sheet, key => label(netlist.nets.schematicView, key), key => label(netlist.routed.schematicView, key), step)
                return { ...built, pass: routeGrid(router, built.grid, ROUTE_DEFAULTS.cycles) }
            }
            const whole   = attempt(9)
            const half    = whole.pass.failed.length ? attempt(4.5) : null
            const { grid, frame, pass } = half && half.pass.connected > whole.pass.connected ? half : whole
            const plan    = getPlan(grid, pass, frame, key => Object.fromEntries(sheet.pins)[key] ?? null, ['schematicTrace', 'schematicTrace'])
            const routed  = applyPlan(doc, library, 'schematicView', plan, 9.7222, HOLE)
            const after   = new Netlist(routed, library, wasm)
            after.update()

            const status  = after.getStatus('schematicView')
            report.push(`${path.basename(file, '.fzz')}: grade ${grid.width}×${grid.height} (passo ${grid.step} px), ${pass.connected}/${pass.requested} ligações, ${plan.wires.length} trechos, ${(performance.now() - started).toFixed(0)} ms; nets ${status.routed}/${status.nets}`)
            expect(pass.connected, path.basename(file)).toBe(pass.requested)
            expect(status.routed, path.basename(file)).toBe(status.nets)
        }

        writeReport('router-sheet-report.txt', report.join('\n'))
        expect(report.length).toBeGreaterThan(5)
    })
})
