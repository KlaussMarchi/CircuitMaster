import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { exportBundle, exportSketch, readBundle, readSketch, type Instance } from '../src/core/Sketch'
import { fromSketch } from '../src/core/Document'
import { VIEWS } from '../src/core/Layer'
import { HAS_FRITZING, listSketches } from './Fixtures'

const comparable = (instance: Instance) => ({
    moduleIdRef: instance.moduleIdRef,
    title: instance.title,
    text: instance.text,
    properties: instance.properties,
    localConnectors: instance.localConnectors,
    views: Object.fromEntries(VIEWS.flatMap(view => {
        const state = instance.views[view]
        return state ? [[view, { ...state, connectors: state.connectors.filter(connector => connector.leg || connector.groundFillSeed).map(connector => ({ id: connector.id, x: connector.x, y: connector.y, leg: connector.leg, seed: connector.groundFillSeed })).sort((a, b) => a.id.localeCompare(b.id)) }]] : []
    }))
})

describe.skipIf(!HAS_FRITZING)('gravação .fz/.fzz (spec 01 §5, §6; spec 02 §7.3)', () => {
    it('ida e volta nos sketches de exemplo preserva instâncias, geometria e conexões', () => {
        let checked = 0

        for (const file of listSketches(false)) {
            const sketch = readBundle(fs.readFileSync(file)).sketch

            if (!sketch)
                continue

            const before = fromSketch(sketch)
            const after  = fromSketch(readSketch(exportSketch(before)) ?? sketch)
            const edges  = (doc: typeof before) => doc.edges.map(edge => edge.join('|')).sort()

            expect(Object.keys(after.instances).sort(), file).toEqual(Object.keys(before.instances).sort())
            Object.values(before.instances).forEach(instance => expect(comparable(after.instances[instance.modelIndex]), `${file} ${instance.title}`).toEqual(comparable(instance)))
            expect(edges(after), file).toEqual(edges(before))
            expect(after.settings, file).toEqual(before.settings)
            expect(after.projectProperties, file).toEqual(before.projectProperties)
            checked += 1
        }

        expect(checked).toBeGreaterThan(100)
    })

    it('o .fzz gravado reabre com o mesmo documento e leva os arquivos de peça pedidos', () => {
        const sketch = readBundle(fs.readFileSync(listSketches(true)[0])).sketch
        const doc    = fromSketch(sketch ?? { fritzingVersion: '', projectProperties: {}, settings: {}, instances: [] })
        const bytes  = exportBundle(doc, 'teste', [{ name: 'part.extra.fzp', text: '<module moduleId="x"/>' }])
        const files  = unzipSync(bytes)
        const back   = readBundle(bytes)

        expect(Object.keys(files).sort()).toEqual(['part.extra.fzp', 'teste.fz'])
        expect(strFromU8(files['part.extra.fzp'])).toContain('moduleId="x"')
        expect(Object.keys(fromSketch(back.sketch ?? { fritzingVersion: '', projectProperties: {}, settings: {}, instances: [] }).instances).sort()).toEqual(Object.keys(doc.instances).sort())
    })
})
