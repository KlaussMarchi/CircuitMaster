import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readBundle } from '../src/core/Sketch'
import { fromSketch, removeInstance } from '../src/core/Document'
import { Scene } from '../src/engine/Scene'
import { Clipper, area, type Paths } from '../src/core/Clipper'
import { flattenPath, SvgFile } from '../src/core/SvgFile'
import { getArtwork, toPolygons, type Conductor } from '../src/core/Cam'
import { getFill, getZoneFill } from '../src/core/Fill'
import { contains } from '../src/core/Geometry'
import { emptyBoard, type BoardData, type BoardPad } from '../src/core/Board'
import { readKicad } from '../src/core/Kicad'
import { Netlist } from '../src/core/Netlist'
import { splitKey } from '../src/core/Document'
import { createFills } from '../src/engine/Edit'
import { apply } from '../src/core/Geometry'
import { HAS_FRITZING, loadWasm, makeLibrary, writeReport } from './Fixtures'
import { ROOTS } from '../tools/Fritzing'
import createClipper from '../src/core/Clipper/clipper2.js'

const KEEPOUT = 10
const UNITS   = 30    // POR mil NO SVG DO PREENCHIMENTO

const MISSING      = 0.001    // FRAÇÃO MÁXIMA DO PREENCHIMENTO DO FRITZING QUE O NOSSO NÃO COBRE
const CONCENTRATED = 0.95     // FRAÇÃO DO EXCESSO DE CIMA NUMA SÓ REGIÃO (O RECORTE VELHO); O RESTO SÃO LASCAS DA RASTERIZAÇÃO DO FRITZING

// POLÍGONOS EM mil NA PLACA DO SVG DE UM PREENCHIMENTO (CONTORNOS DO PATH, REGRA NÃO ZERO), COM O CANTO DADO
const fillPolygons = (clipper: Clipper, text: string, [x, y]: number[]) => {
    const svg = new SvgFile(text)
    svg.update()
    const d = text.match(/ d='([^']+)'/)?.[1] ?? ''
    return clipper.union(flattenPath(d).map(subpath => subpath.points.flat().map((value, i) => value / UNITS + (i % 2 ? y : x))))
}

const areaOf = (paths: Paths) => paths.reduce((sum, polygon) => sum + area(polygon), 0)

describe.skipIf(!HAS_FRITZING)('preenchimento de cobre (spec 03 §6)', () => {
    it('refaz o preenchimento do Knock com área próxima da gravada pelo Fritzing', async () => {
        const clipper = new Clipper(await createClipper())
        const library = makeLibrary()
        const bundle  = readBundle(fs.readFileSync(path.join(ROOTS.sketches, 'core/Knock.fzz')))

        library.addBundle(bundle)
        const original = fromSketch(bundle.sketch ?? { fritzingVersion: '', projectProperties: {}, settings: {}, instances: [] })
        await library.load([...Object.values(original.instances).map(instance => instance.moduleIdRef), 'GroundPlaneModuleID'])

        const fills    = Object.values(original.instances).filter(instance => instance.moduleIdRef === 'GroundPlaneModuleID')
        const doc      = fills.reduce((current, fill) => removeInstance(current, fill.modelIndex), original)
        const artwork  = getArtwork(doc, library, clipper, new Scene(doc, library, 'pcbView'))

        expect(artwork).not.toBeNull()

        for (const fill of fills) {
            const face      = fill.views.pcbView?.layer === 'groundplane1' ? 'top' : 'bottom'
            const geometry  = fill.views.pcbView?.geometry
            const fragments = getFill(clipper, artwork!, face, 'plain', () => false, KEEPOUT)
            const theirs    = fillPolygons(clipper, fill.properties.svg, apply(artwork!.board.frame, geometry?.x ?? 0, geometry?.y ?? 0))
            const ours      = clipper.union(fragments.flatMap(fragment => fillPolygons(clipper, fragment.svg, [fragment.x, fragment.y])))
            const extra     = clipper.difference(ours, theirs).filter(polygon => area(polygon) > 1)
            const [computed, reference] = [areaOf(ours), areaOf(theirs)]
            const created   = createFills(doc, fragments, artwork!.board.frame, 'plain')

            console.log(`Knock ${face}: ${fragments.length} fragmentos, área ${(computed / 1e6).toFixed(3)} in² (Fritzing ${(reference / 1e6).toFixed(3)} in², ${((computed / reference - 1) * 100).toFixed(2)}%)`)
            expect(fragments.length).toBeGreaterThan(0)
            expect(areaOf(clipper.difference(theirs, ours)) / reference).toBeLessThan(MISSING)

            if (face === 'bottom')
                expect(Math.abs(computed / reference - 1)).toBeLessThan(0.005)

            if (face === 'top')    // O PLANO DE CIMA GRAVADO NO EXEMPLO TEM UM RECORTE RETANGULAR ONDE HOJE NÃO HÁ COBRE (RESISTOR E PIEZO): DADO VELHO, O NOSSO PREENCHE
                expect(Math.max(...extra.map(area)) / areaOf(extra)).toBeGreaterThan(CONCENTRATED)

            expect(Object.keys(created.instances).length).toBe(Object.keys(doc.instances).length + fragments.length)
            writeReport(`fill-${face}.svg`, fragments[0].svg)
        }
    })

    it('com terra: alívio térmico liga os pads de terra, os outros pads ficam a k e as trilhas de terra ficam dentro do plano', async () => {
        const clipper = new Clipper(await createClipper())
        const library = makeLibrary()
        const bundle  = readBundle(fs.readFileSync(path.join(ROOTS.sketches, 'core/Knock.fzz')))

        library.addBundle(bundle)
        const original = fromSketch(bundle.sketch ?? { fritzingVersion: '', projectProperties: {}, settings: {}, instances: [] })
        await library.load([...Object.values(original.instances).map(instance => instance.moduleIdRef), 'GroundPlaneModuleID'])

        const doc      = Object.values(original.instances).filter(instance => instance.moduleIdRef === 'GroundPlaneModuleID').reduce((current, fill) => removeInstance(current, fill.modelIndex), original)
        const artwork  = getArtwork(doc, library, clipper, new Scene(doc, library, 'pcbView'))
        const netlist  = new Netlist(doc, library, await loadWasm())
        netlist.update()

        const netOf    = (key: string | null) => key !== null && netlist.index.has(key) ? netlist.nets.pcbView?.[netlist.index.get(key) ?? 0] ?? -1 : -1
        const named    = netlist.keys.filter(key => ['gnd', 'ground'].includes(library.getPart(doc.instances[splitKey(key)[0]]?.moduleIdRef ?? '')?.connectors.find(connector => connector.id === splitKey(key)[1])?.name.trim().toLowerCase() ?? ''))
        const ground   = netOf(named[0] ?? null)
        const grounded = (conductor: Conductor) => netOf(conductor.key) === ground
        const fill     = clipper.union(getFill(clipper, artwork!, 'bottom', 'ground', grounded, KEEPOUT).flatMap(fragment => fragment.polygons))
        const bottom   = artwork!.conductors.filter(conductor => conductor.face === 'bottom')
        const touches  = (conductor: Conductor, grow: number) => areaOf(clipper.intersection(fill, toPolygons(clipper, conductor.shape, grow)))
        const seeds    = bottom.filter(conductor => conductor.kind === 'pad' && grounded(conductor))
        const others   = bottom.filter(conductor => conductor.kind === 'pad' && !grounded(conductor))
        const traces   = bottom.filter(conductor => conductor.kind === 'trace' && grounded(conductor))

        expect(ground).toBeGreaterThanOrEqual(0)
        expect(seeds.length).toBeGreaterThan(0)
        seeds.forEach(seed => expect(touches(seed, 1)).toBeGreaterThan(0))
        others.forEach(other => expect(touches(other, KEEPOUT - 0.5)).toBeLessThan(0.01))
        traces.forEach(trace => expect(touches(trace, 0)).toBeGreaterThan(0))
    })
})

describe('áreas de cobre importadas (spec 09 §4)', () => {
    const pad = (net: string, x: number, y: number): BoardPad => ({ name: '1', x, y, width: 100, height: 100, rotation: 0, form: 'circle', polygon: null, drill: 40, plated: true, side: 'both', net })

    // PLACA DE 1000 × 1000 mil COM UM PAD GND, UM VCC E UM ANEL DE TRILHA VCC QUE CERCA UM CANTO SEM GND
    const board = (): BoardData => {
        const ring  = [[600, 600], [900, 600], [900, 900], [600, 900], [600, 600]]
        const plain = emptyBoard()
        return { ...plain, outline: [[0, 0, 1000, 0, 1000, 1000, 0, 1000]], footprints: [{ ref: 'J1', value: '', name: 'J', x: 0, y: 0, rotation: 0, side: 'top', pads: [pad('GND', 200, 200), pad('VCC', 500, 200)], silk: [] }], tracks: ring.slice(1).map((b, i) => ({ side: 'top', a: ring[i] as [number, number], b: b as [number, number], width: 20, net: 'VCC' })) }
    }

    it('despeja o contorno do EAGLE com as folgas e sem ilhas soltas', async () => {
        const clipper   = new Clipper(await createClipper())
        const data      = board()
        const fragments = getZoneFill(clipper, { side: 'top', net: 'GND', fill: [], hatch: [], pour: { outline: [0, 0, 1000, 0, 1000, 1000, 0, 1000], clearance: 12, edge: 40, width: 0, thermal: false } }, data)
        const inside    = (x: number, y: number) => fragments.some(fragment => contains(fragment.polygons, x, y))

        expect(fragments).toHaveLength(1)
        expect(fragments[0].layer).toBe('groundplane1')
        expect(inside(200, 200)).toBe(true)          // O PAD DA PRÓPRIA NET FICA DENTRO (LIGAÇÃO SÓLIDA)
        expect(inside(500, 200)).toBe(false)         // PAD DE OUTRA NET
        expect(inside(500, 255)).toBe(false)         // NA FOLGA DO PAD VCC (RAIO 50 + 12)
        expect(inside(500, 265)).toBe(true)
        expect(inside(20, 500)).toBe(false)          // NA FAIXA DA BORDA
        expect(inside(750, 750)).toBe(false)         // ILHA DENTRO DO ANEL VCC, SEM COBRE GND

        const relieved = getZoneFill(clipper, { side: 'top', net: 'GND', fill: [], hatch: [], pour: { outline: [0, 0, 1000, 0, 1000, 1000, 0, 1000], clearance: 12, edge: 40, width: 10, thermal: true } }, data)
        const touches  = (x: number, y: number) => relieved.some(fragment => contains(fragment.polygons, x, y))
        expect(touches(240, 240)).toBe(false)        // ANEL DO ALÍVIO TÉRMICO, NA DIAGONAL DO PAD GND
        expect(touches(200, 144)).toBe(true)         // RAIO VERTICAL DO ALÍVIO
    })

    it('lê o preenchimento gravado e o hachurado como cobre da face', async () => {
        const clipper = new Clipper(await createClipper())
        const text    = '(kicad_pcb (version 20240108) (layers (0 "F.Cu" signal) (31 "B.Cu" signal)) (net 0 "") (net 1 "GND")' +
                        '(zone (net 1) (net_name "GND") (layer "B.Cu") (connect_pads (clearance 0.5)) (polygon (pts (xy 0 0) (xy 10 0) (xy 10 10) (xy 0 10)))' +
                        '(filled_polygon (layer "B.Cu") (pts (xy 1 1) (xy 9 1) (xy 9 9) (xy 1 9)))))'
        const data    = readKicad(text)
        const [zone]  = data.zones

        expect(data.zones).toHaveLength(1)
        expect(zone).toMatchObject({ side: 'bottom', net: 'GND' })
        expect(areaOf(getZoneFill(clipper, zone, data)[0].polygons)).toBeCloseTo((8 * 1000 / 25.4) ** 2, 0)

        const hatched = getZoneFill(clipper, { side: 'top', net: '', fill: [], hatch: [{ side: 'top', points: [0, 0, 100, 0], closed: false, width: 10, fill: false }], pour: null }, data)
        expect(areaOf(hatched[0].polygons)).toBeCloseTo(100 * 10 + Math.PI * 25, -1)
    })
})

describe('área de cobre desenhada', () => {
    it('preenche só dentro do contorno, afastada da trilha de outra net', async () => {
        const clipper = new Clipper(await createClipper())
        const trace: Conductor = { face: 'top', shape: { kind: 'path', points: [250, 0, 250, 1000], closed: false, w: 20, fill: false, cap: 'round' }, owner: 'T', key: 'T/connector0', kind: 'trace' }
        const artwork = { board: { instance: {} as never, width: 1000, height: 1000, outline: [[0, 0, 1000, 0, 1000, 1000, 0, 1000]], layers: 2, frame: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number] }, copper: { top: [], bottom: [] }, pads: [], silk: { top: [], bottom: [] }, holes: [], placed: [], conductors: [trace], skipped: 0 }
        const limit   = [100, 100, 400, 100, 400, 400, 100, 400]
        const parts   = getFill(clipper, artwork, 'top', 'plain', () => false, KEEPOUT, limit)
        const all     = parts.flatMap(part => part.polygons)
        const xs      = all.flat().filter((_, i) => i % 2 === 0)

        expect(parts.length).toBe(2)
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(100)
        expect(Math.max(...xs)).toBeLessThanOrEqual(400)
        expect(clipper.intersection(all, clipper.inflate([[250, 0, 250, 1000]], 10 + KEEPOUT - 0.5)).length).toBe(0)
    })
})
