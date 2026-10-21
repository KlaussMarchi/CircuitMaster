import { describe, expect, it } from 'vitest'
import { emptyDoc, keyOf, type Doc } from '../src/core/Document'
import { Netlist } from '../src/core/Netlist'
import { VIEWS } from '../src/core/Layer'
import { cubicAt, distance, nearestOnCubic, type Point } from '../src/core/Geometry'
import { Scene } from '../src/engine/Scene'
import { bendToVia, bendWire, connectEnd, copyItems, createInstance, createWire, deleteItems, deleteRatsnest, flipInstances, getChain, insertLegPoint, joinWires, pasteItems, removeLegPoint, setLegEnd, setLogoText, setWireEnds, setZOrder, splitWire, viaToBend } from '../src/engine/Edit'
import { getDrawing } from '../src/engine/Drawing'
import { HAS_FRITZING, loadWasm, makeLibrary } from './Fixtures'

type View = typeof VIEWS[number]

const RESISTOR = 'ResistorModuleID'
const WIRE     = 'WireModuleID'
const LED      = '3mmColorLEDModuleID'

const everywhere = (point: Point) => Object.fromEntries(VIEWS.map(view => [view, point])) as Record<View, Point>

const twoResistors = async () => {
    const library = makeLibrary()
    await library.load([RESISTOR, WIRE, LED])
    const placed  = [[0, 0], [300, 0]].reduce((current, point) => createInstance(current, library, RESISTOR, everywhere(point as Point)), emptyDoc())
    return { library, doc: createWire(placed, library, 'breadboardView', keyOf('1', 'connector1'), keyOf('2', 'connector0')) }
}

const netOf = async (doc: Doc, library: ReturnType<typeof makeLibrary>) => {
    const netlist = new Netlist(doc, library, await loadWasm())
    netlist.update()
    return netlist
}

describe.skipIf(!HAS_FRITZING)('edição de fios e peças (spec 02 §4, §10)', () => {
    it('dobra por duplo clique divide o fio e remover a dobra volta a um fio só', async () => {
        const { library, doc } = await twoResistors()
        const ends             = new Scene(doc, library, 'breadboardView').getWireEnds('3') ?? [[0, 0], [0, 0]]
        const middle: Point    = [(ends[0][0] + ends[1][0]) / 2, (ends[0][1] + ends[1][1]) / 2]
        const split            = splitWire(doc, 'breadboardView', '3', middle)
        const scene            = new Scene(split.doc, library, 'breadboardView')
        const netlist          = await netOf(split.doc, library)

        expect(split.bend).toEqual([keyOf('3', 'connector1'), keyOf('4', 'connector0')])
        expect(distance(scene.getWireEnds('3')?.[1] ?? [0, 0], middle)).toBeLessThan(1e-9)
        expect(distance(scene.getWireEnds('4')?.[1] ?? [0, 0], ends[1])).toBeLessThan(1e-9)
        expect(scene.getBendpoint(keyOf('3', 'connector1'))).toEqual([keyOf('3', 'connector1'), keyOf('4', 'connector0')])
        VIEWS.forEach(view => expect(netlist.getNet(view, keyOf('1', 'connector1'))).toContain(keyOf('2', 'connector0')))
        expect(getDrawing(scene, netlist).ratsnest).toHaveLength(0)

        const moved  = setWireEnds(split.doc, 'breadboardView', [[keyOf('3', 'connector1'), [middle[0], 80]], [keyOf('4', 'connector0'), [middle[0], 80]]])
        const joined = joinWires(moved, library, 'breadboardView', keyOf('3', 'connector1'))
        const back   = new Scene(joined, library, 'breadboardView').getWireEnds('3')

        expect(joined.instances['4']).toBeUndefined()
        expect(distance(back?.[0] ?? [0, 0], ends[0])).toBeLessThan(1e-9)
        expect(distance(back?.[1] ?? [0, 0], ends[1])).toBeLessThan(1e-9)
        expect(joined.edges.map(edge => edge.join('|'))).toContain([keyOf('2', 'connector0'), keyOf('3', 'connector1')].sort().join('|'))
    })

    it('converte a dobra de uma trilha em via e a via de volta em dobra (spec 02 §10)', async () => {
        const library = makeLibrary()
        await library.load([RESISTOR, WIRE, 'ViaModuleID'])
        const placed  = [[0, 0], [300, 0]].reduce((current, point) => createInstance(current, library, RESISTOR, everywhere(point as Point)), emptyDoc())
        const traced  = createWire(placed, library, 'pcbView', keyOf('1', 'connector1'), keyOf('2', 'connector0'))
        const ends    = new Scene(traced, library, 'pcbView').getWireEnds('3') ?? [[0, 0], [0, 0]]
        const split   = splitWire(traced, 'pcbView', '3', [(ends[0][0] + ends[1][0]) / 2, (ends[0][1] + ends[1][1]) / 2])
        const via     = bendToVia(split.doc, library, keyOf('3', 'connector1'), '0.4mm,0.3mm')
        const scene   = new Scene(via, library, 'pcbView')
        const viaKey  = keyOf('5', 'connector0')

        expect(library.getPart(via.instances['5']?.moduleIdRef ?? '')?.kind).toBe('via')
        expect(scene.getPartners(viaKey).sort()).toEqual([keyOf('3', 'connector1'), keyOf('4', 'connector0')])
        expect(distance(scene.getTerminal(viaKey) ?? [0, 0], scene.getWireEnds('3')?.[1] ?? [1, 1])).toBeLessThan(1e-6)
        expect((await netOf(via, library)).getNet('pcbView', keyOf('1', 'connector1'))).toContain(keyOf('2', 'connector0'))

        const back = viaToBend(via, library, '5')
        expect(back.instances['5']).toBeUndefined()
        expect(new Scene(back, library, 'pcbView').getBendpoint(keyOf('3', 'connector1'))?.sort()).toEqual([keyOf('3', 'connector1'), keyOf('4', 'connector0')])
    })

    it('texto novo do logo regera o SVG e o tamanho (spec 01 §5.7)', async () => {
        const library = makeLibrary(true)
        await library.load(['LogoTextModuleID'])
        const placed  = createInstance(emptyDoc(), library, 'LogoTextModuleID', everywhere([0, 0]))
        const short   = setLogoText(placed, library, 'pcbView', '1', 'A')
        const long    = setLogoText(placed, library, 'pcbView', '1', 'CircuitMaster')
        const svg     = library.getInstanceSvg(long.instances['1'], 'pcbView')

        expect(long.instances['1'].properties.logo).toBe('CircuitMaster')
        expect(long.instances['1'].properties.shape).toContain('>CircuitMaster</text>')
        expect(Number(long.instances['1'].properties.width)).toBeGreaterThan(5 * Number(short.instances['1'].properties.width))
        expect(Number(long.instances['1'].properties.height)).toBeCloseTo(Number(short.instances['1'].properties.height), 6)
        expect((svg?.width ?? 0) / 90 * 25.4).toBeCloseTo(Number(long.instances['1'].properties.width), 3)
    })

    it('curvar o corpo faz a Bézier passar pelo cursor e mover a ponta mantém os controles', async () => {
        const { doc }        = await twoResistors()
        const state          = doc.instances['3'].views.breadboardView
        const [x, y]         = [state?.geometry.x ?? 0, state?.geometry.y ?? 0]
        const line           = state?.geometry.line ?? [0, 0, 0, 0]
        const p0: Point      = [x + line[0], y + line[1]]
        const p3: Point      = [x + line[2], y + line[3]]
        const grab: Point    = [(p0[0] + p3[0]) / 2, (p0[1] + p3[1]) / 2]
        const cursor: Point  = [grab[0], grab[1] + 50]
        const curved         = bendWire(doc, 'breadboardView', '3', grab, cursor)
        const bezier         = curved.instances['3'].views.breadboardView?.wire?.bezier ?? []
        const c1: Point      = [x + bezier[0], y + bezier[1]]
        const c2: Point      = [x + bezier[2], y + bezier[3]]
        const t              = nearestOnCubic(p0, c1, c2, p3, cursor)

        expect(distance(cubicAt(p0, c1, c2, p3, t), cursor)).toBeLessThan(0.05)

        const pulled = setWireEnds(curved, 'breadboardView', [[keyOf('3', 'connector0'), [p0[0] - 30, p0[1]]]])
        const next   = pulled.instances['3'].views.breadboardView
        const moved  = next?.wire?.bezier ?? []
        expect(distance([(next?.geometry.x ?? 0) + moved[0], (next?.geometry.y ?? 0) + moved[1]], c1)).toBeLessThan(1e-9)
    })

    it('apagar leva a cadeia direta de fios; apagar sem fios deixa pontas soltas', async () => {
        const { library, doc } = await twoResistors()
        const split            = splitWire(doc, 'breadboardView', '3', [150, 0]).doc
        const scene            = new Scene(split, library, 'breadboardView')

        expect(getChain(scene, '3').sort()).toEqual(['3', '4'])

        const full  = deleteItems(split, library, 'breadboardView', ['1'], false)
        const minus = deleteItems(split, library, 'breadboardView', ['1'], true)
        const wire  = deleteItems(split, library, 'breadboardView', ['4'], true)

        expect(Object.keys(full.instances).sort()).toEqual(['2'])
        expect(Object.keys(minus.instances).sort()).toEqual(['2', '3', '4'])
        expect(Object.keys(wire.instances).sort()).toEqual(['1', '2', '3'])
    })

    it('ponta de fio solta sobre um conector liga e encaixa no ponto terminal', async () => {
        const { library, doc } = await twoResistors()
        const scene            = new Scene(doc, library, 'schematicView')
        const target           = scene.getTerminal(keyOf('2', 'connector1')) ?? [0, 0]
        const loose            = createWire(doc, library, 'schematicView', keyOf('1', 'connector0'), null, [target[0] + 1, target[1] + 1])
        const linked           = connectEnd(loose, library, 'schematicView', keyOf('4', 'connector1'))

        expect(linked.edges.map(edge => edge.join('|'))).toContain([keyOf('2', 'connector1'), keyOf('4', 'connector1')].sort().join('|'))
        expect(distance(new Scene(linked, library, 'schematicView').getWireEnds('4')?.[1] ?? [0, 0], target)).toBeLessThan(1e-9)
    })

    it('ordem em z dentro da camada e colar com índices e títulos novos', async () => {
        const { library, doc } = await twoResistors()
        const front            = setZOrder(doc, library, 'breadboardView', ['1'], 'front')
        const z                = (current: Doc, index: string) => current.instances[index].views.breadboardView?.geometry.z ?? 0

        const back = setZOrder(front, library, 'breadboardView', ['1'], 'back')

        expect(z(front, '1')).toBeGreaterThan(z(front, '2'))
        expect(z(back, '1')).toBeLessThan(z(back, '2'))

        const pasted = pasteItems(doc, library, copyItems(doc, ['1', '2', '3']), [20, -20])
        const titles = Object.values(pasted.doc.instances).map(instance => instance.title)

        expect(pasted.indexes).toEqual(['4', '5', '6'])
        expect(new Set(titles).size).toBe(titles.length)
        expect(pasted.doc.edges.map(edge => edge.join('|'))).toContain([keyOf('4', 'connector1'), keyOf('6', 'connector0')].sort().join('|'))
    })

    it('apagar a linha de ratsnest no esquemático corta o fio invisível da protoboard', async () => {
        const { library, doc } = await twoResistors()
        const before           = await netOf(doc, library)
        const rats             = getDrawing(new Scene(doc, library, 'schematicView'), before).ratsnest

        expect(rats).toHaveLength(1)

        const after = deleteRatsnest(doc, library, 'schematicView', rats[0].from, rats[0].to)
        const net   = await netOf(after, library)

        expect(after.instances['3']).toBeUndefined()
        expect(net.getNet('schematicView', keyOf('1', 'connector1'))).not.toContain(keyOf('2', 'connector0'))
    })

    it('perna elástica estica até o ponto e ganha e perde vértices; espelhar duas vezes volta ao início', async () => {
        const library = makeLibrary()
        await library.load([LED])
        const doc     = createInstance(emptyDoc(), library, LED, everywhere([100, 100]))
        const key     = keyOf('1', 'connector0')
        const target  = [140, 220] as Point
        const legs    = new Scene(doc, library, 'breadboardView').getLegPoints(key)

        expect(legs).not.toBeNull()

        const stretched = setLegEnd(doc, library, 'breadboardView', key, target)
        const bent      = insertLegPoint(stretched, library, 'breadboardView', key, [120, 170])
        const straight  = removeLegPoint(bent, library, 'breadboardView', key, [120, 170])

        expect(distance(new Scene(stretched, library, 'breadboardView').getTerminal(key) ?? [0, 0], target)).toBeLessThan(1e-9)
        expect(new Scene(bent, library, 'breadboardView').getLegPoints(key)).toHaveLength(3)
        expect(new Scene(straight, library, 'breadboardView').getLegPoints(key)).toHaveLength(2)

        const start   = new Scene(doc, library, 'schematicView').getTerminal(key) ?? [0, 0]
        const flipped = flipInstances(flipInstances(doc, library, 'schematicView', ['1'], true), library, 'schematicView', ['1'], true)
        expect(distance(new Scene(flipped, library, 'schematicView').getTerminal(key) ?? [0, 0], start)).toBeLessThan(1e-9)
    })
})
