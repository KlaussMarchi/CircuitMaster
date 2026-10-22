import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readBundle } from '../src/core/Sketch'
import { fromSketch, removeInstance } from '../src/core/Document'
import { Scene } from '../src/engine/Scene'
import { Clipper, area, type Paths } from '../src/core/Clipper'
import { flattenPath, SvgFile } from '../src/core/SvgFile'
import { getArtwork, toPolygons, type Conductor } from '../src/core/Cam'
import { getFill } from '../src/core/Fill'
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
