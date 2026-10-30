import fs from 'node:fs'
import path from 'node:path'
import { strToU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { exportSketch, readBundle, readSketch } from '../src/core/Sketch'
import { fromSketch } from '../src/core/Document'
import { Netlist } from '../src/core/Netlist'
import { Scene } from '../src/engine/Scene'
import { Clipper, FILL, area } from '../src/core/Clipper'
import { getArtwork, type Artwork } from '../src/core/Cam'
import { exportFabrication } from '../src/core/Gerber'
import { readFabrication } from '../src/core/GerberReader'
import { delphiFloat, readAltium, readCompound, writeAltium, writeCompound } from '../src/core/Altium'
import { readKicad, writeKicad } from '../src/core/Kicad'
import { readEagle, writeEagle } from '../src/core/Eagle'
import { emptyBoard, type BoardData } from '../src/core/Board'
import { exportBoard, importBoard } from '../src/engine/Board'
import type { Library } from '../src/core/Library'
import { HAS_FRITZING, listSketches, loadWasm, makeLibrary } from './Fixtures'
import createClipper from '../src/core/Clipper/clipper2.js'

const SAMPLE = 'Stepper_Motor'    // TRILHAS NAS DUAS FACES, VIA E PEÇAS PASSANTES

const FORMATS: [string, (board: BoardData) => BoardData][] = [
    ['KiCad', board => readKicad(writeKicad(board))],
    ['EAGLE', board => readEagle(writeEagle(board))],
    ['Altium', board => readAltium(writeAltium(board))]
]

// PADS POR REFERÊNCIA E NOME COM POSIÇÃO (0,1 mil) E A PARTIÇÃO EM NETS COMO GRUPOS DE PADS (NOME DA NET LIVRE)
const padsOf = (board: BoardData) => board.footprints.flatMap(footprint => footprint.pads.filter(pad => pad.name).map(pad => `${footprint.ref}|${pad.name}|${pad.x.toFixed(1)}|${pad.y.toFixed(1)}|${pad.drill.toFixed(1)}`)).sort()
const netsOf = (board: BoardData) => {
    const groups = new Map<string, string[]>()
    board.footprints.forEach(footprint => footprint.pads.filter(pad => pad.net).forEach(pad => groups.set(pad.net, [...groups.get(pad.net) ?? [], `${footprint.ref}|${pad.name}`])))
    return [...groups.values()].filter(group => group.length > 1).map(group => group.sort().join(',')).sort()
}
const shift = (board: BoardData, dx: number, dy: number): BoardData => ({ ...board, footprints: board.footprints.map(footprint => ({ ...footprint, x: footprint.x + dx, y: footprint.y + dy, pads: footprint.pads.map(pad => ({ ...pad, x: pad.x + dx, y: pad.y + dy })) })) })

const load = async (library: Library) => {
    const file   = listSketches(true).find(item => path.basename(item, '.fzz') === SAMPLE) as string
    const bundle = readBundle(fs.readFileSync(file))
    library.addBundle(bundle)
    const doc    = fromSketch(bundle.sketch ?? { fritzingVersion: '', projectProperties: {}, settings: {}, instances: [] })
    await library.load([...Object.values(doc.instances).map(instance => instance.moduleIdRef), 'ViaModuleID', 'WireModuleID'])
    return doc
}

describe('Compound File do Altium (spec 09 §7.1)', () => {
    it('grava e relê streams pequenos (mini stream), grandes, vazios e aninhados', () => {
        const large = new Uint8Array(70000).map((_, i) => i * 7)
        const files = new Map([['FileHeader', strToU8('cabeçalho')], ['Tracks6/Header', Uint8Array.of(1, 0, 0, 0)], ['Tracks6/Data', large], ['Vazio/Data', new Uint8Array()]])
        const read  = readCompound(writeCompound(files))
        files.forEach((data, name) => expect(Array.from(read.get(name) ?? []), name).toEqual(Array.from(data)))
    })

    it('escreve números no formato de ponto flutuante do Delphi', () => {
        expect(delphiFloat(180)).toBe(' 1.80000000000000E+0002')
        expect(delphiFloat(-0.5)).toBe('-5.00000000000000E-0001')
        expect(delphiFloat(0)).toBe(' 0.00000000000000E+0000')
    })
})

describe('áreas de cobre e documentação na exportação (spec 09)', () => {
    it('relê em cada formato a área de cobre na net certa e os traços de montagem e de área da peça', async () => {
        const clipper = new Clipper(await createClipper())
        const pad     = (name: string, x: number, net: string) => ({ name, x, y: 500, width: 60, height: 60, rotation: 0, form: 'circle' as const, polygon: null, drill: 30, plated: true, side: 'both' as const, net })
        const square  = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1]
        const board: BoardData = {
            ...emptyBoard(),
            outline: [square(0, 0, 1000, 1000)],
            footprints: [{ ref: 'J1', value: '', name: 'CONN', x: 450, y: 500, rotation: 0, side: 'top', pads: [pad('1', 300, 'GND'), pad('2', 600, 'SIG')], silk: [], fab: [{ side: 'top', points: square(250, 450, 650, 550), closed: true, width: 4, fill: false }], courtyard: [{ side: 'top', points: square(240, 440, 660, 560), closed: true, width: 2, fill: false }] }],
            zones: [{ side: 'bottom', net: 'GND', fill: [square(100, 100, 900, 900), square(550, 450, 650, 550)], hatch: [], pour: { outline: square(100, 100, 900, 900), clearance: 10, edge: 30, width: 0, thermal: true } }]
        }
        const areaOf  = (rings: number[][]) => clipper.union(rings, FILL.evenOdd).reduce((sum, ring) => sum + area(ring), 0)

        for (const [name, roundTrip] of FORMATS) {
            const back     = roundTrip(board)
            const zone     = back.zones.find(item => item.side === 'bottom')
            const [first]  = back.footprints.filter(footprint => footprint.ref === 'J1')

            expect(zone?.net, name).toBe(back.footprints.flatMap(footprint => footprint.pads).find(item => item.name === '1')?.net)
            expect((first?.fab ?? []).length, name).toBeGreaterThan(0)
            expect((first?.courtyard ?? []).length, name).toBeGreaterThan(0)
            expect(zone?.pour ? areaOf([zone.pour.outline]) : areaOf(zone?.fill ?? []), name).toBeCloseTo(zone?.pour ? 800 * 800 : 800 * 800 - 100 * 100, -2)
        }
    })
})

// QUATRO CAMADAS: TRILHAS EM In1 E In2, ÁREA EM In2, VIA CEGA (CIMA–In1), ENTERRADA (In1–In2) E UMA PASSANTE
const square4 = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1]
const pad4    = (name: string, x: number, net: string) => ({ name, x, y: 500, width: 60, height: 60, rotation: 0, form: 'circle' as const, polygon: null, drill: 30, plated: true, side: 'both' as const, net })
const LAYERED: BoardData = {
    ...emptyBoard(),
    copper: 4,
    outline: [square4(50, 40, 1000, 1000)],    // CANTO FORA DA ORIGEM: A IMPORTAÇÃO DESLOCA TUDO PARA O CANTO DA PLACA
    footprints: [{ ref: 'J1', value: '', name: 'CONN', x: 450, y: 500, rotation: 0, side: 'top', pads: [pad4('1', 300, 'GND'), pad4('2', 600, 'SIG'), pad4('3', 150, 'GND')], silk: [] }],    // NET DE UM PAD SÓ SAI SEM NOME NA EXPORTAÇÃO
    vias: [{ x: 800, y: 800, diameter: 30, drill: 15, net: 'SIG' }],
    inner: {
        tracks: [{ layer: 1, a: [300, 500], b: [300, 200], width: 10, net: 'GND' }, { layer: 2, a: [600, 500], b: [600, 800], width: 12, net: 'SIG' }],
        zones: [{ layer: 2, net: 'GND', fill: [square4(100, 100, 400, 300)], pour: null }],
        vias: [{ x: 300, y: 200, diameter: 24, drill: 10, net: 'GND', from: 0, to: 1 }, { x: 600, y: 800, diameter: 24, drill: 10, net: 'SIG', from: 1, to: 2 }]
    }
}
const layersOf = (board: BoardData) => ({
    copper: board.copper,
    tracks: board.inner.tracks.map(track => `${track.layer}|${track.a.map(Math.round)}|${track.b.map(Math.round)}`).sort(),
    zones: board.inner.zones.map(zone => `${zone.layer}|${Math.round(Math.min(...(zone.fill[0] ?? zone.pour?.outline ?? [])))}`),
    vias: board.inner.vias.map(via => `${via.from}-${via.to}|${Math.round(via.x)}|${Math.round(via.y)}`).sort(),
    through: board.vias.length
})

describe('camadas internas (spec 09)', () => {
    it('relê em cada formato as trilhas, a área e as vias cegas e enterradas das camadas internas na net certa', () => {
        for (const [name, roundTrip] of FORMATS) {
            const back = roundTrip(LAYERED)
            const pad  = (pin: string) => back.footprints.flatMap(footprint => footprint.pads).find(item => item.name === pin)?.net

            expect(layersOf(back), name).toEqual(layersOf(LAYERED))
            expect(back.inner.tracks.map(track => track.net).sort(), name).toEqual([pad('1'), pad('2')].sort())
            expect(back.inner.zones[0]?.net, name).toBe(pad('1'))
        }
    })
})

describe.skipIf(!HAS_FRITZING)('importação e exportação de placas (spec 09)', () => {
    let artwork: Artwork
    let board: BoardData
    let library: Library
    let routed: number

    it('exporta a PCB de um exemplo e relê em cada formato com os mesmos pads, nets, trilhas e vias', async () => {
        const clipper = new Clipper(await createClipper())
        library       = makeLibrary()
        const doc     = await load(library)
        const netlist = new Netlist(doc, library, await loadWasm())
        netlist.update()
        artwork       = getArtwork(doc, library, clipper, new Scene(doc, library, 'pcbView')) as Artwork
        board         = exportBoard(artwork, doc, library, netlist)
        routed        = netlist.getStatus('pcbView').routed

        // R15–R17 SÃO RESISTORES PASSANTES GIRADOS 90°: O ANEL DO PAD TEM QUE CONTINUAR CÍRCULO PARA O FURO IR AO EXCELLON
        expect(board.footprints.filter(footprint => /^R1[4-7]$/.test(footprint.ref)).flatMap(footprint => footprint.pads).every(pad => pad.drill > 0)).toBe(true)

        expect(board.footprints.length).toBeGreaterThan(5)
        expect(board.tracks.length).toBeGreaterThan(20)
        expect(netsOf(board).length).toBeGreaterThan(5)

        for (const [name, roundTrip] of FORMATS) {
            const back = roundTrip(board)
            expect(padsOf(back), name).toEqual(padsOf(board))
            expect(netsOf(back), name).toEqual(netsOf(board))
            expect(back.tracks.length, name).toBe(board.tracks.length)
            expect(back.vias.length, name).toBe(board.vias.length)
        }
    })

    it('importa a placa exportada como documento novo e a exporta de novo sem mudar pads nem nets', async () => {
        const clipper  = new Clipper(await createClipper())
        const imported = await importBoard(readKicad(writeKicad(board)), library, clipper)
        const netlist  = new Netlist(imported.doc, library, await loadWasm())
        netlist.update()
        const again    = getArtwork(imported.doc, library, clipper, new Scene(imported.doc, library, 'pcbView')) as Artwork
        const back     = exportBoard(again, imported.doc, library, netlist)
        const [dx, dy] = [board.outline.flat().filter((_, i) => i % 2 === 0).reduce((a, b) => Math.min(a, b)), board.outline.flat().filter((_, i) => i % 2 === 1).reduce((a, b) => Math.min(a, b))]

        expect(padsOf(shift(back, dx, dy))).toEqual(padsOf(board))
        expect(netsOf(back)).toEqual(netsOf(board))
        expect(back.tracks.length).toBe(board.tracks.length)
        expect(netlist.getStatus('pcbView').routed).toBe(routed)
    })

    it('guarda as camadas internas na placa importada, salva no .fz e as devolve na exportação junto dos pads e na net da netlist', async () => {
        const clipper  = new Clipper(await createClipper())
        const imported = await importBoard(readAltium(writeAltium(LAYERED)), library, clipper)
        const doc      = fromSketch(readSketch(exportSketch(imported.doc)) as NonNullable<ReturnType<typeof readSketch>>)
        const netlist  = new Netlist(doc, library, await loadWasm())
        netlist.update()
        const back     = exportBoard(getArtwork(doc, library, clipper, new Scene(doc, library, 'pcbView')) as Artwork, doc, library, netlist)
        const pad      = (pin: string) => back.footprints.flatMap(footprint => footprint.pads).find(item => item.name === pin)
        const gnd      = back.inner.tracks.find(track => track.layer === 1)

        expect(imported.inner).toBe(5)
        expect(back.copper).toBe(4)
        expect(back.inner.vias.map(via => `${via.from}-${via.to}`).sort()).toEqual(['0-1', '1-2'])
        expect(gnd?.a.map(value => Math.round(value))).toEqual([pad('1')?.x, pad('1')?.y].map(value => Math.round(value ?? NaN)))
        expect(gnd?.net).toBe(pad('1')?.net)
        expect(back.inner.zones[0]?.net).toBe(pad('1')?.net)
        expect(layersOf(readKicad(writeKicad(back))).vias.length).toBe(2)
    })
})

describe.skipIf(!HAS_FRITZING)('visualizador de Gerber (spec 09 §8)', () => {
    it('reconhece camadas, conta os furos e acha o contorno da placa', async () => {
        const clipper = new Clipper(await createClipper())
        const library = makeLibrary()
        const doc     = await load(library)
        const artwork = getArtwork(doc, library, clipper, new Scene(doc, library, 'pcbView')) as Artwork
        const layers  = Object.entries(exportFabrication(artwork, clipper, SAMPLE)).flatMap(([name, text]) => readFabrication(name, typeof text === 'string' ? strToU8(text) : text) ?? [])
        const kinds   = layers.map(layer => layer.kind)
        const outline = layers.find(layer => layer.kind === 'outline')
        const drill   = layers.find(layer => layer.kind === 'drill')

        expect(kinds).toEqual(expect.arrayContaining(['copperTop', 'copperBottom', 'maskTop', 'silkTop', 'outline', 'drill']))
        expect(layers.every(layer => layer.problems.length === 0)).toBe(true)
        expect(drill?.count).toBe(artwork.holes.length)
        expect(Math.abs((outline?.box[2] ?? 0) - (outline?.box[0] ?? 0) - artwork.board.width)).toBeLessThan(10)
        expect(Math.abs((outline?.box[3] ?? 0) - (outline?.box[1] ?? 0) - artwork.board.height)).toBeLessThan(10)
    })
})
