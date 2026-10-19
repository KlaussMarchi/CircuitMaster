import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readBundle } from '../src/core/Sketch'
import { fromSketch, keyOf, WIRE_FLAGS } from '../src/core/Document'
import { Scene } from '../src/engine/Scene'
import { HAS_FRITZING, listSketches, makeLibrary } from './Fixtures'

const EXACT = 0.01
const NEAR  = 0.5
const VIEWS = ['breadboardView', 'schematicView'] as const

describe.skipIf(!HAS_FRITZING)('ancoragem de pinos nos sketches de exemplo (spec 01 §10)', () => {
    it('as pontas de fio coincidem com os pontos terminais calculados', async () => {
        const library = makeLibrary()
        const counts  = Object.fromEntries(VIEWS.map(view => [view, { exact: 0, near: 0, fail: 0, missing: 0 }]))

        for (const file of listSketches(true)) {
            const bundle = readBundle(fs.readFileSync(file))

            if (!bundle.sketch)
                continue

            library.addBundle(bundle)
            const doc = fromSketch(bundle.sketch)
            await library.load(Object.values(doc.instances).map(instance => instance.moduleIdRef))

            for (const view of VIEWS) {
                const scene = new Scene(doc, library, view)
                const wires = Object.values(doc.instances).filter(instance => instance.moduleIdRef === 'WireModuleID' && (instance.views[view]?.geometry.wireFlags ?? 0) & WIRE_FLAGS[view])

                for (const wire of wires) {
                    const ends = scene.getWireEnds(wire.modelIndex)

                    for (const connector of wire.views[view]?.connectors ?? []) {
                        const end = ends?.[connector.id === 'connector0' ? 0 : 1]

                        for (const connect of connector.connects) {
                            const target = doc.instances[connect.modelIndex]

                            if (!end || !target || target.moduleIdRef === 'WireModuleID' || !library.getPart(target.moduleIdRef))
                                continue

                            const point    = scene.getTerminal(keyOf(connect.modelIndex, connect.connectorId))
                            const distance = point ? Math.hypot(point[0] - end[0], point[1] - end[1]) : Infinity
                            const bucket   = !point ? 'missing' : distance <= EXACT ? 'exact' : distance <= NEAR ? 'near' : 'fail'
                            counts[view][bucket] += 1
                        }
                    }
                }
            }
        }

        fs.writeFileSync(new URL('../build/anchors-report.json', import.meta.url), JSON.stringify(counts))
        expect(counts.breadboardView.exact).toBeGreaterThanOrEqual(2100)
        expect(counts.schematicView.exact).toBeGreaterThanOrEqual(2466)
        expect(counts.schematicView.fail).toBeLessThanOrEqual(5)
    })
})
