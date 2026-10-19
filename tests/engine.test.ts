import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readBundle } from '../src/core/Sketch'
import { emptyDoc, fromSketch, keyOf } from '../src/core/Document'
import { Netlist } from '../src/core/Netlist'
import { VIEWS } from '../src/core/Layer'
import { parseXml, walk } from '../src/core/Xml'
import type { Point } from '../src/core/Geometry'
import { Scene } from '../src/engine/Scene'
import { createInstance, createWire, moveInstances, rotateInstances, snapConnections } from '../src/engine/Edit'
import { getDrawing, getImageText } from '../src/engine/Drawing'
import { HAS_FRITZING, listSketches, loadWasm, makeLibrary } from './Fixtures'

type View = typeof VIEWS[number]

const RESISTOR   = 'ResistorModuleID'
const BREADBOARD = 'BreadboardModuleID'
const WIRE       = 'WireModuleID'

const everywhere = (point: Point) => Object.fromEntries(VIEWS.map(view => [view, point])) as Record<View, Point>

const distance = (a: Point | null, b: Point | null) => a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : Infinity

describe.skipIf(!HAS_FRITZING)('motor de cena e desenho', () => {
    it('desenha toda peça visível com SVG e todo ratsnest dos exemplos', async () => {
        const wasm    = await loadWasm()
        const library = makeLibrary()
        const totals  = { shown: 0, drawn: 0, missing: 0, ratsnest: 0, legs: 0, leftLegs: 0 }

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
                const scene   = new Scene(doc, library, view)
                const shown   = Object.values(doc.instances).filter(instance => scene.isShown(instance))
                const drawing = getDrawing(scene, netlist)
                const parts   = drawing.items.filter(item => item.type === 'part')
                totals.shown    += shown.length
                totals.drawn    += new Set(drawing.items.map(item => item.modelIndex)).size
                totals.missing  += shown.filter(instance => !scene.isWire(instance.modelIndex) && !library.getSvg(instance.moduleIdRef, view)).length
                totals.ratsnest += drawing.ratsnest.length
                totals.legs     += parts.reduce((sum, item) => sum + item.legs.length, 0)

                expect(drawing.items.every(item => item.type === 'wire' ? !item.d.includes('NaN') : item.type === 'note' ? Number.isFinite(item.x + item.y + item.width + item.height) : item.matrix.every(Number.isFinite))).toBe(true)
                expect(drawing.ratsnest.length).toBe(netlist.getRatsnest(view, key => scene.getTerminal(key)).length)

                for (const item of parts.filter(part => part.legs.length)) {
                    const part = library.getPart(item.moduleId)
                    const svg  = library.getSvg(item.moduleId, view)
                    const legs = new Set(part?.connectors.flatMap(connector => (connector.views.breadboardView ?? []).map(pin => pin.legId)).filter(Boolean))
                    let left   = 0

                    walk(parseXml(part && svg ? getImageText(part, svg, view) : ''), element => {
                        left += legs.has(element.getAttribute('id') ?? '') ? 1 : 0
                    })
                    totals.leftLegs += left
                }
            }
        }

        console.log('desenho', JSON.stringify(totals))
        expect(totals.drawn).toBe(totals.shown - totals.missing)
        expect(totals.legs).toBeGreaterThan(0)
        expect(totals.leftLegs).toBe(0)
    })

    it('cria a peça centrada no ponto em cada vista e quatro giros de 90° voltam ao início', async () => {
        const library = makeLibrary()
        await library.load([RESISTOR])

        const doc = createInstance(emptyDoc(), library, RESISTOR, everywhere([100, 200]))
        const key = keyOf('1', 'connector0')

        for (const view of VIEWS) {
            const bounds = new Scene(doc, library, view).getBounds('1')
            expect(bounds && distance([(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2], [100, 200])).toBeLessThan(1e-9)

            const once  = rotateInstances(doc, library, view, ['1'], 90)
            const half  = rotateInstances(once, library, view, ['1'], 90)
            const full  = [90, 90].reduce((current, degrees) => rotateInstances(current, library, view, ['1'], degrees), half)
            const start = new Scene(doc, library, view).getTerminal(key)
            const flip  = new Scene(half, library, view).getTerminal(key)

            expect(distance(new Scene(full, library, view).getTerminal(key), start)).toBeLessThan(1e-9)
            expect(distance(flip, start && [200 - start[0], 400 - start[1]])).toBeLessThan(1e-9)
        }
    })

    it('fio criado numa vista vira net nas três e ratsnest nas outras duas', async () => {
        const wasm    = await loadWasm()
        const library = makeLibrary()
        await library.load([RESISTOR, WIRE])

        const placed  = [[0, 0], [300, 0]].reduce((current, point) => createInstance(current, library, RESISTOR, everywhere(point as Point)), emptyDoc())
        const doc     = createWire(placed, library, 'breadboardView', keyOf('1', 'connector1'), keyOf('2', 'connector0'))
        const netlist = new Netlist(doc, library, wasm)
        netlist.update()

        for (const view of VIEWS) {
            const scene = new Scene(doc, library, view)
            expect(netlist.getNet(view, keyOf('1', 'connector1'))).toContain(keyOf('2', 'connector0'))
            expect(getDrawing(scene, netlist).ratsnest.length).toBe(view === 'breadboardView' ? 0 : 1)
        }

        const moved = moveInstances(doc, library, 'breadboardView', ['2'], 45, 9)
        const scene = new Scene(moved, library, 'breadboardView')
        const ends  = scene.getWireEnds('3')
        expect(distance(ends?.[1] ?? null, scene.getTerminal(keyOf('2', 'connector0')))).toBeLessThan(1e-9)
    })

    it('soltar a ponta da perna sobre um furo da protoboard conecta', async () => {
        const library = makeLibrary()
        await library.load([RESISTOR, BREADBOARD])

        const base    = createInstance(createInstance(emptyDoc(), library, BREADBOARD, everywhere([0, 0])), library, RESISTOR, everywhere([0, -200]))
        const scene   = new Scene(base, library, 'breadboardView')
        const hole    = scene.getKeys('1').map(key => [key, scene.getTerminal(key)] as const).find(([, point]) => point && point[0] > 0 && point[1] > 0)
        const leg     = scene.getTerminal(keyOf('2', 'connector0'))
        const dx      = (hole?.[1]?.[0] ?? 0) - (leg?.[0] ?? 0)
        const dy      = (hole?.[1]?.[1] ?? 0) - (leg?.[1] ?? 0)
        const snapped = snapConnections(moveInstances(base, library, 'breadboardView', ['2'], dx, dy), library, ['2'])

        expect(snapped.edges.map(edge => edge.join('|'))).toContain([hole?.[0] ?? '', keyOf('2', 'connector0')].sort().join('|'))
    })
})
