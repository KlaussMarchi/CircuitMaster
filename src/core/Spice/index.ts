import { addEdges, addInstance, keyOf, removeEdges, splitKey, type Doc, type Edge, type Probe } from '../Document'
import type { Library } from '../Library'
import { Netlist } from '../Netlist'
import type { Part } from '../Part'
import type { Instance } from '../Sketch'
import { getSymbol, parseSi } from '../Properties'
import { getTiming, getWindow, joinTiming, spiceNumber, type Timing } from '../Timing'

export type Initial  = 'op' | 'zero'
export type Mode     = 'auto' | 'custom'
export type Signal   = 'dc' | 'step' | 'ramp' | 'sine' | 'square'
export type Analysis = { type: 'op' } | { type: 'tran', t0: number, t1: number, step: number, steps: number, interval: number, mode: Mode, initial: Initial }
export type Meter    = { node: string | null, current: string | null, sign: number, open: boolean }
export type Circuit  = { deck: string, source: string, nodes: Map<string, string>, simulated: string[], analysis: Analysis, meters: Map<string, Meter> }
export type Event    = [time: number, pressed: boolean]
export type Plan     = { pressed: string, released: string, events: Event[] }

const TITLE         = 'Simulator Netlist'
const GROUNDED      = new Set(['gnd', 'vss', 'ground'])
const ZERO_DEFAULTS = new Set(['inductance', 'resistance', 'current', 'tolerance', 'power', 'capacitance', 'voltage'])
const WINDOW        = [0, 10]    // S, TRANSITÓRIO SEM OSCILOSCÓPIO NEM JANELA DO USUÁRIO (SPEC 04 §5.2)
const TOKEN         = /\{([^{}]*)\}/

export const START_KEY   = 'circuitmaster_start_time_s'    // JANELA DO TRANSITÓRIO ESCOLHIDA PELO USUÁRIO; O FRITZING IGNORA (SPEC 04 §9)
export const STOP_KEY    = 'circuitmaster_stop_time_s'
export const INITIAL_KEY = 'circuitmaster_initial'         // zero: CAPACITORES E INDUTORES DESCARREGADOS EM t = 0 (UIC)
export const SWITCH_KEY  = 'circuitmaster_switching'       // COMUTAÇÃO PROGRAMADA DAS CHAVES NO TRANSITÓRIO, EM JSON (SPEC 04 §8.10)
export const SIGNAL_KEY    = 'circuitmaster_signal'       // SINAL DA FONTE DE TENSÃO: CONTÍNUO, DEGRAU, RAMPA, SENOIDE OU ONDA QUADRADA (PEDIDO DO USUÁRIO, 2026-10-23)
export const FREQUENCY_KEY = 'circuitmaster_frequency'    // FREQUÊNCIA DA SENOIDE E DA ONDA QUADRADA; VAZIA, SAI DA CONSTANTE DE TEMPO DO CIRCUITO
export const RAMP_KEY      = 'circuitmaster_ramp'         // DURAÇÃO DA RAMPA; VAZIA, 5τ
export const SIGNALS: [Signal, string, string][] = [
    ['dc', 'Contínuo', 'Tensão constante: o circuito em regime.'],
    ['step', 'Degrau', 'De 0 à tensão da fonte em t = 0, com o circuito descarregado: subida, τ e sobressinal.'],
    ['ramp', 'Rampa', 'Sobe de 0 à tensão da fonte ao longo da duração (automática: 5 constantes de tempo do circuito).'],
    ['sine', 'Senoide', 'Amplitude igual à tensão da fonte; frequência automática na de corte do circuito: ganho e fase.'],
    ['square', 'Onda quadrada', 'De 0 à tensão da fonte; período automático de 10 constantes de tempo: carga e descarga.']
]
export const PROJECT_DEFAULTS: Record<string, string> = { simulator_time_step_mode: 'false', simulator_number_of_steps: '400', simulator_time_step_s: '1us', simulator_animation_time_s: '3s', simulator_spice_options: '', [START_KEY]: '', [STOP_KEY]: '', [INITIAL_KEY]: '' }

// AS VARIANTES AC DO MULTÍMETRO NÃO TÊM <spice> NO ACERVO: USAM O MODELO DA VARIANTE DC (SPEC 04 §8.6)
const AC_SPICE: Record<string, string[]> = {
    'voltmeter (ac)': ['* Multimeter, com probe connected to {net connector0} and voltage probe connected to {net connector1}'],
    'ammeter (ac)': ['V{instanceTitle} {net connector2} {net connector0} DC 0']
}

type Opamp = { a0: number, gbw: number, sr: number, vh: number, vl: number, rout: number, iq: number }

const G_OPEN  = 1e-9    // S: CONTATO ABERTO DA CHAVE PROGRAMADA (1 GΩ)
const CONTACT = 0.1     // Ω: CONTATO FECHADO SEM VALOR LEGÍVEL NA PEÇA
const RAMP    = 0.01    // FRAÇÃO DO PASSO DO TRANSITÓRIO NA RAMPA DE CADA COMUTAÇÃO

const LM358 = 'a59353bd0db0225dc22770e292c622f3'
const R_POLE = 1e8     // Ω NO NÓ DO POLO DOMINANTE DO MACRO-MODELO
const SUPPLY = 10      // V EM QUE A CORRENTE QUIESCENTE iq VALE

// AMP-OPS DO ACERVO SEM SUBCIRCUITO: GANHO EM MALHA ABERTA, PRODUTO GANHO-BANDA (Hz), SLEW RATE (V/s), FOLGA AOS TRILHOS (V), SAÍDA (Ω) E CORRENTE QUIESCENTE (A) DAS FOLHAS DE DADOS (SPEC 04 §1.1)
const OPAMPS: Record<string, Opamp> = {
    CM_LM358: { a0: 1e5, gbw: 1e6, sr: 0.3e6, vh: 1.5, vl: 0.02, rout: 50, iq: 0.35e-3 },
    OP27G: { a0: 1.8e6, gbw: 8e6, sr: 2.8e6, vh: 1.5, vl: 1.5, rout: 70, iq: 3e-3 },
    OP37G: { a0: 1.8e6, gbw: 63e6, sr: 17e6, vh: 1.5, vl: 1.5, rout: 70, iq: 3e-3 },
    AD8541: { a0: 1e5, gbw: 1e6, sr: 0.92e6, vh: 0.02, vl: 0.02, rout: 50, iq: 45e-6 },
    ADTL082: { a0: 2e5, gbw: 5e6, sr: 20e6, vh: 1.5, vl: 1.5, rout: 50, iq: 1.4e-3 },
    OP482: { a0: 1e5, gbw: 4e6, sr: 9e6, vh: 1.5, vl: 1.5, rout: 50, iq: 0.21e-3 }
}

// O LM358 DO BIN SIMULADOR NÃO TEM <spice>: AS DUAS METADES PELO MACRO-MODELO (PINOS 3, 2, 8, 4, 1 E 5, 6, 8, 4, 7)
const BUILTIN: Record<string, { lines: string[], models: string[] }> = {
    [LM358]: { lines: ['X{instanceTitle}A {net connector2} {net connector1} {net connector7} {net connector3} {net connector0} CM_LM358', 'X{instanceTitle}B {net connector4} {net connector5} {net connector7} {net connector3} {net connector6} CM_LM358'], models: [] }
}

// MACRO-MODELO DE AMP-OP (inp inn vcc vee out): TRANSCONDUTÂNCIA LIMITADA (SLEW RATE) NUM POLO DOMINANTE RC (GANHO a0 E PRODUTO GANHO-BANDA gbw), NÓ DO POLO PRESO AOS TRILHOS MENOS A FOLGA POR DIODOS E SAÍDA POR UM SEGUIDOR COM rout
export const opampModel = (name: string, { a0, gbw, sr, vh, vl, rout, iq }: Opamp) => {
    const c    = a0 / (2 * Math.PI * gbw * R_POLE)
    const imax = sr * c
    return [`.subckt ${name} inp inn vcc vee out`, 'Rcmp inp 0 1e9', 'Rcmn inn 0 1e9', 'Rin inp inn 2Meg', 'Rlkp vcc 0 1e9', 'Rlkn vee 0 1e9', `Rq vcc vee ${SUPPLY / iq}`, `Bgm 0 n1 I=max(min(${a0 / R_POLE}*V(inp,inn),${imax}),${-imax})`, `R1 n1 0 ${R_POLE}`, `C1 n1 0 ${c}`, 'Ehi hi 0 vcc 0 1', `Vhi hi dhi ${vh}`, 'Dhi n1 dhi CMCLAMP', 'Elo lo 0 vee 0 1', `Vlo dlo lo ${vl}`, 'Dlo dlo n1 CMCLAMP', 'Eout nb 0 n1 0 1', `Rout nb out ${rout}`, '.model CMCLAMP D(IS=1e-15 N=0.1)', '.ends'].join('\n')
}

// LINHAS E MODELOS SPICE DA PEÇA; SUBCIRCUITO DE AMP-OP QUE O ACERVO NÃO TRAZ VEM DO MACRO-MODELO
export const getSpice = (part: Part) => {
    const own   = part.spice.lines.length ? part.spice : BUILTIN[part.moduleId] ?? { lines: AC_SPICE[(part.properties.variant ?? '').toLowerCase()] ?? [], models: [] }
    const named = [...new Set(own.lines.map(line => line.trim().split(/\s+/).pop() ?? ''))].filter(name => OPAMPS[name] && !own.models.some(model => model.toLowerCase().includes(`.subckt ${name.toLowerCase()} `)))
    return named.length ? { lines: own.lines, models: [...own.models, ...named.map(name => opampModel(name, OPAMPS[name]))] } : own
}

const compareKeys = (a: string, b: string) => {
    const [indexA, idA] = splitKey(a)
    const [indexB, idB] = splitKey(b)
    return Number(indexA) - Number(indexB) || idA.localeCompare(idB)
}

export const getProperty = (part: Part, instance: Instance, name: string) => instance.properties[name] ?? part.properties[name] ?? ''

// NETS DO ESQUEMÁTICO (SEM PONTAS DE FIO) EM ORDEM DETERMINÍSTICA, COM A NET DE TERRA NA POSIÇÃO 0; ground FIXA O TERRA PELA NET QUE CONTÉM ESSA PORTA (SPEC 04 §2.1)
export const getNets = (doc: Doc, library: Library, netlist: Netlist, ground: string | null = null) => {
    const labels = netlist.nets.schematicView ?? new Uint32Array()
    const groups = new Map<number, string[]>()
    const nameOf = (key: string) => {
        const [modelIndex, connectorId] = splitKey(key)
        return library.getPart(doc.instances[modelIndex]?.moduleIdRef ?? '')?.connectors.find(connector => connector.id === connectorId)?.name.trim().toLowerCase() ?? ''
    }

    netlist.keys.forEach((key, node) => {
        if (doc.instances[splitKey(key)[0]]?.moduleIdRef === 'WireModuleID')
            return

        const group = groups.get(labels[node]) ?? []
        group.push(key)
        groups.set(labels[node], group)
    })

    const nets   = [...groups.values()].map(keys => keys.sort(compareKeys)).sort((a, b) => compareKeys(a[0], b[0]))
    const multi  = nets.filter(net => net.length >= 2)
    const minus  = (net: string[]) => net.some(key => nameOf(key) === '-')
    const chosen = (ground ? nets.find(net => net.includes(ground)) : undefined) ?? multi.filter(net => net.some(key => GROUNDED.has(nameOf(key)))).at(-1) ?? multi.find(minus) ?? nets.find(minus) ?? nets[0]
    return chosen ? [chosen, ...nets.filter(net => net !== chosen)] : nets
}

// VALOR DE PROPRIEDADE PARA O SPICE: SEM SÍMBOLO DA UNIDADE, M→Meg, µ→u, SEM Ω (SPEC 04 §3)
const spiceValue = (moduleId: string, name: string, value: string) => {
    const symbol = getSymbol(moduleId, name)
    const bare   = symbol && value.trim().endsWith(symbol) ? value.trim().slice(0, -symbol.length) : value
    return bare.replaceAll('M', 'Meg').replace(/[µμ]/g, 'u').replaceAll('Ω', '').trim()
}

// SUBSTITUIÇÃO DO TOKEN MAIS INTERNO A PARTIR DA POSIÇÃO CORRENTE; TOKEN DESCONHECIDO FICA E A BUSCA AVANÇA (SPEC 04 §3)
export const substitute = (template: string, resolve: (token: string, before: string) => string | null) => {
    let text = template
    let from = 0

    for (let match = TOKEN.exec(text.slice(from)); match; match = TOKEN.exec(text.slice(from))) {
        const start = from + match.index
        const value = resolve(match[1], text[start - 1] ?? '')

        if (value === null) {
            from = start + match[0].length
            continue
        }

        text = text.slice(0, start) + value + text.slice(start + match[0].length)
        from = start
    }

    return text
}

const resolver = (part: Part, instance: Instance, nodes: Map<string, string>) => (token: string, before: string) => {
    const name  = token.trim().toLowerCase()
    const title = instance.title.replaceAll(' ', '_')

    if (name === 'instancetitle')
        return title[0]?.toLowerCase() === before.toLowerCase() ? title.slice(1) : title

    if (name.startsWith('net ')) {
        const connector = part.connectors.find(item => item.id.toLowerCase() === name.slice(4).trim())
        return connector ? nodes.get(keyOf(instance.modelIndex, connector.id)) ?? '' : ''
    }

    const value = getProperty(part, instance, name)

    if (value.trim())
        return spiceValue(part.moduleId, name, value)

    return name in part.properties || ZERO_DEFAULTS.has(name) ? '0' : null
}

const ILIMIT: Record<string, number> = { gain: 1, in_offset: 0, r_out_source: 1, r_out_sink: 1, i_limit_source: 0.01, i_limit_sink: 0.01 }

// SEM XSPICE NO WASM: O ilimit VIRA DUAS FONTES COMPORTAMENTAIS, A QUE FORNECE TIRA DE pos_pwr E A QUE ABSORVE DEVOLVE EM neg_pwr (SPEC 04 §10.1)
export const replaceIlimit = (deck: string) => {
    const lines  = deck.split('\n')
    const models = new Map(lines.flatMap(line => {
        const match = line.match(/^\.model\s+(\S+)\s+ilimit\s*\((.*)\)\s*$/i)
        const given = match ? Object.fromEntries([...match[2].matchAll(/(\w+)\s*=\s*([^\s,]+)/g)].map(([, key, value]) => [key.toLowerCase(), spiceNumber(value)]).filter(([, value]) => Number.isFinite(value))) : {}
        return match ? [[match[1].toLowerCase(), { ...ILIMIT, ...given }]] : []
    }))

    return lines.flatMap(line => {
        const fields = line.trim().split(/\s+/)
        const model  = /^a/i.test(fields[0] ?? '') && fields.length === 6 ? models.get(fields[5].toLowerCase()) : undefined

        if (/^\.model\s+\S+\s+ilimit/i.test(line))
            return []

        if (!model)
            return [line]

        const [name, input, pos, neg, out] = fields
        const target = `${model.gain}*(V(${input})+${model.in_offset})`
        return [`B${name.slice(1)}p ${pos} ${out} I=min(max(0,(${target}-V(${out}))/${model.r_out_source}),${model.i_limit_source})`, `B${name.slice(1)}n ${out} ${neg} I=min(max(0,(V(${out})-${target})/${model.r_out_sink}),${model.i_limit_sink})`]    // NO EMPATE A DERIVADA DO max DO NGSPICE É A DO 2º ARGUMENTO: COM CORRENTE ZERO (CARGA SÓ CAPACITIVA) A SAÍDA MANTÉM 1/r E NÃO FICA SOLTA
    }).join('\n')
}

export const projectValue = (doc: Doc, key: string) => doc.projectProperties[key] ?? PROJECT_DEFAULTS[key]

// JANELA DO PROJETO: MANUAL QUANDO O USUÁRIO DIGITOU O FIM DO TEMPO DE SIMULAÇÃO, SENÃO AUTOMÁTICA
export const getMode = (doc: Doc): Mode => parseSi(projectValue(doc, STOP_KEY), 's') !== null ? 'custom' : 'auto'

// JANELA E PASSO DO TRANSITÓRIO: MANUAL USA A JANELA E O PASSO DO USUÁRIO; AUTOMÁTICO USA A DOS OSCILOSCÓPIOS OU A ESCALA DE TEMPO DO CIRCUITO COM OS SINAIS DAS FONTES (SEM NENHUMA, 0–10 s); ANIMAÇÃO NEGATIVA É TEMPO REAL E ZERO MOSTRA O FIM DE UMA VEZ (SPEC 04 §5.2, §5.5)
export const getTransient = (doc: Doc, library: Library, simulated: string[], timing: Timing): Extract<Analysis, { type: 'tran' }> => {
    const scopes = simulated.map(modelIndex => doc.instances[modelIndex]).filter(instance => (library.getPart(instance.moduleIdRef)?.properties.family ?? '').toLowerCase().includes('oscilloscope'))
    const ranges = scopes.map(instance => {
        const part = library.getPart(instance.moduleIdRef) as Part
        const hpos = parseSi(getProperty(part, instance, 'horizontal position'), 's') ?? 0
        return [hpos, hpos + 10 * (parseSi(getProperty(part, instance, 'time/div'), 's') ?? 0)]
    })

    const start     = parseSi(projectValue(doc, START_KEY), 's') ?? 0
    const stop      = parseSi(projectValue(doc, STOP_KEY), 's')
    const custom    = stop !== null && stop > start && start >= 0
    const asked     = parseSi(projectValue(doc, 'simulator_number_of_steps')) || 400
    const window    = custom || ranges.length ? null : getWindow(timing, asked)
    const scoped    = ranges.length && Math.max(...ranges.map(range => range[1])) > 0
    const t0        = custom ? start : window || !ranges.length ? WINDOW[0] : Math.min(...ranges.map(range => range[0]))
    const t1        = custom && stop !== null ? stop : window ? window.stop : scoped ? Math.max(...ranges.map(range => range[1])) : WINDOW[1]
    const fixedStep = !window && projectValue(doc, 'simulator_time_step_mode').toLowerCase().includes('true')
    const wanted    = fixedStep ? parseSi(projectValue(doc, 'simulator_time_step_s'), 's') ?? 1e-6 : (t1 - t0) / (window?.points ?? asked)
    const step      = wanted > 0 ? wanted : (t1 - t0) / 400
    const steps     = Math.max(1, Math.round((t1 - t0) / step))
    const animation = parseSi(projectValue(doc, 'simulator_animation_time_s'), 's') ?? 0
    const interval  = animation < 0 ? (t1 - t0) * 1000 / steps : animation * 1000 / steps
    const initial   = custom && projectValue(doc, INITIAL_KEY) === 'zero' ? 'zero' : 'op'
    return { type: 'tran', t0, t1, step, steps, interval, mode: custom ? 'custom' : 'auto', initial }
}

// DIRETIVA DO TRANSITÓRIO; COM O CIRCUITO DESCARREGADO, UIC USA OS IC=0 DOS CAPACITORES E INDUTORES EM VEZ DO PONTO DE OPERAÇÃO
export const tranCommand = (analysis: Extract<Analysis, { type: 'tran' }>) => `.TRAN ${analysis.step} ${analysis.t1} ${analysis.t0}${analysis.initial === 'zero' ? ' UIC' : ''}`

const partnersOf = (doc: Doc, key: string) => doc.edges.filter(edge => edge.includes(key)).map(([a, b]) => a === key ? b : a)

const STUB_VIEW = { layer: '', locked: false, bottom: false, geometry: { x: 0, y: 0, z: 0, transform: null, line: [0, 0, 0, 0] as [number, number, number, number], wireFlags: 0, size: null }, wire: null, connectors: [], label: null, hidden: [] }

// CORTE DE CADA PONTA DE CORRENTE NO GRAFO: AS LIGAÇÕES DA PONTA connector1 DO FIO (OU DO PINO) PASSAM PARA UM TOCO DE FIO NOVO, SEPARANDO OS DOIS LADOS QUE A FONTE DE 0 V VAI LIGAR; CORTES EM SÉRIE FICAM LIGADOS PELOS TOCOS (SPEC 04 §8.7)
export const cutProbes = (doc: Doc, probes: Probe[]) => probes.filter(probe => probe.kind !== 'voltage').reduce((current, probe) => {
    const [modelIndex] = splitKey(probe.key)
    const wire         = current.doc.instances[modelIndex]?.moduleIdRef === 'WireModuleID'
    const stub         = String(current.doc.nextIndex)
    const moved        = wire ? keyOf(modelIndex, 'connector1') : probe.key
    const partners     = partnersOf(current.doc, moved)
    const instance     = { moduleIdRef: 'WireModuleID', modelIndex: stub, path: '', title: '', text: '', properties: {}, localConnectors: {}, views: { breadboardView: STUB_VIEW, schematicView: STUB_VIEW, pcbView: STUB_VIEW } }
    const cut          = addInstance(removeEdges(current.doc, edge => edge.includes(moved)), instance)
    const sides        = wire ? [keyOf(modelIndex, 'connector0'), keyOf(stub, 'connector0')] : [keyOf(stub, 'connector0'), probe.key]
    return { doc: addEdges(cut, partners.map((partner): Edge => [keyOf(stub, 'connector0'), partner])), sides: new Map([...current.sides, [probe.id, sides]]) }
}, { doc, sides: new Map<string, string[]>() })

const probeSource = (id: string) => `Vprobe_${id.replace(/\W/g, '_')}`

// COMUTAÇÕES PROGRAMADAS POR INSTÂNCIA, DO JSON DO PROJETO, COM OS EVENTOS EM ORDEM DE TEMPO; ENTRADA MAL FORMADA FICA DE FORA
export const getSwitching = (doc: Doc): Record<string, Plan> => {
    const text = projectValue(doc, SWITCH_KEY)

    if (!text)
        return {}

    try {
        const raw = JSON.parse(text) as Record<string, Partial<Plan>>
        return Object.fromEntries(Object.entries(raw ?? {}).flatMap(([modelIndex, plan]) => {
            const events = Array.isArray(plan?.events) ? plan.events.filter((event): event is Event => Array.isArray(event) && Number.isFinite(event[0]) && event[0] >= 0 && typeof event[1] === 'boolean') : []
            return typeof plan?.pressed === 'string' && typeof plan.released === 'string' && events.length ? [[modelIndex, { pressed: plan.pressed, released: plan.released, events: [...events].sort((a, b) => a[0] - b[0]) }]] : []
        }))
    } catch (error) {
        if (error instanceof SyntaxError)
            return {}

        throw error
    }
}

// CHAVE OU BOTÃO COM POSIÇÃO TROCÁVEL PELAS VARIANTES Released/Pressed DA FAMÍLIA; A DE 3 PINOS ALTERNA ENTRE DOIS CONTATOS
export const switchOf = (part: Part | undefined) => part?.properties['switch status'] && (part.properties.family ?? '').toLowerCase().includes('switch') ? { pressed: part.properties['switch status'] === 'Pressed', spdt: part.connectors.length === 3 } : null

// ESTADO DA CHAVE NO INSTANTE t: O DA PEÇA ATÉ O PRIMEIRO EVENTO, DEPOIS O DO ÚLTIMO EVENTO JÁ PASSADO
export const isPressedAt = (plan: Plan, initial: boolean, t: number) => plan.events.reduce((pressed, [time, state]) => time <= t ? state : pressed, initial)

// SINAL DE CONTROLE 0 (SOLTA) A 1 (ACIONADA) COM UMA RAMPA CURTA EM CADA COMUTAÇÃO; EVENTO EM t = 0 DÁ O ESTADO INICIAL
const controlWave = (plan: Plan, initial: boolean, ramp: number) => {
    const start  = plan.events.filter(([time]) => time === 0).reduce((_, [, state]) => state, initial)
    const points = plan.events.filter(([time]) => time > 0).reduce<[number, number][]>((list, [time, state]) => {
        const [last, level] = list[list.length - 1]
        const at            = Math.max(time, last + ramp)
        return (level === 1) === state ? list : [...list, [at, level], [at + ramp, state ? 1 : 0]]
    }, [[0, start ? 1 : 0]])
    return `PWL(${points.flat().map(value => +value.toPrecision(12)).join(' ')})`
}

// CHAVE PROGRAMADA: OS CONTATOS FECHADOS DE CADA VARIANTE (LINHAS R DO <spice> DA ACIONADA E DA SOLTA) VIRAM CONDUTÂNCIAS COMANDADAS PELO SINAL DE CONTROLE COM RAMPA ramp; PARA A ESCALA DE TEMPO, SÓ OS CONTATOS DE UMA VARIANTE COMO RESISTORES (SPEC 04 §8.10)
const switchLines = (instance: Instance, nodes: Map<string, string>, plan: Plan, library: Library, initial: boolean, ramp: number | 'pressed' | 'released') => {
    const title    = instance.title.replace(/\W/g, '_')
    const control  = `sw_${title}`
    const volts    = (a: string, b: string) => a === '0' ? `-V(${b})` : b === '0' ? `V(${a})` : `V(${a},${b})`
    const contacts = (moduleId: string) => {
        const part = library.getPart(moduleId)
        const text = part ? substitute(getSpice(part).lines.join('\n'), resolver(part, instance, nodes)) : ''
        return text.split('\n').map(line => line.trim().split(/\s+/)).filter(([name, a, b]) => /^r/i.test(name ?? '') && a && b && a !== b).map(([, a, b, value]): [string, string, number] => [a, b, spiceNumber(value ?? '') > 0 ? spiceNumber(value ?? '') : CONTACT])
    }
    const share    = (pressed: boolean) => pressed ? `V(${control})` : `(1-V(${control}))`
    const wave     = `V${title}_sw ${control} 0 ${controlWave(plan, initial, typeof ramp === 'number' ? ramp : 1e-12)}\n`
    const variants = [[plan.pressed, true, 'p'], [plan.released, false, 'r']] as const

    if (typeof ramp !== 'number')
        return wave + contacts(ramp === 'pressed' ? plan.pressed : plan.released).map(([a, b, ohms], i) => `R${title}_c${i} ${a} ${b} ${ohms}\n`).join('')

    return wave + variants.flatMap(([moduleId, pressed, tag]) => contacts(moduleId).map(([a, b, ohms], i) => `B${title}_${tag}${i} ${a} ${b} I=${volts(a, b)}*(${G_OPEN}+${1 / ohms - G_OPEN}*${share(pressed)})\n`)).join('')
}

const VOLTAGE   = /^(V.*?\s)(?:DC\s+)?\{voltage\}\s*$/i    // LINHA DA FONTE DE TENSÃO DO ACERVO (FONTE DC, BATERIA, FONTE DE BANCADA) QUE GANHA O SINAL
const EDGE      = 1e-3    // FRAÇÃO DO PERÍODO (OU DA ESCALA) NAS BORDAS DO DEGRAU E DA ONDA QUADRADA
const SCALE     = 1e-3    // s, ESCALA DE TEMPO DE UM CIRCUITO SEM CONSTANTE DE TEMPO (SÓ RESISTORES)
const RAMP_TAUS = 5       // DURAÇÃO PADRÃO DA RAMPA EM ESCALAS DE TEMPO DO CIRCUITO

export const isVoltageSource = (part: Part | undefined) => part !== undefined && getSpice(part).lines.some(line => VOLTAGE.test(line))

export const signalOf = (instance: Instance): Signal => SIGNALS.find(([id]) => id === instance.properties[SIGNAL_KEY])?.[0] ?? 'dc'

// ESCALA DE TEMPO DO CIRCUITO COM AS FONTES CONTÍNUAS: A MAIOR CONSTANTE DE TEMPO, SENÃO O PERÍODO DA RESSONÂNCIA MAIS LENTA
const scaleOf = (timing: Timing) => Math.max(0, ...timing.constants) || Math.max(0, ...timing.resonances.map(item => 1 / item.frequency)) || SCALE

const rampOf = (instance: Instance, scale: number) => parseSi(instance.properties[RAMP_KEY] ?? '', 's') ?? RAMP_TAUS * scale

// A TENSÃO DA FONTE TROCADA PELO SINAL ESCOLHIDO NELA; COMEÇANDO EM 0, O PONTO DE OPERAÇÃO DE t = 0 JÁ É O CIRCUITO EM REPOUSO
export const signalWave = (instance: Instance, volts: string, scale: number) => {
    const signal = signalOf(instance)
    const sine   = signal === 'sine'
    const period = 1 / (parseSi(instance.properties[FREQUENCY_KEY] ?? '', 'Hz') ?? (sine ? 1 / (2 * Math.PI * scale) : 1 / (10 * scale)))
    const ramp   = rampOf(instance, scale)
    const edge   = (signal === 'square' ? period : scale) * EDGE

    return signal === 'step'   ? `PWL(0 0 ${edge} ${volts})` :
           signal === 'ramp'   ? `PWL(0 0 ${ramp} ${volts})` :
           signal === 'sine'   ? `SIN(0 ${volts} ${1 / period} 0 0 0)` :
           signal === 'square' ? `PULSE(0 ${volts} 0 ${edge} ${edge} ${period / 2 - edge} ${period} 0)` : `DC ${volts}`
}

// DECK DO NGSPICE A PARTIR DO GRAFO: PEÇAS COM <spice> LIGADAS A ALGUMA NET COM 2+ MEMBROS, MAIS UMA FONTE DE 0 V POR PONTA DE CORRENTE (SPEC 04 §2–§4, §8.7)
export const buildCircuit = (doc: Doc, library: Library, netlist: Netlist, transient: boolean): Circuit => {
    const ground    = getNets(doc, library, netlist)[0]?.[0] ?? null
    const { doc: split, sides } = cutProbes(doc, doc.probes)
    const cut       = sides.size ? new Netlist(split, library, netlist.wasm) : netlist

    if (cut !== netlist)
        cut.update()

    const nets      = getNets(split, library, cut, ground)
    const labels    = cut.nets.schematicView ?? new Uint32Array()
    const labelOf   = (key: string) => labels[cut.index.get(key) ?? 0]
    const touched   = [...sides.values()].flat().filter(key => cut.index.has(key)).map(labelOf)
    const loose     = [...new Set(touched)].filter(label => !nets.some(net => labelOf(net[0]) === label))
    const byLabel   = new Map([...nets.map((net, i) => [labelOf(net[0]), String(i)] as const), ...loose.map((label, i) => [label, String(nets.length + i)] as const)])
    const nodeOf    = (key: string | undefined) => key !== undefined && cut.index.has(key) ? byLabel.get(labelOf(key)) ?? null : null
    const nodes     = new Map(cut.keys.flatMap(key => nodeOf(key) !== null ? [[key, nodeOf(key) as string] as const] : []))
    const ends      = touched.reduce((count, label) => count.set(label, (count.get(label) ?? 0) + 1), new Map<number, number>())
    const dangling  = (key: string) => loose.includes(labelOf(key)) && ends.get(labelOf(key)) === 1
    const cuts      = [...sides].map(([id, [a, b]]) => ({ id, a: dangling(a) ? null : nodeOf(a), b: dangling(b) ? null : nodeOf(b) }))
    const placed    = cuts.filter(({ a, b }) => a !== null && b !== null && a !== b)
    const extra     = placed.flatMap(({ a, b }) => [a, b])
    const sizes     = new Map(nets.map((net, i) => [String(i), net.length + extra.filter(node => node === String(i)).length]))
    const simulated = Object.values(split.instances).filter(instance => {
        const part = library.getPart(instance.moduleIdRef)
        return part && getSpice(part).lines.join('').trim() && part.connectors.some(connector => (sizes.get(nodes.get(keyOf(instance.modelIndex, connector.id)) ?? '') ?? 0) >= 2)
    }).sort((a, b) => a.title.localeCompare(b.title))

    const plans    = transient ? getSwitching(doc) : {}
    const timed    = (instance: Instance) => plans[instance.modelIndex] && library.getPart(plans[instance.modelIndex].pressed) && library.getPart(plans[instance.modelIndex].released) ? plans[instance.modelIndex] : null
    const linesFor = (ramp: number | 'pressed' | 'released', scale: number | null = null) => simulated.map(instance => {
        const part = library.getPart(instance.moduleIdRef) as Part
        const plan = timed(instance)
        const own  = getSpice(part).lines.map(line => scale !== null ? line.replace(VOLTAGE, (_, head: string) => head + signalWave(instance, '{voltage}', scale)) : line)
        return plan ? switchLines(instance, nodes, plan, library, part.properties['switch status'] === 'Pressed', ramp) : substitute(own.map(line => `${line}\n`).join(''), resolver(part, instance, nodes))
    })
    const sources  = placed.map(({ id, a, b }) => `${probeSource(id)} ${a} ${b} DC 0\n`)
    const models   = [...new Map(simulated.map(instance => getSpice(library.getPart(instance.moduleIdRef) as Part).models.join('\n')).filter(Boolean).map(model => [model.toLowerCase(), model] as const)).values()]
    const indexes  = simulated.map(instance => instance.modelIndex)
    const timingOf = (scale: number | null) => joinTiming((['pressed', 'released'] as const).map(state => getTiming(linesFor(state, scale).join('') + sources.join(''))))
    const scale    = transient ? scaleOf(timingOf(null)) : null
    const base     = scale !== null ? timingOf(scale) : null
    const ramps    = scale !== null ? simulated.filter(instance => signalOf(instance) === 'ramp' && isVoltageSource(library.getPart(instance.moduleIdRef))).map(instance => rampOf(instance, scale)) : []
    const timing   = base && { ...base, events: [...base.events, ...ramps] }    // O FIM DA RAMPA CONTA COMO COMUTAÇÃO: A JANELA VAI ATÉ ACOMODAR DEPOIS DELE
    const analysis = timing ? getTransient(doc, library, indexes, timing) : { type: 'op' as const }
    const lines    = linesFor(analysis.type === 'tran' ? analysis.step * RAMP : 'pressed', scale)
    const command  = analysis.type === 'tran' ? tranCommand(analysis) : '.OP'
    const options  = projectValue(doc, 'simulator_spice_options')
    const deck     = [TITLE, lines.join('') + sources.join(''), ...models, '.option savecurrents', '.option interp', ...options ? [options] : [], command, '*.TRAN 1ms 100ms', '* .AC DEC 100 100 1MEG', '.END'].join('\n')
    const charged  = analysis.type !== 'tran' || analysis.initial === 'op'

    const meters = new Map(doc.probes.map((probe): [string, Meter] => {
        const own    = cuts.find(item => item.id === probe.id)
        const source = own && placed.includes(own) ? `${probeSource(probe.id).toLowerCase()}#branch` : null
        return [probe.id, { node: own ? own.a ?? own.b : nodeOf(probe.key), current: source, sign: probe.flip ? -1 : 1, open: own !== undefined && (own.a === null || own.b === null) }]
    }))

    return { deck: replaceIlimit(charged ? deck.replace(/IC=0(?![\d.])/g, '') : deck), source: deck, nodes, simulated: indexes, analysis, meters }
}

// NETLIST SPICE EXPORTADO COMO O DO FRITZING: TÍTULO = NOME DO SKETCH, SEM AS OPÇÕES DO PROJETO NEM PONTAS DE PROVA, .OP, IC=0 E O ilimit DO XSPICE MANTIDOS (SPEC 04 §4)
export const exportSpice = (doc: Doc, library: Library, netlist: Netlist, name: string) => buildCircuit({ ...doc, probes: [], projectProperties: { ...doc.projectProperties, simulator_spice_options: '' } }, library, netlist, false).source.replace(TITLE, name)

const END_SLACK  = 1e-9    // FOLGA RELATIVA NO FIM DA CONTINUAÇÃO: A SOMA DOS PASSOS NO NGSPICE PASSA DO FIM EXATO E PERDERIA O ÚLTIMO PONTO
const WAVE_DELAY: Record<string, number> = { pulse: 2, sin: 3 }    // POSIÇÃO DO TD NOS ARGUMENTOS DE PULSE(V1 V2 TD …) E SIN(VO VA FREQ TD …)

// PWL VISTO A PARTIR DE from: O VALOR INTERPOLADO NESSE INSTANTE EM t = 0 E OS PONTOS SEGUINTES COM O TEMPO DESLOCADO
const shiftPwl = (values: number[], from: number) => {
    const points = Array.from({ length: Math.floor(values.length / 2) }, (_, i): [number, number] => [values[2 * i], values[2 * i + 1]])
    const next   = points.findIndex(([time]) => time > from)
    const before = points[next - 1] ?? points[0]
    const after  = points[next]
    const level  = next < 0 ? points[points.length - 1][1] : next === 0 ? after[1] : before[1] + (after[1] - before[1]) * (from - before[0]) / (after[0] - before[0] || 1)
    return [0, level, ...(next < 0 ? [] : points.slice(next).flatMap(([time, value]) => [+(time - from).toPrecision(12), value]))]
}

// FONTES QUE DEPENDEM DO TEMPO COM O ATRASO DIMINUÍDO DE from: NA CONTINUAÇÃO O TEMPO DO NGSPICE RECOMEÇA EM 0 E A FASE TEM DE SEGUIR A DO INSTANTE ABSOLUTO
export const shiftSources = (deck: string, from: number) => deck.replace(/\bPWL\s*\(([^)]*)\)/gi, (_, args: string) => `PWL(${shiftPwl(args.trim().split(/[\s,]+/).map(spiceNumber), from).join(' ')})`).replace(/\b(PULSE|SIN)\s*\(([^)]*)\)/gi, (_, name: string, args: string) => {
    const tokens = args.match(/\{[^}]*\}|[^\s,]+/g) ?? []
    const index  = WAVE_DELAY[name.toLowerCase()]
    const delay  = tokens[index] ?? '0'
    const filled = [...tokens, ...Array(Math.max(0, index + 1 - tokens.length)).fill('0')]
    filled[index] = delay.startsWith('{') ? `{(${delay.slice(1, -1)})-${from}}` : String(spiceNumber(delay) - from)
    return `${name}(${filled.join(' ')})`
})

// CONTINUAÇÃO DO TRANSITÓRIO NO PASSO keep: AS TENSÕES DE NÓ DADAS VIRAM .ic, AS FONTES SÃO ADIANTADAS ATÉ O INSTANTE E O .TRAN CORRE OS PASSOS QUE FALTAM COM UIC (SPEC 04 §5.3)
export const resumeCircuit = (circuit: Circuit, initial: [string, number][], keep: number): Circuit => {
    const analysis = circuit.analysis

    if (analysis.type !== 'tran')
        return circuit

    const from = analysis.t0 + keep * analysis.step
    const ic   = initial.length ? `.ic ${initial.map(([node, value]) => `v(${node})=${value.toFixed(8)}`).join(' ')}\n` : ''
    const deck = shiftSources(circuit.deck, from).replace(/IC=0(?![\d.])/g, '').replace(tranCommand(analysis), `${ic}.TRAN ${analysis.step} ${(analysis.steps - keep) * analysis.step * (1 + END_SLACK)} 0 UIC`)
    return { ...circuit, deck }
}
