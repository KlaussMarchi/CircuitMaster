import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readBundle } from '../src/core/Sketch'
import { fromSketch } from '../src/core/Document'
import { Netlist } from '../src/core/Netlist'
import { Scene } from '../src/engine/Scene'
import { Clipper } from '../src/core/Clipper'
import { getArtwork, pickBoard, type Artwork, type Conductor } from '../src/core/Cam'
import { checkRules, getGroupOf } from '../src/core/Drc'
import { HAS_FRITZING, listSketches, loadWasm, makeLibrary, writeReport } from './Fixtures'
import createClipper from '../src/core/Clipper/clipper2.js'

const KEEPOUT = 10

// EXEMPLOS DO FRITZING QUE VIOLAM AS REGRAS DE VERDADE (MEDIDO): CURTO DE COBRE, TRILHA A 9,33 mil DE PADS, PEÇAS FORA OU A MENOS DE k DA BORDA
const DIRTY = ['Arduino-no-FTDI', 'Shift_Register_2x', 'Workshop_03_FlipFlop-w-Button', 'measure_dc_current', 'simple_button', 'full_wave_rectifier']

const pad = (x: number, owner: string): Conductor => ({ face: 'top', shape: { kind: 'circle', x, y: 500, r: 20, w: 0, fill: true, drill: false }, owner, key: `${owner}/connector0`, kind: 'pad' })

const artworkOf = (conductors: Conductor[]): Artwork => ({ board: { instance: {} as Artwork['board']['instance'], width: 1000, height: 1000, outline: [[0, 0, 1000, 0, 1000, 1000, 0, 1000]], layers: 2, frame: [1, 0, 0, 1, 0, 0] }, copper: { top: [], bottom: [] }, pads: [], silk: { top: [], bottom: [] }, holes: [], placed: [], conductors, skipped: 0 })

describe('verificação de regras de projeto (spec 03 §7)', () => {
    it('acusa folga menor que k entre grupos e respeita k + 0,5 mil', async () => {
        const clipper = new Clipper(await createClipper())
        const groupOf = (conductor: Conductor) => conductor.owner

        for (const [gap, expected] of [[KEEPOUT - 0.5, 1], [KEEPOUT + 0.5, 0]] as const) {
            const found = checkRules(clipper, artworkOf([pad(300, 'A'), pad(300 + 40 + gap, 'B')]), groupOf, KEEPOUT)
            expect(found.filter(violation => violation.rule === 'overlap').length, `folga ${gap}`).toBe(expected)
        }

        const same = checkRules(clipper, artworkOf([pad(300, 'A'), pad(305, 'A')]), groupOf, KEEPOUT)
        const edge = checkRules(clipper, artworkOf([pad(25, 'A')]), groupOf, KEEPOUT)
        expect(same.length).toBe(0)
        expect(edge.map(violation => violation.rule)).toEqual(['edge'])
    })

    it.skipIf(!HAS_FRITZING)('roda nos exemplos com placa', async () => {
        const clipper = new Clipper(await createClipper())
        const wasm    = await loadWasm()
        const library = makeLibrary()
        const report: string[] = []

        for (const file of listSketches(true)) {
            const bundle = readBundle(fs.readFileSync(file))

            if (!bundle.sketch)
                continue

            library.addBundle(bundle)
            const doc = fromSketch(bundle.sketch)
            await library.load(Object.values(doc.instances).map(instance => instance.moduleIdRef))

            const scene   = new Scene(doc, library, 'pcbView')
            const boards  = pickBoard(doc, library, scene, []).boards
            const netlist = new Netlist(doc, library, wasm)
            const name    = path.basename(file, '.fzz')
            const titles  = (owners: string[]) => owners.map(owner => doc.instances[owner]?.title ?? owner).join(' × ')
            netlist.update()

            const found = boards.flatMap(board => {
                const artwork = getArtwork(doc, library, clipper, scene, [board.modelIndex])
                return artwork ? checkRules(clipper, artwork, getGroupOf(doc, netlist), KEEPOUT) : []
            })

            if (!boards.length)
                continue

            expect(found.every(violation => violation.polygons.length > 0 && violation.center.every(Number.isFinite))).toBe(true)
            expect(found.length > 0, name).toBe(DIRTY.includes(name))
            report.push(`${name}${boards.length > 1 ? ` (${boards.length} placas)` : ''}: ${found.length} violações${found.length ? ` — ${found.slice(0, 4).map(violation => `${violation.rule}/${violation.face ?? '-'} ${titles(violation.owners)}`).join('; ')}` : ''}`)
        }

        writeReport('drc-report.txt', report.join('\n'))
        expect(report.length).toBeGreaterThan(20)
    })
})
