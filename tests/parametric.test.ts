import { beforeAll, describe, expect, it } from 'vitest'
import { generateFzp, generateSvg, setParametric, getStrips, stripboardSvg, toggleCut } from '../src/core/Generator'
import { HAS_FRITZING, makeLibrary } from './Fixtures'

const VIEWS = [['breadboardView', 'breadboard'], ['schematicView', 'schematic'], ['pcbView', 'copper0']] as const

// AS PEÇAS PARAMÉTRICAS QUE O BIN CORE CITA E AS DE OUTROS TAMANHOS (SPEC 01 §8.5–8.6)
const PARTS = ['generic_sip_7_300mil', 'mystery_part_sip_3_100mil', 'mystery_part_sip_12_100mil', 'mystery_part_dip_8_300mil', 'mystery_part_dip_16_600mil', 'screw_terminal_2_3.5mm', 'screw_terminal_5_200mil', 'generic_ic_dip_8_300mil']

describe.skipIf(!HAS_FRITZING)('peças paramétricas geradas: SIP, mystery part e borne com N pinos (spec 01 §8.5–8.6)', () => {
    beforeAll(async () => setParametric(await import('../src/core/Parametric')))

    it.each(PARTS)('%s: .fzp gerado, desenho das três vistas e cada conector achado no desenho', async moduleId => {
        const library = makeLibrary()
        expect(generateFzp(moduleId)).toContain(`moduleId="${moduleId}"`)
        await library.load([moduleId])
        const part = library.getPart(moduleId)
        const pins = Number(moduleId.match(/_(\d+)_[\d.]+(?:mil|mm)$/)?.[1])

        expect(part?.connectors).toHaveLength(pins)
        VIEWS.forEach(([view, layer]) => {
            expect(library.getSvg(moduleId, view)?.root, `${moduleId} ${view}`).toBeTruthy()
            expect(library.getLayerPins(moduleId, view, layer).size, `${moduleId} ${view}`).toBe(pins)
        })
    })

    it('o borne espaça os furos pelo passo e o SIP põe todos os pinos à esquerda do símbolo', () => {
        const holes = (svg: string) => [...svg.matchAll(/cy='([\d.]+)'/g)].map(match => Number(match[1]))
        const [a, b] = holes(generateSvg('pcb/screw_terminal_3_200mil_pcb.svg') ?? '')
        expect(b - a).toBeCloseTo(200)
        expect(generateSvg('schematic/generic_sip_4_300mil_schem.svg')).not.toMatch(/connector\d+terminal" x="[1-9]/)
        expect(generateSvg('schematic/mystery_part_3_schem.svg')).toContain('>?</text>')
    })

    it('cortar e religar um trecho da stripboard muda as tiras, o desenho e volta ao início (F-244)', () => {
        const board  = '5.3StripboardModuleID'
        const before = getStrips(board, {})
        const buses  = toggleCut(board, {}, '1.0h')
        const strips = (svg: string | null) => (svg ?? '').match(/fill="#bc9451"/g)?.length ?? 0

        expect(getStrips(board, { buses })).toHaveLength(before.length - 1)
        expect(strips(stripboardSvg(board, { buses }))).toBe(before.length - 1)
        expect(getStrips(board, { buses: toggleCut(board, { buses }, '1.0h') })).toEqual(before)
        expect(strips(stripboardSvg(board, {}))).toBe(before.length)
    })
})
