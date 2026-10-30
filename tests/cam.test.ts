import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readBundle } from '../src/core/Sketch'
import { fromSketch } from '../src/core/Document'
import { Scene } from '../src/engine/Scene'
import { Clipper } from '../src/core/Clipper'
import { getArtwork } from '../src/core/Cam'
import { setPartSide } from '../src/engine/Edit'
import { exportEtchablePdf, exportFabrication } from '../src/core/Gerber'
import { exportBomCsv, exportBomPdf, exportPickAndPlace } from '../src/core/Bom'
import { exportIpc } from '../src/core/Ipc'
import { Netlist } from '../src/core/Netlist'
import { HAS_FRITZING, listSketches, loadWasm, makeLibrary, writeReport } from './Fixtures'
import createClipper from '../src/core/Clipper/clipper2.js'

const SAMPLES = ['Knock', 'Amplification', 'Timer']

const checkGerber = (name: string, text: string) => {
    const defined = new Set([...text.matchAll(/%ADD(\d+)/g)].map(match => match[1]))
    const used    = new Set([...text.matchAll(/^D(\d+)\*$/gm)].map(match => match[1]).filter(code => Number(code) >= 10))
    const defines = text.indexOf('%ADD')
    const first   = text.search(/^D[1-9]\d+\*$/m)

    expect(text, name).toContain('%FSLAX26Y26*%')
    expect(text, name).toContain('%MOIN*%')
    expect(text.trim().endsWith('M02*'), name).toBe(true)
    expect([...used].filter(code => !defined.has(code)), name).toEqual([])
    expect(first < 0 || defines < first, name).toBe(true)
    expect(text.split('G36*').length, name).toBe(text.split('G37*').length)
}

describe.skipIf(!HAS_FRITZING)('manufatura da PCB (spec 03 §2–§5)', () => {
    it('gera Gerber, Excellon, pick-and-place e BOM coerentes nos sketches com placa', async () => {
        const clipper = new Clipper(await createClipper())
        const wasm    = await loadWasm()
        const library = makeLibrary(true)
        const report: string[] = []

        for (const file of listSketches(true)) {
            const bundle = readBundle(fs.readFileSync(file))

            if (!bundle.sketch)
                continue

            library.addBundle(bundle)
            const doc = fromSketch(bundle.sketch)
            await library.load(Object.values(doc.instances).map(instance => instance.moduleIdRef))

            const scene   = new Scene(doc, library, 'pcbView')
            const artwork = getArtwork(doc, library, clipper, scene)

            if (!artwork)
                continue

            const name  = path.basename(file, '.fzz')
            const files = exportFabrication(artwork, clipper, name)
            const drill = files[`${name}_drill.txt`]
            const hits  = drill.split('\n').filter(line => /^X\d+Y\d+$/.test(line)).length

            Object.entries(files).filter(([fileName]) => !fileName.endsWith('.txt')).forEach(([fileName, text]) => checkGerber(fileName, text))
            expect(artwork.board.outline.length, name).toBeGreaterThan(0)
            expect(hits, name).toBe(artwork.holes.length)
            expect(artwork.holes.every(hole => hole.x >= -1 && hole.y >= -1 && hole.x <= artwork.board.width + 1 && hole.y <= artwork.board.height + 1), name).toBe(true)
            expect(exportPickAndPlace(artwork, library, name).split('\n').filter(line => line && !line.startsWith('#') && !line.startsWith('RefDes') && !line.startsWith('Description')).length, name).toBe(artwork.placed.length)
            expect(exportBomCsv(doc, library).split('\n').length, name).toBeGreaterThan(1)

            const ipc     = exportIpc(doc, library, artwork, scene, name)
            const records = ipc.split('\n').filter(line => /^(317|017|327)/.test(line))

            expect(ipc.startsWith('C  CircuitMaster'), name).toBe(true)
            expect(ipc.trim().endsWith('999'), name).toBe(true)
            expect(records.every(line => line.length === 79), name).toBe(true)
            expect(records.filter(line => line.startsWith('317')).length, name).toBe(records.filter(line => line.startsWith('017')).length)

            if (SAMPLES.includes(name)) {
                const netlist = new Netlist(doc, library, wasm)
                netlist.update()

                const outputs = { ...files, [`${name}.ipc`]: ipc, [`${name}.xml`]: netlist.export('pcbView', instance => scene.isShown(instance), `${name}.fzz`), [`${name}_bom.pdf`]: exportBomPdf(doc, library, name), ...exportEtchablePdf(artwork, clipper, name) }
                Object.entries(outputs).forEach(([fileName, data]) => writeReport(`gerber/${name}/${fileName}`, data))
            }

            report.push(`${name}: placa ${(artwork.board.width / 1000).toFixed(2)}×${(artwork.board.height / 1000).toFixed(2)} in, ${artwork.board.layers} camadas, cobre ${artwork.copper.top.length}/${artwork.copper.bottom.length}, pads ${artwork.pads.length}, furos ${artwork.holes.length}, peças ${artwork.placed.length}, sem suporte ${artwork.skipped}`)
        }

        writeReport('cam-report.txt', report.join('\n'))
        expect(report.length).toBeGreaterThan(20)
    })
})

describe.skipIf(!HAS_FRITZING)('peça na face de baixo', () => {
    it('espelha os terminais em torno do centro da peça e leva o cobre e a serigrafia para a outra face', async () => {
        const clipper = new Clipper(await createClipper())
        const library = makeLibrary(true)
        const bundle  = readBundle(fs.readFileSync(listSketches(true).find(file => path.basename(file) === 'Knock.fzz') ?? ''))
        library.addBundle(bundle)
        if (!bundle.sketch)
            throw new Error('Knock.fzz sem sketch')

        const doc     = fromSketch(bundle.sketch)
        await library.load(Object.values(doc.instances).map(instance => instance.moduleIdRef))

        const scene0  = new Scene(doc, library, 'pcbView')
        const target  = Object.values(doc.instances).find(instance => library.getPart(instance.moduleIdRef)?.kind === 'part' && scene0.isShown(instance) && new Set(scene0.getKeys(instance.modelIndex).map(key => Math.round(scene0.getLocalTerminal(instance.modelIndex, key.split('/')[1])?.[0] ?? 0))).size > 1)
        const index   = target?.modelIndex ?? ''
        const flipped = setPartSide(doc, library, [index], true)
        const scene1  = new Scene(flipped, library, 'pcbView')
        const keys    = scene0.getKeys(index)
        const local   = (scene: Scene, key: string) => scene.getLocalTerminal(index, key.split('/')[1]) ?? [NaN, NaN]
        const sums    = keys.map(key => local(scene0, key)[0] + local(scene1, key)[0])
        const faces   = (artwork: ReturnType<typeof getArtwork>, face: string) => artwork?.conductors.filter(conductor => conductor.owner === index && conductor.face === face).length
        const [a, b]  = [getArtwork(doc, library, clipper, scene0), getArtwork(flipped, library, clipper, scene1)]

        expect(keys.length).toBeGreaterThan(1)
        expect(Math.max(...sums) - Math.min(...sums)).toBeLessThan(0.01)
        expect(keys.every(key => Math.abs(local(scene0, key)[1] - local(scene1, key)[1]) < 0.01)).toBe(true)
        expect([faces(b, 'top'), faces(b, 'bottom')]).toEqual([faces(a, 'bottom'), faces(a, 'top')])
        expect(scene1.getBounds(index)).toEqual(scene0.getBounds(index))
        expect(setPartSide(flipped, library, [index], false).instances[index].views.pcbView).toEqual(doc.instances[index].views.pcbView)
    })
})
