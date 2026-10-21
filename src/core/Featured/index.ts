export type Featured = { moduleId: string, name: string, group: string, glyph: string, text?: string, nosim?: boolean, words: string[], values?: Record<string, string> }

export const FEATURED_GROUPS = ['Passivos', 'Fontes', 'Semicondutores', 'CIs', 'Entrada', 'Instrumentos']

const OPAMP = 'M16 8V56L52 32ZM0 22H16M0 42H16M52 32H64M19 22h6M22 19v6M19 42h6'

// PEÇAS BÁSICAS SUGERIDAS NA BIBLIOTECA E PUXADAS PARA A FRENTE NA BUSCA: SÍMBOLO DE LINHA 64×64 E PALAVRAS EM PORTUGUÊS E INGLÊS, SEM ACENTO (SPEC 01 §7)
export const FEATURED: Featured[] = [
    { moduleId: 'ResistorModuleID', name: 'Resistor', group: 'Passivos', glyph: 'M0 32H14L18 22L26 42L34 22L42 42L46 32H64', words: ['resistor', 'resistencia', 'resistance', 'ohm'] },
    { moduleId: '100milCeramicCapacitorModuleID', name: 'Capacitor', group: 'Passivos', glyph: 'M0 32H27M27 16V48M37 16V48M37 32H64', words: ['capacitor', 'capacitor ceramico', 'ceramico', 'ceramic', 'condensador', 'capacitancia', 'cap'] },
    { moduleId: 'SmallElectrolyticCapacitorModuleID', name: 'Eletrolítico', group: 'Passivos', glyph: 'M0 32H26M26 16V48M38 16Q32 32 38 48M38 32H64M14 18h6M17 15v6', words: ['capacitor', 'capacitor eletrolitico', 'eletrolitico', 'electrolytic', 'polarizado', 'condensador', 'cap'] },
    { moduleId: '56bed03878064b8286b71d5240035138InductorModuleID', name: 'Indutor', group: 'Passivos', glyph: 'M0 32H8A6 6 0 0 1 20 32A6 6 0 0 1 32 32A6 6 0 0 1 44 32A6 6 0 0 1 56 32H64', words: ['indutor', 'inductor', 'bobina', 'coil', 'indutancia'], values: { inductance: '10mH' } },
    { moduleId: 'potentiometer_rotary_9mm_6_PotentiometerModuleID', name: 'Potenciô\u00ADmetro', group: 'Passivos', glyph: 'M0 32H14L18 24L26 40L34 24L42 40L46 32H64M32 6V22M28 16L32 22L36 16', words: ['potenciometro', 'potentiometer', 'pot', 'trimpot', 'reostato', 'resistor variavel'] },
    { moduleId: '5_DCPowerSupplyModuleID', name: 'Fonte DC', group: 'Fontes', glyph: 'M32 0V14M32 50V64M14 32a18 18 0 1 0 36 0a18 18 0 1 0-36 0M26 24h12M32 18v12M26 42h12', words: ['fonte', 'fonte dc', 'fonte cc', 'fonte de tensao', 'dc', 'cc', 'source', 'power', 'power supply', 'supply', 'alimentacao', 'tensao', 'voltage', 'vcc'] },
    { moduleId: '1000AFDF10011leg', name: 'Bateria', group: 'Fontes', glyph: 'M0 32H24M24 14V50M34 22V42M34 32H64M10 20h8M14 16v8', words: ['bateria', 'battery', 'pilha', 'fonte', 'dc', 'cc', 'aa'] },
    { moduleId: '1_SinePowerSupplyModuleID', name: 'Gerador', group: 'Fontes', glyph: 'M0 32H18M46 32H64M32 32m-14 0a14 14 0 1 0 28 0a14 14 0 1 0-28 0M24 32Q28 24 32 32T40 32', words: ['gerador', 'gerador de sinais', 'fonte ac', 'fonte ca', 'ac', 'ca', 'senoide', 'senoidal', 'seno', 'sine', 'alternada', 'function generator', 'sinal', 'fonte'] },
    { moduleId: 'DCPulseSourceModuleID', name: 'Pulso', group: 'Fontes', glyph: 'M0 32H14M50 32H64M14 32a18 18 0 1 0 36 0a18 18 0 1 0-36 0M21 38H26V26H32V38H38V26H43', words: ['pulso', 'pulse', 'fonte de pulso', 'onda quadrada', 'quadrada', 'square', 'clock', 'degrau', 'step'] },
    { moduleId: 'GroundModuleID', name: 'Terra', group: 'Fontes', glyph: 'M32 0V24M14 24H50M21 32H43M28 40H36', words: ['terra', 'gnd', 'ground', 'massa', 'referencia', '0v'] },
    { moduleId: '3254CBFC44diode', name: 'Diodo', group: 'Semicondutores', glyph: 'M0 32H22M22 18L42 32L22 46ZM42 18V46M42 32H64', words: ['diodo', 'diode', 'retificador', 'rectifier', '1n4001'] },
    { moduleId: 'LED-genedb611bf8177f41ac9c325217070f0c62ColorLEDModuleID', name: 'LED', group: 'Semicondutores', glyph: 'M0 32H22M22 18L42 32L22 46ZM42 18V46M42 32H64M30 12L38 4M38 18L46 10', words: ['led', 'diodo emissor', 'luz', 'light'] },
    { moduleId: 'NPN-to92-ebc', name: 'Transistor NPN', group: 'Semicondutores', glyph: 'M0 32H22M22 16V48M22 26L46 10V4M22 38L46 54V60M34 52L46 54L42 44', words: ['transistor', 'transistor npn', 'npn', 'bjt', 'bipolar'] },
    { moduleId: '2244EBEC21e', name: 'Transistor PNP', group: 'Semicondutores', glyph: 'M0 32H22M22 16V48M22 26L46 10V4M22 38L46 54V60M22 38L32 39.5M22 38L27.5 46.5', words: ['transistor', 'transistor pnp', 'pnp', 'bjt', 'bipolar'] },
    { moduleId: '1001ABDC04', name: 'MOSFET N', group: 'Semicondutores', glyph: 'M0 44H18M18 20V44M24 16V24M24 28V36M24 40V48M24 20H44V4M24 44H44V60M24 32H44V44M30 28L24 32L30 36', words: ['mosfet', 'fet', 'nmos', 'canal n', 'transistor'] },
    { moduleId: 'AnalogDevices_OP27GPZ', name: 'Amp. op.', group: 'CIs', glyph: OPAMP, words: ['amp op', 'ampop', 'amp-op', 'amplificador', 'amplificador operacional', 'operacional', 'op amp', 'opamp', 'amplifier', 'op27'] },
    { moduleId: 'a59353bd0db0225dc22770e292c622f3', name: 'LM358', group: 'CIs', glyph: OPAMP, text: '358', words: ['lm358', 'amp op', 'amplificador', 'operacional', 'op amp', 'opamp', 'duplo'] },
    { moduleId: '1001AAAB555Timer', name: 'Timer 555', group: 'CIs', glyph: 'M16 8H48V56H16ZM6 18H16M6 32H16M6 46H16M48 18H58M48 32H58M48 46H58', text: '555', words: ['555', 'ne555', 'timer', 'temporizador', 'astavel', 'oscilador'] },
    { moduleId: 'arduino_Uno_Rev3(fix)', name: 'Arduino Uno', group: 'CIs', glyph: 'M12 8H52V56H12ZM4 16H12M4 28H12M4 40H12M52 16H60M52 28H60M52 40H60', text: 'UNO', nosim: true, words: ['arduino', 'arduino uno', 'uno', 'microcontrolador', 'microcontroller'] },
    { moduleId: '1238DBDC00-toggle-switch', name: 'Chave', group: 'Entrada', glyph: 'M0 32H18M18 32L44 18M46 32H64', words: ['chave', 'interruptor', 'switch', 'toggle', 'liga desliga'] },
    { moduleId: '20A9BBEE34_ST', name: 'Botão', group: 'Entrada', glyph: 'M0 32H18M18 24H46M32 24V14M28 14H36M46 32H64', words: ['botao', 'button', 'pushbutton', 'push', 'tactil', 'tecla'] },
    { moduleId: 'multimeter_v_dc_1', name: 'Multímetro', group: 'Instrumentos', glyph: 'M14 6H50V58H14ZM20 12H44V28H20ZM24 40a8 8 0 1 0 16 0a8 8 0 1 0-16 0M32 40L36 35', words: ['multimetro', 'multimeter', 'voltimetro', 'amperimetro', 'ohmimetro', 'medidor', 'medir'] },
    { moduleId: '4ChannelV1OscilloscopeModuleID', name: 'Osciloscópio', group: 'Instrumentos', glyph: 'M6 12H58V52H6ZM12 18H44V46H12ZM14 36Q20 22 26 32T38 28M50 22h4M50 32h4M50 42h4', words: ['osciloscopio', 'oscilloscope', 'scope', 'forma de onda'] }
]

export const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

// POSIÇÃO NA LISTA DE SUGESTÕES DA PEÇA CUJAS PALAVRAS COMEÇAM POR TODOS OS TERMOS DA BUSCA; −1 SE NÃO CASA
export const featuredRank = (moduleId: string, terms: string[]) => {
    const index = FEATURED.findIndex(item => item.moduleId === moduleId)
    const words = index < 0 ? [] : FEATURED[index].words.flatMap(word => word.split(' ')).concat(normalize(FEATURED[index].name).split(' '))
    return index >= 0 && terms.length && terms.every(term => words.some(word => word.startsWith(term))) ? index : -1
}
