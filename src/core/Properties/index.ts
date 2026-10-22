export type PropertyDef = { name: string, symbol: string, min: number | null, max: number | null, value: string, numeric: boolean, editable: boolean, suffixes: string[], values: string[] }

const PREFIXES: [string, number][] = [['p', 1e-12], ['n', 1e-9], ['µ', 1e-6], ['u', 1e-6], ['μ', 1e-6], ['m', 1e-3], ['', 1], ['k', 1e3], ['M', 1e6], ['G', 1e9], ['T', 1e12]]
const SHOWN                        = PREFIXES.filter(([prefix]) => prefix !== 'u' && prefix !== 'μ')

const POWER_SUPPLIES = ['SinePowerSupplyModuleID', 'TriangularPowerSupplyModuleID', 'SawtoothPowerSupplyModuleID']
const TRIMPOTS       = ['PotentiometerModuleID', 'alps-starter-pot9mm', 'SparkFun-Electromechanical-TRIMPOT-3MM-2', 'SparkFun-Electromechanical-TRIMPOT--2', 'SparkFun-Electromechanical-TRIMPOT-TRIMPOT-5MM', 'SparkFun-Electromechanical-TRIMPOT-TRIMPOT_PTH_S3_LOCK', 'SparkFun-Electromechanical-TRIMPOT-SMD', 'SparkFun-Electromechanical-TRIMPOT--PTH-KNOB', 'SparkFun-Electromechanical-TRIMPOT-PTH', 'SparkFun-Electromechanical-TRIMPOT-3362U-2']
const KNOBS          = [...TRIMPOTS, 'SparkFun-Electromechanical-POT-MAM', 'SparkFun-Electromechanical-POT_SWITCH-POT_PTH_SWITCH', 'SparkFun-Electromechanical-POT-TRIM', 'SparkFun-Electromechanical-POT-', 'SparkFun-Electromechanical-SLIDER-', 'SparkFun-Electromechanical-POT_SWITCH-POT_PTH', 'SparkFun-Electromechanical-POT--RV16AF-20', 'SparkFun-Electromechanical-POT-100K_3362U', 'ab15a34dfcf83e23a26e83fe8a5a4dac_2', '297c7ab01279c7b7f5c4ca77ec94554c']
const SCOPE_STEPS    = ['0.001', '0.01', '0.1', '1.0', '3.3', '5.0', '10', '20']
const E6             = (decades: number[]) => decades.flatMap(decade => [1, 1.5, 2.2, 3.3, 4.7, 6.8].map(base => String(+(base * decade).toPrecision(3))))

const def = (name: string, symbol: string, min: number | null, max: number | null, value: string, suffixes: string[], values: string[] = [], numeric = true, editable = true): PropertyDef => ({ name, symbol, min, max, value, numeric, editable, suffixes, values })

// TABELA FUNCIONAL DAS PROPRIEDADES EDITÁVEIS: UNIDADE, FAIXA, PADRÃO, SUGESTÕES E SUFIXOS DE moduleId (SPEC 01 §8.3)
export const PROPERTY_DEFS: PropertyDef[] = [
    def('thermistor type', '', null, null, 'Negative Temperature Coefficient (NTC)', ['ThermistorModuleID'], ['NTC', 'PTC'], false, false),
    def('capacitance5mm', 'F', 1e-12, 0.0047, '1e-10', ['CapacitorModuleID'], E6([1e-10, 1e-9, 1e-8]).slice(0, 18)),
    def('capacitance7.5mm', 'F', 1e-12, 0.0047, '1e-8', ['CapacitorModuleID'], E6([1e-8, 1e-7, 1e-6]).slice(0, 14)),
    def('capacitance10mm', 'F', 1e-12, 0.0047, '2.2e-6', ['CapacitorModuleID'], ['2.2e-6', '3.3e-6']),
    def('capacitance15mm', 'F', 1e-12, 0.0047, '4.7e-6', ['CapacitorModuleID'], ['4.7e-6', '6.8e-6']),
    def('capacitance22.5mm', 'F', 1e-12, 0.0047, '1e-5', ['CapacitorModuleID'], ['1e-5', '1.5e-5']),
    def('capacitance27.5mm', 'F', 1e-12, 0.0047, '2.2e-5', ['CapacitorModuleID'], ['2.2e-5', '3.3e-5', '4.7e-5', '6.8e-5']),
    def('capacitance37.5mm', 'F', 1e-12, 0.0047, '1e-7', ['CapacitorModuleID'], ['1e-4', '1.5e-4', '2.2e-4']),
    def('capacitance', 'F', 1e-12, 0.0047, '1e-7', ['CapacitorModuleID'], ['1e-12', '1e-11', '2.2e-11', '4.7e-11', ...E6([1e-10, 1e-9, 1e-8, 1e-7]), '1e-6', '2.2e-6', '4.7e-6', '1e-5']),
    def('max capacitance', 'F', 1e-12, 0.0047, '1e-7', ['VariableCapacitorModuleID']),
    def('min capacitance', 'F', 1e-12, 0.0047, '1e-7', ['VariableCapacitorModuleID']),
    def('voltage', 'V', 5, 500, '35', ['CapacitorModuleID'], ['6.3', '10', '16', '20', '35', '50', '63']),
    def('voltageHigh', 'V', 5, 500, '35', ['CapacitorModuleID'], ['63', '100', '250', '400', '630', '800']),
    def('voltage', 'V', 0, 1000, '5', ['DC2PowerModuleID', 'AC2PowerModuleID', 'DCPowerSupplyModuleID', ...POWER_SUPPLIES], ['3.3', '5', '12']),
    def('amplitude', 'V', 0, 1000, '5', POWER_SUPPLIES, ['3.3', '5', '12']),
    def('initial voltage', 'V', 0, 1000, '0', ['PulsePowerSupplyModuleID', 'DCPulseSourceModuleID']),
    def('pulsed voltage', 'V', 0, 1000, '5', ['PulsePowerSupplyModuleID', 'DCPulseSourceModuleID']),
    def('period', 's', 0, 1e6, '0.1', ['PulsePowerSupplyModuleID', 'TriangularPowerSupplyModuleID', 'SawtoothPowerSupplyModuleID', 'DCPulseSourceModuleID']),
    def('pulse width', 's', 0, 1e6, '0.05', ['PulsePowerSupplyModuleID', 'DCPulseSourceModuleID']),
    def('duty cycle', '%', 0, 100, '25', ['PWMPulsePowerSupplyModuleID']),
    def('rise time', 's', 0, 1, '0.001', ['GenericPulsePowerSupplyModuleID', 'DCPulseSourceModuleID']),
    def('fall time', 's', 0, 1, '0.001', ['GenericPulsePowerSupplyModuleID', 'DCPulseSourceModuleID']),
    def('number of pulses', '', 0, 1e12, '0', ['PulsePowerSupplyModuleID', 'TriangularPowerSupplyModuleID', 'SawtoothPowerSupplyModuleID']),
    def('frequency', 'Hz', 0, 1e6, '60', ['AC2PowerModuleID', 'SinePowerSupplyModuleID'], ['10', '20', '50', '60', '100']),
    def('offset voltage', 'V', 0, 1000, '0', POWER_SUPPLIES),
    def('delay time', 's', 0, 100, '0', ['SinePowerSupplyModuleID', 'PulsePowerSupplyModuleID', 'TriangularPowerSupplyModuleID', 'SawtoothPowerSupplyModuleID', 'DCPulseSourceModuleID']),
    def('damping factor', 's-1', 0, 10, '0', ['SinePowerSupplyModuleID']),
    def('phase', 'degrees', 0, 360, '0', ['SinePowerSupplyModuleID']),
    def('internal resistance', 'Ω', 0, 1e6, '0.1', ['PowerSupplyModuleID', '77c36646df552e9fe72f360837f556ccleg', '1000AFDF10011leg', 'c7c8e292b3beec531de0c51f2576d329']),
    def('frequency', 'Hz', null, null, '16 MHz', ['CrystalModuleID'], ['32 kHz', '1 MHz', '2 MHz', '4 MHz', '8 MHz', '12 MHz', '16 MHz', '20 MHz', '24 MHz', '25 MHz', '32 MHz'], false, false),
    def('tolerance', '', null, null, '5%', ['ResistorModuleID'], ['±0.05%', '±0.1%', '±0.25%', '±0.5%', '±1%', '±2%', '±5%', '±10%', '±20%'], false, false),
    def('breakdown voltage', 'V', 2, 30, '3.6', ['ZenerDiodeModuleID'], ['2', '3.6', '4.7', '5.1', '9.1', '12.1']),
    def('maximum resistance', 'Ω', 0, 1e12, '', TRIMPOTS),
    def('inductance', 'H', 0, 1e12, '', ['InductorModuleID']),
    def('knob status', '%', 0, 100, '50', KNOBS, ['0', '25', '50', '75', '100']),
    def('current', 'A', 0, 1e12, '', ['InductorModuleID', 'LEDModuleID', 'SuperfluxModuleID']),
    def('max current', 'A', 0, 1000, '1.0', ['LabDCPowerSupplyModuleID']),
    def('power', 'W', 0, 1e12, '', ['ResistorModuleID', 'PhotocellModuleID', ...KNOBS]),
    def('voltage (max)', 'V', 0, 1000, '5', ['1000FADF10011leg'], ['3.3', '5', '12', '24']),
    def('voltage (min)', 'V', 0, 1000, '2.5', ['1000FADF10011leg']),
    def('distance to obstacle', '%', 0, 100, '50', ['beab33bd7feee277622ef76dd6e79e4d']),
    def('dark resistance @0.01lx', 'Ω', 0, 1e12, '300000', ['PhotocellModuleID']),
    def('light resistance @100lx', 'Ω', 0, 1e12, '400', ['PhotocellModuleID']),
    def('luminance', 'lx', 0.001, 10000, '10', ['PhotocellModuleID']),
    def('time/div', 's', 0, 100, '0.01', ['OscilloscopeModuleID'], ['0.000001', '0.00001', '0.0001', '0.001', '0.01', '0.1', '1', '10']),
    ...[1, 2, 3, 4].flatMap(channel => [def(`ch${channel} offset`, 'V', -300, 300, '0', ['OscilloscopeModuleID'], SCOPE_STEPS), def(`ch${channel} volts/div`, 'V', 0, 100, '1', ['OscilloscopeModuleID'], SCOPE_STEPS)]),
    def('horizontal position', 's', 0, 1000, '0', ['OscilloscopeModuleID']),
    def('input inductance', 'H', 0, 1e6, '0.001', ['TRANSFORMER-PTH', 'TRANSFORMER-SMD']),
    def('output inductance', 'H', 0, 1e6, '0.001', ['TRANSFORMER-PTH', 'TRANSFORMER-SMD']),
    def('input resistance', 'Ω', 0, 1e12, '1', ['TRANSFORMER-PTH', 'TRANSFORMER-SMD']),
    def('output resistance', 'Ω', 0, 1e12, '1', ['TRANSFORMER-PTH', 'TRANSFORMER-SMD']),
    def('resistance', 'Ω', 0, 9.9e9, '220', ['ResistorModuleID'])
]

export const getPropertyDefs = (moduleId: string) => PROPERTY_DEFS.filter(item => item.suffixes.some(suffix => moduleId.toLowerCase().endsWith(suffix.toLowerCase())))

export const getSymbol = (moduleId: string, name: string) => getPropertyDefs(moduleId).find(item => item.name === name)?.symbol ?? ''

// TEXTO COM PREFIXO SI PARA NÚMERO: VÍRGULA VIRA PONTO, SAI O SÍMBOLO FINAL E UM PREFIXO (SPEC 01 §8.3)
export const parseSi = (text: string, symbol = '') => {
    const clean  = text.replace(',', '.').trim()
    const bare   = symbol && clean.endsWith(symbol) ? clean.slice(0, -symbol.length).trim() : clean
    const prefix = PREFIXES.find(([letter]) => letter && bare.endsWith(letter))
    const digits = prefix ? bare.slice(0, -prefix[0].length).trim() : bare
    const value  = digits === '' ? NaN : Number(digits)
    return Number.isFinite(value) ? value * (prefix?.[1] ?? 1) : null
}

export const formatSi = (value: number, symbol = '', decimals = 3) => {
    const [prefix, scale] = value === 0 ? ['', 1] : SHOWN.find(([, factor]) => Math.abs(value) < 1000 * factor) ?? SHOWN[SHOWN.length - 1]
    return `${+(value / scale).toFixed(decimals)}${prefix}${symbol}`
}

const TINY_READING = 1e-12    // ABAIXO DISSO A LEITURA É ZERO

// LEITURA DE INSTRUMENTO: 4 ALGARISMOS SIGNIFICATIVOS, PREFIXO SI E ESPAÇO ANTES DA UNIDADE
export const formatReading = (value: number, symbol: string) => {
    const x               = Math.abs(value) < TINY_READING ? 0 : value
    const [prefix, scale] = x === 0 ? ['', 1] : SHOWN.find(([, factor]) => Math.abs(x) < 999.95 * factor) ?? SHOWN[SHOWN.length - 1]
    return `${(x / scale).toPrecision(4)} ${prefix}${symbol}`
}

// NOMES EM PORTUGUÊS DAS PROPRIEDADES DO FRITZING, PARA O INSPETOR E O HISTÓRICO
const NAMES: Record<string, string> = {
    resistance: 'Resistência', capacitance: 'Capacitância', inductance: 'Indutância', voltage: 'Tensão', current: 'Corrente', power: 'Potência nominal', tolerance: 'Tolerância',
    package: 'Encapsulamento', 'pin spacing': 'Espaçamento', bands: 'Faixas de cor', color: 'Cor', frequency: 'Frequência', amplitude: 'Amplitude', 'dc offset': 'Nível DC', phase: 'Fase',
    'internal resistance': 'Resistência interna', 'max current': 'Corrente máxima', 'maximum resistance': 'Resistência máxima', 'input voltage': 'Tensão de entrada',
    'initial voltage': 'Tensão inicial', 'pulsed voltage': 'Tensão do pulso', 'delay time': 'Atraso', 'rise time': 'Subida', 'fall time': 'Descida', 'pulse width': 'Largura do pulso', period: 'Período',
    'chip label': 'Rótulo do CI', type: 'Tipo', variant: 'Variante', form: 'Formato', pins: 'Pinos', layer: 'Camada', layers: 'Camadas', size: 'Tamanho', 'hole size': 'Furo', polarity: 'Polaridade',
    'switching circuit': 'Contatos', function: 'Função', channels: 'Canais', width: 'Largura (mm)', height: 'Altura (mm)', logo: 'Texto', label: 'Rótulo', connect: 'Ligação', 'editable pin labels': 'Rótulos editáveis',
    'time/div': 'Tempo/div', 'volts/div': 'Volts/div', 'horizontal position': 'Posição horizontal', 'voltage drop': 'Queda de tensão', 'forward current': 'Corrente direta', chip: 'Chip', 'knob status': 'Posição do cursor', 'default state': 'Estado padrão', 'contact resistance': 'Resistência de contato'
}

export const nameOf = (key: string) => NAMES[key.toLowerCase()] ?? key.charAt(0).toUpperCase() + key.slice(1)
