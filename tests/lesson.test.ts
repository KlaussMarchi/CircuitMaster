import { describe, expect, it } from 'vitest'
import { FEATURED } from '../src/core/Featured'
import { getLesson } from '../src/core/Lesson'
import { parseSi } from '../src/core/Properties'
import { HAS_FRITZING, makeLibrary } from './Fixtures'

describe.skipIf(!HAS_FRITZING)('cartão didático das peças', () => {
    it('toda peça básica tem o seu cartão, não o genérico da folha de dados', async () => {
        const library = makeLibrary()
        await library.load(FEATURED.map(item => item.moduleId))
        const generic = FEATURED.filter(item => {
            const part = library.getPart(item.moduleId)!
            return getLesson(part).what === getLesson({ ...part, title: '?', properties: {} }).what
        }).map(item => item.name)
        expect(generic).toEqual([])
        expect(getLesson(library.getPart('1001AAAB555Timer')!).what).toMatch(/^Timer 555/)
    })

    it('a família mais específica vence e o resto cai na descrição da peça cortada', async () => {
        const library  = makeLibrary()
        await library.load(['ResistorModuleID'])
        const resistor = library.getPart('ResistorModuleID')!
        const as       = (title: string, family: string, description = '') => getLesson({ ...resistor, title, description, properties: { family } })

        expect(as('LED driver', 'led driver').what).toMatch(/^Circuito integrado/)
        expect(as('Red LED', 'LED').what).toMatch(/^LED/)
        expect(as('Peça rara', 'coisa', 'x'.repeat(400)).what).toBe(`${'x'.repeat(280)}…`)
        expect(as('Peça rara', 'coisa', '<p>texto&nbsp;<b>curto</b></p>').what).toBe('texto curto')
    })

    it('a fórmula com os valores do circuito usa a tensão e a corrente lidas', async () => {
        const library  = makeLibrary()
        await library.load(['ResistorModuleID'])
        const lesson   = getLesson(library.getPart('ResistorModuleID')!)
        const get      = (key: string, symbol: string) => key === 'resistance' ? parseSi('1kΩ', symbol) : null
        const lines    = lesson.live({ V: 5, I: 0.005, get }).filter(Boolean).join('\n')

        expect(lines).toMatch(/I = V \/ R = 5(\.0+)? V \/ 1 ?kΩ = 5(\.0+)? mA/)
        expect(lines).toMatch(/P = V · I = .* = 25(\.0+)? mW/)
        expect(lesson.live({ V: null, I: null, get }).filter(Boolean)).toEqual([])
    })
})
