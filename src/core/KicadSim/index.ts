// PORTADO DE kicad/eeschema/sim/sim_model.cpp (InferSimModel, createPins), spice_generator.cpp, sim_model_source.cpp E sim_model_switch.cpp (GPL-3.0-or-later)
import { pinsOf, type KicadPin, type KicadSymbol } from '../KicadSymbol'

type Model = { pins: string[], model: string, order?: number[] }

const BJT = ['C', 'B', 'E', '<S>']
const FET = ['D', 'G', 'S']
const MOS = ['D', 'G', 'S', 'B']

// ELEMENTO SPICE DE CADA Sim.Device E, POR Sim.Type (VAZIO = O PADRÃO), OS PINOS DO MODELO NA ORDEM DO KICAD (<x> OPCIONAL) E O TIPO DO .model; order PERMUTA OS PINOS NA LINHA
const DEVICES: Record<string, { item: string, types: Record<string, Model> }> = {
    D: { item: 'D', types: { '': { pins: ['A', 'K'], model: 'D' } } },
    NPN: { item: 'Q', types: { '': { pins: BJT, model: 'NPN' }, GUMMELPOON: { pins: BJT, model: 'NPN' }, VBIC: { pins: BJT, model: 'NPN level=4' } } },
    PNP: { item: 'Q', types: { '': { pins: BJT, model: 'PNP' }, GUMMELPOON: { pins: BJT, model: 'PNP' }, VBIC: { pins: BJT, model: 'PNP level=4' } } },
    NJFET: { item: 'J', types: { '': { pins: FET, model: 'NJF' }, SHICHMANHODGES: { pins: FET, model: 'NJF' }, PARKERSKELLERN: { pins: FET, model: 'NJF level=2' } } },
    PJFET: { item: 'J', types: { '': { pins: FET, model: 'PJF' }, SHICHMANHODGES: { pins: FET, model: 'PJF' }, PARKERSKELLERN: { pins: FET, model: 'PJF level=2' } } },
    NMOS: { item: 'M', types: { VDMOS: { pins: FET, model: 'VDMOS NCHAN' }, MOS1: { pins: MOS, model: 'NMOS' }, MOS2: { pins: MOS, model: 'NMOS level=2' }, MOS3: { pins: MOS, model: 'NMOS level=3' } } },
    PMOS: { item: 'M', types: { VDMOS: { pins: FET, model: 'VDMOS PCHAN' }, MOS1: { pins: MOS, model: 'PMOS' }, MOS2: { pins: MOS, model: 'PMOS level=2' }, MOS3: { pins: MOS, model: 'PMOS level=3' } } },
    SW: { item: 'S', types: { V: { pins: ['ctrl+', 'ctrl-', 'no+', 'no-'], model: 'SW', order: [2, 3, 0, 1] } } }
}

const SWITCH: Record<string, string> = { thr: 'vt', his: 'vh' }                                    // NOMES NO .model DA CHAVE CONTROLADA POR TENSÃO
const INSTANCE = new Set(['area', 'm', 'w', 'l', 'ad', 'as', 'pd', 'ps', 'nrd', 'nrs', 'temp', 'dtemp'])    // VÃO NA LINHA DO ELEMENTO, NÃO NO .model

// ARGUMENTOS DA FUNÇÃO DE CADA FONTE, NA ORDEM DO NGSPICE
const SOURCES: Record<string, string[]> = {
    DC: [],
    SIN: ['dc', 'ampl', 'f', 'td', 'theta', 'phase'],
    PULSE: ['y1', 'y2', 'td', 'tr', 'tf', 'tw', 'per', 'np'],
    EXP: ['y1', 'y2', 'td1', 'tau1', 'td2', 'tau2'],
    AM: ['vo', 'vmo', 'vma', 'fm', 'fc', 'td', 'phasem', 'phasec'],
    SFFM: ['vo', 'va', 'fm', 'mdi', 'fc', 'phasem', 'phasec'],
    PWL: ['pwl']
}

const PASSIVES = ['R', 'C', 'L']
const OPAMPS: [RegExp, string][] = [[/^(LM358|LM2904|LM324|LM2902)/, 'CM_LM358'], [/^TL0[78]/, 'ADTL082']]    // MACRO-MODELOS DO SIMULADOR (core/Spice) PELO NOME; OS OUTROS AMP-OPS PELO GENÉRICO
const OPAMP    = 'CM_OPAMP'
const MOSFET   = 'level=1 W=50u L=5u VTO=3.6 PHI=0.8 JS=0 KP=10.1'    // O DO MOSFET GENÉRICO DO ACERVO (VTO NEGATIVO NO CANAL P)
const NUMBER   = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(Meg|MEG|meg|[afpnuµμmkKMGT])?[A-Za-zΩ]*$/

// VALOR DO KICAD (PREFIXO SI: M É MEGA) NA NOTAÇÃO DO SPICE (M É MILI): M → Meg, µ → u, SEM A UNIDADE; O QUE NÃO É NÚMERO PASSA COMO ESTÁ
export const toSpice = (value: string) => {
    const match = value.trim().match(NUMBER)
    const unit  = match?.[2] ?? ''
    return !match ? value.trim() : match[1] + (unit === 'M' || unit.length === 3 ? 'Meg' : /[µμ]/.test(unit) ? 'u' : unit.toLowerCase())
}

// PARÂMETROS "nome=valor" DO Sim.Params (VALOR ENTRE ASPAS PODE TER ESPAÇOS)
export const paramsOf = (text: string) => Object.fromEntries([...text.matchAll(/([^\s=]+)=(?:"([^"]*)"|(\S+))/g)].map(([, key, quoted, bare]) => [key.toLowerCase(), quoted ?? bare]))

// MANTISSA SEM SEPARADOR DE MILHAR E COM PONTO DECIMAL: A VÍRGULA COM 3 DÍGITOS DEPOIS É MILHAR (3,300 = 3300), COM OUTRA CONTAGEM É DECIMAL (3,3)
const mantissaOf = (text: string) => {
    const clean   = text.replaceAll(' ', '')
    const last    = Math.max(clean.lastIndexOf('.'), clean.lastIndexOf(','))
    const decimal = last >= 0 && (clean[last] === '.' || clean.length - last - 1 !== 3 || clean.startsWith('0,')) ? clean[last] : '.'
    return clean.replaceAll(decimal === '.' ? ',' : '.', '').replace(',', '.')
}

const IDEAL  = /^([0-9,. ]+)([fFpPnNuUmMkKgGtTμµ ]|M[eE][gG])?(?:[fFhHΩrR]|ohm)?([1-9 ]*)(?:[fFhHΩrR]|ohm)?$/
const SOURCE = /^([0-9,. ]+)([fFpPnNuUmMkKgGtTμµ ]|M[eE][gG])?(?:[vVaA])?([1-9 ]*)(?:[vVaA])?$/

// O NÚMERO DO CAMPO Value COM O PREFIXO SI: 4k7 = 4.7k, 3,3u = 3.3u
const valueOf = (match: RegExpMatchArray) => {
    const mantissa = mantissaOf(match[1])
    const fraction = match[3].trim()
    return `${mantissa}${fraction && !mantissa.includes('.') ? `.${fraction}` : ''}${(match[2] ?? '').trim().replace(/[µμ]/, 'u')}`
}

// CAMPOS Sim.* DO SÍMBOLO; SEM ELES, O RESISTOR, CAPACITOR, INDUTOR OU FONTE DE 2 PINOS SAI DO PREFIXO DA REFERÊNCIA E DO Value, COMO NO KICAD
export const fieldsOf = (symbol: KicadSymbol) => {
    const field   = (name: string) => symbol.properties[`Sim.${name}`] ?? ''
    const prefix  = (symbol.properties.Reference ?? '').replace(/[?#\d]+$/, '').toUpperCase()[0] ?? ''
    const value   = (symbol.properties.Value ?? '').trim()
    const numbers = pinsOf(symbol).map(pin => pin.number).sort()
    const fields  = { device: field('Device').toUpperCase(), type: field('Type').toUpperCase(), params: paramsOf(field('Params')), pins: field('Pins') }
    const given   = Object.keys(fields.params).length > 0
    const bare    = !fields.device && !fields.type && !field('Library') && !field('Name') && value !== ''
    const pair    = numbers.length === 2 ? `${numbers[0]}=+ ${numbers[1]}=-` : ''
    const ideal   = value.match(IDEAL)
    const source  = value.replace(/^(DC|AC) /, '').match(SOURCE)

    if (pair && (PASSIVES.includes(fields.device) && !fields.type || bare && PASSIVES.includes(prefix)))
        return { device: fields.device || prefix, type: given || ideal ? '' : '=', params: given ? fields.params : { [(fields.device || prefix).toLowerCase()]: ideal ? valueOf(ideal) : value }, pins: fields.pins || pair }

    if (pair && (['V', 'I'].includes(fields.device) && ['', 'DC'].includes(fields.type) || bare && ['V', 'I'].includes(prefix)))
        return { device: fields.device || prefix, type: 'DC', params: value ? { [value.startsWith('AC ') ? 'ac' : 'dc']: source ? valueOf(source) : value.replace(/^(DC|AC) /, ''), ...fields.params } : fields.params, pins: fields.pins || pair }

    return fields
}

// .subckt PEDIDO DA BIBLIOTECA SPICE: O NOME, OS PINOS DO CABEÇALHO E OS BLOCOS, OS QUE ELE CHAMA ANTES (UM POR MODELO: DOIS AMP-OPS NO CIRCUITO NÃO DECLARAM O MESMO DUAS VEZES); NULO SEM ELE
export const subcktOf = (library: string, name: string) => {
    const blocks = new Map([...library.replace(/\r\n?/g, '\n').matchAll(/^\.subckt\s+(\S+)([^\n]*)\n[\s\S]*?^\.ends\b.*$/gim)].map(match => [match[1].toLowerCase(), match]))
    const called = (block: RegExpMatchArray): string[] => [block[1].toLowerCase(), ...[...block[0].matchAll(/^\s*x\S*(?:\s+\S+)+?\s+(\S+)(?:\s+\w+=\S+)*\s*$/gim)].map(match => blocks.get(match[1].toLowerCase())).filter((item): item is RegExpExecArray => item !== undefined && item !== block).flatMap(called)]
    const block  = blocks.get(name.toLowerCase())
    const pins   = block?.[2].replace(/\bparams:.*$/i, '').split(/\s+/).filter(pin => pin && !pin.includes('=')) ?? []
    return block ? { name: block[1], pins, texts: [...new Set(called(block))].reverse().map(key => blocks.get(key)?.[0] ?? '') } : null
}

// CAMINHO DA BIBLIOTECA SPICE NO ACERVO DE SÍMBOLOS (${KICAD10_SYMBOL_DIR}/Simulation_SPICE.sp → Simulation_SPICE.sp); NULO PARA A DE FORA DELE
export const libraryOf = (symbol: KicadSymbol) => {
    const field = symbol.properties['Sim.Library'] ?? ''
    return /^\$\{KICAD\d*_SYMBOL_DIR\}\//.test(field) ? field.replace(/^\$\{[^}]+\}\//, '') : null
}

// AMP-OP SEM CAMPOS Sim.*, RECONHECIDO PELA DESCRIÇÃO E PELOS PINOS (+, − E A SAÍDA DE CADA UNIDADE; V+ E V− DA ALIMENTAÇÃO): UMA LINHA POR UNIDADE COM O MACRO-MODELO DO SIMULADOR (O KICAD PEDE QUE O USUÁRIO ESCOLHA O MODELO)
const opampOf = (symbol: KicadSymbol, ids: Map<string, number>) => {
    const pins   = pinsOf(symbol)
    const supply = ['V+', 'V-'].map(name => pins.find(pin => pin.name === name))
    const units  = [...new Set(pins.filter(pin => pin.name === '+').map(pin => pin.unit))]
    const halves = units.map(unit => [pins.find(pin => pin.unit === unit && pin.name === '+'), pins.find(pin => pin.unit === unit && pin.name === '-'), pins.find(pin => pin.unit === unit && pin.type === 'output')])
    const model  = OPAMPS.find(([pattern]) => pattern.test(symbol.name))?.[1] ?? OPAMP
    const net    = (pin: KicadPin | undefined) => `{net connector${ids.get(pin?.number ?? '')}}`

    if (!/\bopamp\b|operational amplifier/i.test(`${symbol.properties.ki_keywords ?? ''} ${symbol.properties.Description ?? ''}`) || supply.some(pin => !pin) || !units.length || halves.some(half => half.some(pin => !pin)))
        return null

    return { lines: halves.map(([inp, inn, out], i) => `X{instanceTitle}${units.length > 1 ? 'ABCD'[i] : ''} ${[inp, inn, ...supply, out].map(net).join(' ')} ${model}`), models: [] }
}

// MOSFET SEM CAMPOS Sim.*, RECONHECIDO PELA DESCRIÇÃO (CANAL N OU P) E PELOS PINOS G, D E S: O CORPO LIGADO À FONTE, COMO O DO ACERVO
const mosfetOf = (symbol: KicadSymbol, ids: Map<string, number>, name: string) => {
    const text  = `${symbol.properties.ki_keywords ?? ''} ${symbol.properties.Description ?? ''}`
    const pins  = ['D', 'G', 'S'].map(letter => pinsOf(symbol).filter(pin => pin.name === letter))
    const kind  = /\bP-?(MOS|Channel)/i.test(text) ? 'PMOS' : /\bN-?(MOS|Channel)/i.test(text) ? 'NMOS' : ''
    const [d, g, s] = pins.map(list => `{net connector${ids.get(list[0]?.number ?? '')}}`)

    if (!kind || !/MOS/.test(text) || pins[0].length !== 1 || pins[1].length !== 1 || !pins[2].length)
        return null

    return { lines: [`M{instanceTitle} ${d} ${g} ${s} ${s} ${name}`], models: [`.model ${name} ${kind} ${kind === 'PMOS' ? MOSFET.replace('VTO=', 'VTO=-') : MOSFET}`] }
}

// LINHAS E MODELOS SPICE DA PEÇA PELOS CAMPOS Sim.*, COM OS PINOS DO SÍMBOLO PELO connectorN; NULO PARA O QUE NÃO SIMULA AQUI (XSPICE, IBIS, LINHA DE TRANSMISSÃO, COMPORTAMENTAL, BIBLIOTECA DE FORA, VALOR QUE NÃO É NÚMERO, PINO OBRIGATÓRIO SEM LIGAÇÃO)
export const simulate = (symbol: KicadSymbol, name: string, library = '') => {
    const { device, type, params, pins } = fieldsOf(symbol)
    const ids     = new Map(pinsOf(symbol).map((pin, i) => [pin.number, i]))
    const numbers = [...ids.keys()].sort()
    const mapped  = new Map(pins.split(/\s+/).filter(Boolean).map(pair => pair.split('=')).map(([number, pin]) => [(pin ?? '').toLowerCase(), number]))
    const nets    = (model: string[]) => {
        const found = model.map((pin, i) => [pin, mapped.size ? mapped.get(pin.replace(/[<>]/g, '').toLowerCase()) : numbers[i]] as const).filter(([pin, number]) => !pin.startsWith('<') || number !== undefined)
        return found.every(([, number]) => number !== undefined && ids.has(number)) ? found.map(([, number]) => `{net connector${ids.get(number ?? '')}}`) : null
    }
    const numeric = (keys: string[]) => keys.every(key => params[key] === undefined || key === 'pwl' || NUMBER.test(params[key].trim()))

    if (symbol.properties['Sim.Enable'] === '0')
        return null

    if (PASSIVES.includes(device)) {
        const value = params[device.toLowerCase()]
        const ends  = nets(['+', '-'])
        return type === '' && value && numeric([device.toLowerCase()]) && ends ? { lines: [`${device}{instanceTitle} ${ends.join(' ')} ${toSpice(value)}`], models: [] } : null
    }

    if (['V', 'I'].includes(device)) {
        const value = (key: string) => params[key] === undefined ? '' : key === 'pwl' ? params[key].split(/\s+/).map(toSpice).join(' ') : toSpice(params[key])
        const ends  = nets(['+', '-'])
        const once  = type === 'PULSE' && !value('per') && !value('np') ? ['0', '1'] : []    // SEM PERÍODO NEM NÚMERO DE PULSOS, UM PULSO SÓ (O NGSPICE 46+ FARIA UM TREM DE PULSOS)
        const parts = [value('dc') && `DC ${value('dc')}`, type !== 'DC' && `${type}( ${[...(SOURCES[type] ?? []).map(value).filter(Boolean), ...once].join(' ')} )`, value('ac') && `AC ${value('ac')} ${value('ph')}`.trim()].filter(Boolean)
        return SOURCES[type] && numeric([...SOURCES[type], 'dc', 'ac', 'ph']) && ends ? { lines: [`${device}{instanceTitle} ${ends.join(' ')} ${parts.join(' ')}`], models: [] } : null
    }

    if (device === 'SUBCKT') {
        const subckt = subcktOf(library, symbol.properties['Sim.Name'] ?? '')
        const ends   = subckt && nets(subckt.pins)
        const native = subckt && !subckt.texts.some(text => /^\s*a\S*\s/im.test(text))    // SEM XSPICE NO NGSPICE DO NAVEGADOR: O SUBCIRCUITO COM ELEMENTO A NÃO RODA
        return subckt && ends && native ? { lines: [`X{instanceTitle} ${ends.join(' ')} ${subckt.name}${Object.entries(params).map(([key, value]) => ` ${key}=${toSpice(value)}`).join('')}`], models: subckt.texts } : null
    }

    if (!device)
        return opampOf(symbol, ids) ?? mosfetOf(symbol, ids, name)

    const model = DEVICES[device]?.types[type]
    const ends  = model && nets(model.pins)

    if (!model || !ends)
        return null

    const own   = Object.keys(params).filter(key => !INSTANCE.has(key)).map(key => `${device === 'SW' ? SWITCH[key] ?? key : key}=${toSpice(params[key])}`)
    const local = Object.keys(params).filter(key => INSTANCE.has(key)).map(key => `${key}=${toSpice(params[key])}`)
    const line  = (model.order ?? ends.map((_, i) => i)).map(i => ends[i])
    return { lines: [[`${DEVICES[device].item}{instanceTitle}`, ...line, name, ...local].join(' ')], models: [[`.model ${name} ${model.model}`, ...own].join(' ')] }
}
