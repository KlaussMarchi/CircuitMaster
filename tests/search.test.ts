import { describe, expect, it } from 'vitest'
import { readPart } from '../src/core/Part'
import { readBin } from '../src/core/Sketch'
import { haystackOf, prepare, rankParts } from '../src/core/Search'
import { FEATURED } from '../src/core/Featured'
import { HAS_FRITZING, listParts, readText } from './Fixtures'

const TOP = 3    // A PEÇA ESPERADA TEM DE APARECER ENTRE AS PRIMEIRAS

const load = () => {
    const entries = listParts().filter(listing => !listing.path.startsWith('obsolete/')).flatMap(listing => {
        const part = readPart(readText(listing.root, listing.path), listing.root === 'app')
        return part ? [{ moduleId: part.moduleId, title: part.title, family: part.properties.family ?? '', haystack: haystackOf(part) }] : []
    })
    const bins = ['core.fzb', 'more/sim.fzb'].map(file => new Set(readBin(readText('parts', `bins/${file}`))?.entries.map(entry => entry.moduleIdRef)))
    return { entries, words: new Map(entries.map(entry => [entry.moduleId, prepare(entry)])), bins }
}

describe.skipIf(!HAS_FRITZING)('busca de peças (spec 01 §7)', () => {
    const { entries, words, bins } = load()
    const top = (text: string) => rankParts(entries, words, text, bins).slice(0, TOP).map(entry => entry.moduleId)

    it('as sugeridas existem no acervo', () => {
        FEATURED.forEach(item => expect(entries.some(entry => entry.moduleId === item.moduleId), item.name).toBe(true))
    })

    it('acha os básicos em português, inglês e por sigla, já nas primeiras posições', () => {
        const cases: [string, string][] = [['fonte', '5_DCPowerSupplyModuleID'], ['source', '5_DCPowerSupplyModuleID'], ['DC', '5_DCPowerSupplyModuleID'], ['power', '5_DCPowerSupplyModuleID'], ['fonte dc', '5_DCPowerSupplyModuleID'], ['resistor', 'ResistorModuleID'], ['resistência', 'ResistorModuleID'], ['capacitor', '100milCeramicCapacitorModuleID'], ['eletrolítico', 'SmallElectrolyticCapacitorModuleID'], ['transistor', 'NPN-to92-ebc'], ['npn', 'NPN-to92-ebc'], ['led', 'LED-genedb611bf8177f41ac9c325217070f0c62ColorLEDModuleID'], ['diodo', '3254CBFC44diode'], ['terra', 'GroundModuleID'], ['amp op', 'AnalogDevices_OP27GPZ'], ['amplificador', 'AnalogDevices_OP27GPZ'], ['555', '1001AAAB555Timer'], ['bateria', '1000AFDF10011leg'], ['gerador', '1_SinePowerSupplyModuleID'], ['chave', '1238DBDC00-toggle-switch'], ['botão', '20A9BBEE34_ST'], ['multímetro', 'multimeter_v_dc_1']]
        cases.forEach(([text, moduleId]) => expect(top(text), text).toContain(moduleId))
    })

    it('busca parcial durante a digitação e termos que não existem', () => {
        expect(top('fon')).toContain('5_DCPowerSupplyModuleID')
        expect(top('capac')).toContain('100milCeramicCapacitorModuleID')
        expect(rankParts(entries, words, 'xyzzy', bins)).toHaveLength(0)
        expect(rankParts(entries, words, '   ', bins)).toHaveLength(0)
    })

    it('peças específicas continuam achadas pelo nome', () => {
        expect(top('lm358')).toContain('a59353bd0db0225dc22770e292c622f3')
        expect(top('arduino uno')).toContain('arduino_Uno_Rev3(fix)')
        expect(rankParts(entries, words, 'atmega328', bins).length).toBeGreaterThan(0)
    })
})
