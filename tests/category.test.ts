import { describe, expect, it } from 'vitest'
import { CATEGORIES, OTHERS, categoryOf, familyName } from '../src/core/Category'

describe('categorias do catálogo para peças de qualquer origem (spec 08 §6)', () => {
    it('a família decide primeiro: a biblioteca de símbolos e a família da peça caem na mesma categoria', () => {
        expect(categoryOf('Amplifier_Operational', 'LM358 Low-Power, Dual Operational Amplifiers')).toBe('CIs')
        expect(categoryOf('sparkfun op-amp', 'LM358')).toBe('CIs')
        expect(categoryOf('MCU_Microchip_ATmega', 'ATmega328P-P 20MHz, 32kB Flash')).toBe('Microcontroladores')
        expect(categoryOf('microcontroller board (arduino)', 'Arduino Uno (Rev3)')).toBe('Microcontroladores')
        expect(categoryOf('Connector_Audio', 'AudioJack3')).toBe('Conectores')
        expect(categoryOf('Interface_USB', 'FT232RL USB to serial')).toBe('CIs')
        expect(categoryOf('sparkfun led driver', 'TLC5940')).toBe('CIs')
        expect(categoryOf('LED', 'Red LED')).toBe('Semicondutores')
        expect(categoryOf('power', 'GND')).toBe('Esquema e mecânica')
        expect(categoryOf('Regulator_Linear', 'LM7805_TO220')).toBe('Fontes')
    })

    it('sem regra para a família (a biblioteca genérica), valem o nome e a descrição, peça discreta antes de CI', () => {
        expect(categoryOf('Device', 'R Resistor')).toBe('Passivos')
        expect(categoryOf('Device', 'Q_NIGBT_CEG N-IGBT transistor, collector/emitter/gate')).toBe('Semicondutores')
        expect(categoryOf('Device', 'Lamp_Flash Flash lamp tube')).toBe('Saída')
        expect(categoryOf('Device', 'Microphone_Condenser Condenser microphone')).toBe('Sensores')
        expect(categoryOf('Device', 'Voltmeter_DC DC voltmeter')).toBe('Instrumentos')
        expect(categoryOf('', 'Coisa sem nome')).toBe(OTHERS)
    })

    it('a família junta o mesmo grupo vindo de origens diferentes: sem o fabricante na frente nem IC no fim', () => {
        expect(familyName('Timer IC')).toBe(familyName('Timer'))
        expect(familyName('SparkFun Voltage Regulator').toLowerCase()).toBe('voltage regulator')
        expect(familyName('74xx series')).toBe('74xx')
    })

    it('as categorias usam os nomes dos grupos das peças sugeridas', () => {
        expect(CATEGORIES.map(([name]) => name)).toEqual(expect.arrayContaining(['Passivos', 'Fontes', 'Semicondutores', 'CIs', 'Entrada', 'Instrumentos']))
    })
})
