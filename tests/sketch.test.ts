import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { exportBundle, exportSketch, readBundle, readSketch, type Instance, exportBin, exportBinBundle, readBin, OversizedBundle } from '../src/core/Sketch'
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

describe('bins .fzb/.fzbz (spec 01 §6.3)', () => {
    it('grava e relê o bin com as peças na ordem e o pacote com os arquivos', () => {
        const ids    = ['ResistorModuleID', 'LEDModuleID & <x>', '3mmColorLEDModuleID']
        const files  = [{ name: 'part.custom.fzp', text: '<module moduleId="custom"/>' }]
        const bin    = readBin(exportBin('Meus itens', ids))
        const bundle = readBundle(exportBinBundle('Meus itens', ids, files))

        expect(bin?.title).toBe('Meus itens')
        expect(bin?.entries.map(entry => entry.moduleIdRef)).toEqual(ids)
        expect(bundle.bin?.entries.map(entry => entry.moduleIdRef)).toEqual(ids)
        expect(bundle.parts.map(file => file.name)).toEqual(['part.custom.fzp'])
    })
})

// MUDA O TAMANHO DESCOMPACTADO DECLARADO NOS CABEÇALHOS LOCAL E CENTRAL DO ZIP
const declare = (zip: Uint8Array, size: number) => {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)

    for (let i = 0; i < zip.length - 4; i++) {
        if (view.getUint32(i, true) === 0x04034b50)
            view.setUint32(i + 22, size, true)

        if (view.getUint32(i, true) === 0x02014b50)
            view.setUint32(i + 24, size, true)
    }

    return zip
}

describe('pacote como fronteira de confiança (fase 1, seção 7)', () => {
    it('zip que declara mais de 256 MB descompactados é recusado antes de descompactar', () => {
        const bomb = declare(zipSync({ 'bomba.fz': new Uint8Array(1024) }), 300 * 1024 ** 2)
        expect(() => readBundle(bomb)).toThrow(OversizedBundle)
    })

    it('zip com mais de 20.000 arquivos é recusado; o pacote normal passa', () => {
        const many = zipSync(Object.fromEntries(Array.from({ length: 20001 }, (_, i) => [`svg.${i}.svg`, new Uint8Array(1)])))
        const fine = zipSync({ 'ok.fz': strToU8('<module/>'), 'part.a.fzp': strToU8('<module moduleId="a"/>') })
        expect(() => readBundle(many)).toThrow(/20000 arquivos/)
        expect(readBundle(fine).parts.map(file => file.name)).toEqual(['part.a.fzp'])
    })

    it('zip que mente o tamanho para menos sai truncado, sem crescer a memória', () => {
        const liar = declare(zipSync({ 'grande.svg': new Uint8Array(8 * 1024 ** 2) }, { level: 9 }), 10)
        expect(readBundle(liar).others).toEqual(['grande.svg'])
        expect(unzipSync(liar)['grande.svg'].length).toBe(10)
    })
})
