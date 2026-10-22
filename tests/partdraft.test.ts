import { describe, expect, it } from 'vitest'
import { readPart } from '../src/core/Part'
import { childrenOf, parseXml, tagOf } from '../src/core/Xml'
import { Library } from '../src/core/Library'
import { DRAFT_VIEWS, PartDraft, bumpVersion, canonicalMode, cleanSvg, type DraftView } from '../src/core/PartDraft'
import { HAS_FRITZING, fileSource, makeLibrary } from './Fixtures'

const RESISTOR = 'ResistorModuleID'

const draftOf = async (moduleId: string) => {
    const library = makeLibrary()
    await library.load([moduleId])
    const fzp  = await library.getFzpText(moduleId) ?? ''
    const svgs = Object.fromEntries(await Promise.all(DRAFT_VIEWS.map(async view => [view, await library.getImageText(moduleId, view) ?? ''] as const))) as Record<DraftView, string>
    const draft = new PartDraft(fzp, Object.fromEntries(Object.entries(svgs).filter(([, text]) => text)))
    draft.update()
    return { library, draft }
}

const indexOf = (draft: PartDraft, view: DraftView, id: string) => draft.elementsWithId(view, id)[0]?.getAttribute('data-pe') ?? ''

describe('SVG de arquivo saneado (spec 01 §8A.4)', () => {
    it('tira script, foreignObject, atributos on* e links javascript:', () => {
        const root = cleanSvg(parseXml(`<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script><rect id='a' onclick='x()' width='1' height='1'/><a href='javascript:alert(1)'><circle r='1'/></a><foreignObject><div/></foreignObject></svg>`)!)
        const text = root.toString()
        expect(text).not.toMatch(/script|onclick|javascript|foreignObject/)
        expect(text).toContain(`id="a"`)
    })
})

describe('histórico de revisões do .fzp (spec 01 §8A.7)', () => {
    const LEGACY = `<module moduleId='X'><version replacedby='Y'>3</version><title>T</title><author>Ana</author><date>2020-01-02</date><description>d</description></module>`

    const draftOf = (fzp: string) => {
        const draft = new PartDraft(fzp, {})
        draft.update()
        return draft
    }

    it('próxima versão sobe o número do fim', () => {
        expect(['', '4', '1.1', '1.9', 'v2', 'beta', ' 7 '].map(bumpVersion)).toEqual(['1', '5', '1.2', '1.10', 'v3', 'beta', '8'])
        expect(['silent', 'forced', 'ask', 'required', 'outro'].map(canonicalMode)).toEqual(['required', 'recommended', 'optional', 'required', 'optional'])
    })

    it('peça antiga ganha uma entrada de <date> e <author>; gravar ordena, põe depois de <date> e copia a mais nova', () => {
        const draft = draftOf(LEGACY)
        expect(draft.getHistory()).toEqual([{ date: '2020-01-02', author: 'Ana', mode: 'optional', description: '' }])

        draft.setHistory([{ date: '2024-05-01', author: 'Bia', mode: 'required', description: 'pinos novos' }, { date: 'ontem', author: 'Caio', mode: 'ask', description: '' }, ...draft.getHistory()])
        expect(childrenOf(draft.root).map(tagOf)).toEqual(['version', 'title', 'author', 'date', 'history', 'history', 'history', 'description'])
        expect(draft.getHistory().map(entry => entry.author)).toEqual(['Caio', 'Ana', 'Bia'])
        expect(draft.getHistory()[0].mode).toBe('ask')
        expect([draft.getField('author'), draft.getField('date')]).toEqual(['Bia', '2024-05-01'])
    })

    it('o registro de hoje substitui a entrada do dia e a versão sobe mesmo sem entrada', () => {
        const draft = draftOf(LEGACY)
        draft.record({ date: '2026-10-20', author: 'Ana', mode: 'optional', description: 'primeira' }, false, '2026-10-20')
        draft.record({ ...draft.getSeed('2026-10-20'), description: 'corrigida' }, false, '2026-10-20')
        expect(draft.getHistory().map(entry => entry.description)).toEqual(['', 'corrigida'])

        draft.record(null, true, '2026-10-20')
        expect(draft.getField('version')).toBe('4')
        expect(draft.root.getElementsByTagName('version')[0]?.getAttribute('replacedby')).toBe('Y')
        expect(draft.getHistory()).toHaveLength(2)
    })
})

describe.skipIf(!HAS_FRITZING)('editor de peças: cópia de trabalho (spec 01 §8A)', () => {
    it('metadados, tags e propriedades vão para o .fzp exportado com moduleId e imagens novas', async () => {
        const { draft } = await draftOf(RESISTOR)
        draft.setField('title', 'Resistor de teste')
        draft.setField('author', 'CircuitMaster')
        draft.setTags(['teste', ' resistor '])
        draft.setProperties([...draft.getProperties(), ['potência máxima', '1W']])

        const files = draft.export('Teste_abc_1')
        const part  = readPart(files[0].text)

        expect(files.map(file => file.name)).toEqual(['part.Teste_abc_1.fzp', 'svg.breadboard.Teste_abc_1_breadboard.svg', 'svg.schematic.Teste_abc_1_schematic.svg', 'svg.pcb.Teste_abc_1_pcb.svg', 'svg.icon.Teste_abc_1_icon.svg'])
        expect(part?.moduleId).toBe('Teste_abc_1')
        expect(part?.title).toBe('Resistor de teste')
        expect(part?.tags).toEqual(['teste', 'resistor'])
        expect(part?.properties['potência máxima']).toBe('1W')
        expect(part?.views.schematicView?.image).toBe('schematic/Teste_abc_1_schematic.svg')
        files.slice(1).forEach(file => expect(file.text).not.toContain('data-pe'))
    })

    it('mais conectores ganham o próximo número livre e menos apaga os de maior número', async () => {
        const { draft } = await draftOf(RESISTOR)
        draft.setCount(4)
        const four = draft.getConnectors()

        expect(four.map(connector => connector.id)).toEqual(['connector0', 'connector1', 'connector2', 'connector3'])
        expect(four[2].name).toBe('pin 2')
        expect(four[2].pins.schematicView?.map(pin => pin.svgId)).toEqual(['connector2pin'])
        expect(four[3].pins.pcbView?.every(pin => pin.svgId === 'connector3pin' && !pin.terminalId)).toBe(true)

        draft.setCount(1)
        expect(draft.getConnectors().map(connector => connector.id)).toEqual(['connector0'])
        expect(draft.elementsWithId('schematicView', 'connector1pin')).toHaveLength(0)
    })

    it('atribuir um elemento troca o id no SVG e o conector clicado é achado de volta', async () => {
        const { draft } = await draftOf(RESISTOR)
        const target    = indexOf(draft, 'schematicView', 'connector0pin')
        const previous  = indexOf(draft, 'schematicView', 'connector1pin')

        draft.assign('schematicView', 'connector1', target)

        expect(draft.getElement('schematicView', target)?.getAttribute('id')).toBe('connector1pin')
        expect(draft.getElement('schematicView', previous)?.getAttribute('id')).toBeNull()
        expect(draft.findConnector('schematicView', target)).toBe('connector1')
        expect(draft.getAssignments('schematicView').missing).toEqual(['connector0'])
    })

    it('na PCB o gêmeo da outra camada de cobre recebe o mesmo id', async () => {
        const { draft } = await draftOf(RESISTOR)
        const pads      = draft.elementsWithId('pcbView', 'connector0pin')
        const index     = pads[0]?.getAttribute('data-pe') ?? ''

        draft.assign('pcbView', 'connector1', index)
        expect(draft.elementsWithId('pcbView', 'connector1pin')).toHaveLength(pads.length)
    })

    it('terminal fora do centro vira retângulo invisível depois do elemento; no centro, sem terminalId', async () => {
        const { draft } = await draftOf(RESISTOR)
        draft.setTerminal('schematicView', 'connector0', [1, 2, 0.02, 0.02])

        const marker = draft.elementsWithId('schematicView', 'connector0terminal')[0]
        const pin    = draft.elementsWithId('schematicView', 'connector0pin')[0]
        expect(marker?.getAttribute('fill')).toBe('none')
        expect(marker?.getAttribute('x')).toBe('1')
        expect(pin?.nextSibling).toBe(marker)
        expect(draft.getConnectors()[0].pins.schematicView?.[0].terminalId).toBe('connector0terminal')

        draft.setTerminal('schematicView', 'connector0', null)
        expect(draft.elementsWithId('schematicView', 'connector0terminal')).toHaveLength(0)
        expect(draft.getConnectors()[0].pins.schematicView?.[0].terminalId).toBe('')
    })

    it('variant repetida na família vira variant N livre', async () => {
        const { draft } = await draftOf(RESISTOR)
        draft.setProperties([...draft.getProperties().filter(([name]) => name !== 'variant'), ['variant', 'variant 1']])
        expect(draft.ensureVariant(['variant 1', 'variant 2'])).toBe('variant 3')
        expect(draft.ensureVariant(['outra'])).toBe('variant 3')
    })

    it('peça sem variant ganha a variant N livre da família, como o editor do Fritzing ao abrir a peça', async () => {
        const { draft } = await draftOf(RESISTOR)
        draft.setProperties(draft.getProperties().filter(([name]) => name !== 'variant'))
        expect(draft.ensureVariant(['variant 1'])).toBe('variant 2')
        expect(draft.getProperties()).toContainEqual(['variant', 'variant 2'])
    })

    it('a peça exportada carrega pelo pacote e o pino reatribuído tem a geometria do elemento novo', async () => {
        const { draft } = await draftOf(RESISTOR)
        const target    = indexOf(draft, 'schematicView', 'connector0pin')
        draft.assign('schematicView', 'connector1', target)

        const files   = draft.export('Teste_def_1')
        const library = new Library(fileSource)
        library.addBundle({ sketch: null, parts: files.filter(file => file.name.startsWith('part.')), svgs: files.filter(file => file.name.startsWith('svg.')), others: [], bin: null })
        await library.load(['Teste_def_1'])

        const original = makeLibrary()
        await original.load([RESISTOR])
        const before = original.getPins(RESISTOR, 'schematicView', 'schematic').get('connector0')
        const after  = library.getPins('Teste_def_1', 'schematicView', 'schematic').get('connector1')

        expect(library.getPart('Teste_def_1')?.title).toBeTruthy()
        expect(after?.rect).toEqual(before?.rect)
    })
})
