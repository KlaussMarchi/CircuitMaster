import { describe, expect, it } from 'vitest'
import { emptyDoc, keyOf, type Doc } from '../src/core/Document'
import { Netlist } from '../src/core/Netlist'
import { VIEWS } from '../src/core/Layer'
import { distance, type Box, type Point } from '../src/core/Geometry'
import { Scene } from '../src/engine/Scene'
import { FREE_ROUTE, crosses, getPath, simplifyPath, type Route } from '../src/engine/Path'
import { alignToGrid, createInstance, createWires, dragSegment, getGridShift, moveInstances, squareWires, tidyWires } from '../src/engine/Edit'
import { HAS_FRITZING, loadWasm, makeLibrary } from './Fixtures'

type View = typeof VIEWS[number]

const RESISTOR = 'ResistorModuleID'
const WIRE     = 'WireModuleID'
const GRID     = 9
const MARGIN   = 1    // O TERMINAL DO RESISTOR FICA 0,44 px DENTRO DA CAIXA DO SVG
const FREE: Route = { ...FREE_ROUTE, grid: GRID }

const everywhere = (point: Point) => Object.fromEntries(VIEWS.map(view => [view, point])) as Record<View, Point>

const isOrthogonal = (points: Point[]) => points.slice(1).every((point, i) => Math.abs(point[0] - points[i][0]) < 1e-6 || Math.abs(point[1] - points[i][1]) < 1e-6)

describe('caminho ortogonal dos fios', () => {
    it('sai pelo pino e chega pelo lado de fora do pino de destino', () => {
        const a: Point = [133, 195]
        const b: Point = [215, 128]
        expect(getPath(a, b, { ...FREE, start: [0, -1], end: [-1, 0] })).toEqual([[133, 128]])
        expect(getPath([420, 128], [515, 197], { ...FREE, start: [1, 0], end: [0, -1] })).toEqual([[515, 128]])
    })

    it('contorna por baixo quando os dois pinos apontam para baixo (U)', () => {
        const corners = getPath([515, 352], [133, 400], { ...FREE, start: [0, 1], end: [0, 1] })
        const points  = [[515, 352] as Point, ...corners, [133, 400] as Point]
        expect(corners).toHaveLength(2)
        expect(isOrthogonal(points)).toBe(true)
        expect(Math.min(...corners.map(([, y]) => y))).toBeGreaterThan(400)
    })

    it('alinhados viram um trecho só e o resto sempre fica em 90°', () => {
        expect(getPath([0, 0], [90, 0], FREE)).toEqual([])
        const random = Array.from({ length: 200 }, (_, i): [Point, Point] => [[(i * 37) % 300, (i * 91) % 200], [(i * 53) % 280, (i * 17) % 230]])
        random.forEach(([a, b]) => expect(isOrthogonal([a, ...getPath(a, b, FREE), b])).toBe(true))
    })

    it('desvia do corpo de uma peça no caminho', () => {
        const box: Box = [40, -40, 60, 10]
        const corners  = getPath([0, 0], [100, 50], { ...FREE, boxes: [box] })
        expect(corners).toEqual([[0, 50]])
    })

    it('não corre por cima de outro fio nem passa por um terminal', () => {
        const a: Point = [0, 0]
        const b: Point = [90, 54]
        const plain    = getPath(a, b, { ...FREE, start: [1, 0] })
        const wire: [Point, Point] = [[45, 0], [120, 0]]
        const avoided  = getPath(a, b, { ...FREE, start: [1, 0], wires: [wire] })
        const pinned   = getPath(a, b, { ...FREE, start: [1, 0], pins: [[60, 0]] })
        const onWire   = (corners: Point[]) => [a, ...corners, b].slice(1).some((point, i, all) => {
            const from = i === 0 ? a : all[i - 1]
            return Math.abs(from[1]) < 1e-9 && Math.abs(point[1]) < 1e-9 && Math.max(from[0], point[0]) > 45
        })

        expect(onWire(plain)).toBe(true)
        expect(onWire(avoided)).toBe(false)
        expect(onWire(pinned)).toBe(false)
        expect(isOrthogonal([a, ...avoided, b])).toBe(true)
    })

    it('chega por cima num pino voltado para cima, mesmo saindo para o lado oposto', () => {
        const a: Point = [0, 100]
        const b: Point = [200, 50]
        const corners  = getPath(a, b, { ...FREE, start: [-1, 0], end: [0, -1] })
        const points   = [a, ...corners, b]
        expect(isOrthogonal(points)).toBe(true)
        expect(points[1][0]).toBeLessThan(0)
        expect(points[points.length - 2][1]).toBeLessThan(50)
    })

    it('na PCB usa trechos a 0°, 45° e 90°', () => {
        const corners = getPath([0, 0], [100, 40], { ...FREE, diagonal: true })
        const points  = [[0, 0] as Point, ...corners, [100, 40] as Point]
        expect(corners).toHaveLength(1)
        points.slice(1).forEach((point, i) => {
            const [dx, dy] = [Math.abs(point[0] - points[i][0]), Math.abs(point[1] - points[i][1])]
            expect(dx < 1e-9 || dy < 1e-9 || Math.abs(dx - dy) < 1e-9).toBe(true)
        })
    })

    it('tira pontos repetidos e colineares', () => {
        expect(simplifyPath([[0, 0], [0, 0], [10, 0], [20, 0], [20, 10], [20, 10], [20, 30]])).toEqual([[0, 0], [20, 0], [20, 30]])
        expect(simplifyPath([[0, 0], [10, 5], [30, 10]])).toHaveLength(3)
    })

    it('tira a ida e volta do fio sobre si mesmo, mesmo quando uma revela outra', () => {
        expect(simplifyPath([[0, 0], [36, 0], [36, -164], [0, -164], [73, -164]])).toEqual([[0, 0], [36, 0], [36, -164], [73, -164]])
        expect(simplifyPath([[0, 0], [20, 0], [20, 10], [20, 0], [40, 0]])).toEqual([[0, 0], [40, 0]])
        expect(simplifyPath([[0, 0], [10, 0], [0, 0]])).toEqual([[0, 0]])
    })
})

const setup = async () => {
    const library = makeLibrary()
    await library.load([RESISTOR, WIRE])
    const placed  = [[0, 0], [300, 0]].reduce((current, point) => createInstance(current, library, RESISTOR, everywhere(point as Point)), emptyDoc())
    const aligned = alignToGrid(placed, library, 'schematicView', ['1', '2'], GRID)
    return { library, doc: aligned }
}

const netOf = async (doc: Doc, library: ReturnType<typeof makeLibrary>) => {
    const netlist = new Netlist(doc, library, await loadWasm())
    netlist.update()
    return netlist
}

const wiresOf = (scene: Scene) => Object.keys(scene.doc.instances).filter(index => scene.isWire(index) && scene.isShown(scene.doc.instances[index]))

describe.skipIf(!HAS_FRITZING)('fios ortogonais no esquemático', () => {
    it('alinha o primeiro terminal da peça à grade', async () => {
        const { library, doc } = await setup()
        const scene            = new Scene(doc, library, 'schematicView')
        expect(getGridShift(scene, '1', GRID)).toEqual([0, 0])
        scene.getKeys('1').forEach(key => (scene.getTerminal(key) ?? [1, 1]).forEach(value => expect(Math.abs(value / GRID - Math.round(value / GRID))).toBeLessThan(1e-4)))
    })

    it('cria a cadeia de trechos pelos pontos e liga as pontas', async () => {
        const { library, doc } = await setup()
        const scene            = new Scene(doc, library, 'schematicView')
        const a                = scene.getTerminal(keyOf('1', 'connector1')) ?? [0, 0]
        const b                = scene.getTerminal(keyOf('2', 'connector0')) ?? [0, 0]
        const points: Point[]  = [a, [a[0] + 27, a[1]], [a[0] + 27, a[1] + 45], [b[0], a[1] + 45], b]
        const made             = createWires(doc, library, 'schematicView', [keyOf('1', 'connector1')], [keyOf('2', 'connector0')], points)
        const after            = new Scene(made.doc, library, 'schematicView')
        const netlist          = await netOf(made.doc, library)

        expect(made.indexes).toHaveLength(4)
        made.indexes.forEach((index, i) => {
            const ends = after.getWireEnds(index) ?? [[0, 0], [0, 0]]
            expect(distance(ends[0], points[i])).toBeLessThan(1e-9)
            expect(distance(ends[1], points[i + 1])).toBeLessThan(1e-9)
        })
        expect(netlist.getNet('schematicView', keyOf('1', 'connector1'))).toContain(keyOf('2', 'connector0'))
        expect(netlist.getNet('breadboardView', keyOf('1', 'connector1'))).toContain(keyOf('2', 'connector0'))
        expect(netlist.getStatus('schematicView').left).toBe(0)
    })

    it('arrastar um trecho reto entre dois pinos cria dois trechos novos e mantém 90°', async () => {
        const { library, doc } = await setup()
        const scene            = new Scene(doc, library, 'schematicView')
        const a                = scene.getTerminal(keyOf('1', 'connector1')) ?? [0, 0]
        const b                = scene.getTerminal(keyOf('2', 'connector0')) ?? [0, 0]
        const made             = createWires(doc, library, 'schematicView', [keyOf('1', 'connector1')], [keyOf('2', 'connector0')], [a, [b[0], a[1]]])
        const dragged          = dragSegment(made.doc, library, 'schematicView', made.indexes[0], [0, 36])
        const after            = new Scene(dragged, library, 'schematicView')
        const wires            = wiresOf(after)
        const netlist          = await netOf(dragged, library)

        expect(wires).toHaveLength(3)
        wires.forEach(index => expect(isOrthogonal(after.getWireEnds(index) ?? [])).toBe(true))
        expect(after.getWireEnds(made.indexes[0])?.map(([, y]) => y)).toEqual([a[1] + 36, a[1] + 36])
        expect(netlist.getNet('schematicView', keyOf('1', 'connector1'))).toContain(keyOf('2', 'connector0'))
        expect(netlist.getStatus('schematicView').left).toBe(0)
    })

    it('a peça que passa da dobra do próprio fio refaz a cadeia sem o fio voltar por dentro dela', async () => {
        const { library, doc } = await setup()
        const scene            = new Scene(doc, library, 'schematicView')
        const a                = scene.getTerminal(keyOf('1', 'connector1')) ?? [0, 0]
        const b                = scene.getTerminal(keyOf('2', 'connector0')) ?? [0, 0]
        const points: Point[]  = [a, [a[0] + 27, a[1]], [a[0] + 27, a[1] + 45], [b[0] - 27, a[1] + 45], [b[0] - 27, b[1]], b]
        const made             = createWires(doc, library, 'schematicView', [keyOf('1', 'connector1')], [keyOf('2', 'connector0')], points)

        for (const [dx, dy] of [[54, 0], [54, 18]]) {
            const moved   = moveInstances(made.doc, library, 'schematicView', ['1'], dx, dy)
            const squared = squareWires(made.doc, moved, library, 'schematicView', GRID)
            const after   = new Scene(squared, library, 'schematicView')
            const body    = (after.getBounds('1') ?? [0, 0, 0, 0]).map((value, i) => value + (i < 2 ? MARGIN : -MARGIN)) as Box
            const pin     = after.getTerminal(keyOf('1', 'connector1')) ?? [0, 0]
            const ends    = wiresOf(after).map(index => after.getWireEnds(index) ?? [[0, 0], [0, 0]] as [Point, Point])
            const leaving = ends.find(([p, q]) => distance(p, pin) < 1e-6 || distance(q, pin) < 1e-6) ?? [pin, pin]
            const netlist = await netOf(squared, library)

            ends.forEach(segment => expect(isOrthogonal(segment), `${dx},${dy}`).toBe(true))
            expect(Math.max(leaving[0][0], leaving[1][0]), `${dx},${dy}`).toBeGreaterThan(pin[0])
            expect(ends.some(([p, q]) => crosses(p, q, body)), `${dx},${dy}`).toBe(false)
            expect(netlist.getNet('schematicView', keyOf('1', 'connector1'))).toContain(keyOf('2', 'connector0'))
        }
    })

    it('mover a peça mantém os fios ortogonais e junta trechos alinhados', async () => {
        const { library, doc } = await setup()
        const scene            = new Scene(doc, library, 'schematicView')
        const a                = scene.getTerminal(keyOf('1', 'connector1')) ?? [0, 0]
        const b                = scene.getTerminal(keyOf('2', 'connector0')) ?? [0, 0]
        const made             = createWires(doc, library, 'schematicView', [keyOf('1', 'connector1')], [keyOf('2', 'connector0')], [a, [b[0], a[1]]])
        const moved            = moveInstances(made.doc, library, 'schematicView', ['2'], 0, 45)
        const squared          = squareWires(made.doc, moved, library, 'schematicView', GRID)
        const after            = new Scene(squared, library, 'schematicView')
        const netlist          = await netOf(squared, library)

        wiresOf(after).forEach(index => expect(isOrthogonal(after.getWireEnds(index) ?? [])).toBe(true))
        expect(wiresOf(after).length).toBeGreaterThan(1)
        expect(netlist.getNet('schematicView', keyOf('1', 'connector1'))).toContain(keyOf('2', 'connector0'))

        const back   = moveInstances(squared, library, 'schematicView', ['2'], 0, -45)
        const fixed  = squareWires(squared, back, library, 'schematicView', GRID)
        const tidy   = tidyWires(fixed, library, 'schematicView', wiresOf(new Scene(fixed, library, 'schematicView')))
        const final  = new Scene(tidy, library, 'schematicView')
        expect(wiresOf(final)).toHaveLength(1)
        expect(isOrthogonal(final.getWireEnds(wiresOf(final)[0]) ?? [])).toBe(true)
    })
})
