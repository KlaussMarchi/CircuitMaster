import { keyOf, splitKey, type Doc } from '../../core/Document'
import type { Library } from '../../core/Library'
import type { Part } from '../../core/Part'
import type { Instance } from '../../core/Sketch'
import type { Point } from '../../core/Geometry'
import { getSymbol, parseSi } from '../../core/Properties'
import { getProperty, getSpice, type Circuit } from '../../core/Spice'
import type { Vectors } from '../../core/Ngspice'
import { milsToPx } from '../../core/Units'

export type Trace   = { color: string, points: Point[], label: string, marker: number, at: Point }
export type Effect  = { smoke: boolean, color: string | null, light: number, display: string[] | null, arrow: 'cw' | 'ccw' | null, scope: Partial<Record<'breadboardView' | 'schematicView', Trace[]>> | null }
export type Reading = { voltage: ArrayLike<number> | null, current: ArrayLike<number> | null }
export type Stats   = { value: number, min: number, max: number, mean: number, rms: number, pp: number, frequency: number | null }

const FAMILIES: [string[], string][] = [[['capacitor'], 'capacitor'], [['diode'], 'diode'], [['led'], 'led'], [['resistor'], 'resistor'], [['multimeter'], 'multimeter'], [['dc motor'], 'motor'], [['line sensor', 'distance sensor'], 'sensor'], [['battery', 'voltage source'], 'source'], [['potentiometer', 'sparkfun trimpot'], 'potentiometer'], [['oscilloscope'], 'oscilloscope']]

const LED_COLORS: Record<string, string> = {
    'Infrared (940nm)': '#666666', 'Infrared (880nm)': '#999999', 'Infrared (850nm)': '#c0c0c0', 'Red (660nm)': '#ff114d', 'Red (635nm)': '#ff0000', 'Red (633nm)': '#e60000',
    'Orange (620nm)': '#ff5b0d', 'Orange (612nm)': '#ff9a35', 'Orange (605nm)': '#ff9a35', 'Yellow (595nm)': '#fadf47', 'Yellow (592nm)': '#fbe446', 'Yellow (585nm)': '#ffea00',
    'Yellow (574nm)': '#deffa2', 'Green (570nm)': '#17ff8b', 'Green (565nm)': '#00d76b', 'Green (560nm)': '#00cc80', 'Green (555nm)': '#00b33b', 'Blue (525nm)': '#00d9d3',
    'Blue (505nm)': '#07d2fe', 'Blue (470nm)': '#3851fe', 'Blue (430nm)': '#0000ee', 'White (4500K)': '#cccccc', 'White (6500K)': '#ffffff', 'White (8000K)': '#ffecfe',
    'Red': '#ff0000', 'Yellow': '#ffff00', 'Green': '#00ff00', 'Blue': '#0000ff', 'White': '#ffffff', 'Orange': '#ffc200'
}

const OFF_COLOR        = 0.3        // FRAÇÃO DA COR COM O LED APAGADO
const BRIGHT_GAIN      = 4          // BRILHO MÁXIMO DA COR EM b = 1/4
const IDLE_BRIGHTNESS  = (1 - OFF_COLOR) / BRIGHT_GAIN
const RGB_GREY         = '#e6e6e6'
const HARMFUL_NEGATIVE = -0.5       // V REVERSO QUE QUEIMA CAPACITOR POLARIZADO
const SAFETY           = 0.1        // FRAÇÃO DA CORRENTE DE CURTO ACEITA PELA BATERIA
const TINY             = 1e-12
const DISPLAY_DIGITS   = 5
const SCOPE_COLORS     = ['#ffff50', 'lightgreen', 'lightblue', 'pink']
const SCOPE_LEGEND     = 1.35      // LEGENDA ABAIXO DA TELA, EM UNIDADES DA MARGEM SUPERIOR
const SCOPE_SCREEN     = { width: 3376.022, height: 2700.072, breadboardView: [290.544, 259.061], schematicView: [906.07449, 354.60801] } as const
const SI_LETTERS       = [['p', 1e-12], ['n', 1e-9], ['µ', 1e-6], ['m', 1e-3], ['', 1], ['k', 1e3], ['M', 1e6], ['G', 1e9], ['T', 1e12]] as const
const HYSTERESIS       = 0.1        // FRAÇÃO DO PICO A PICO PARA CONTAR UMA PASSAGEM PELA MÉDIA
const FLAT             = 1e-6       // PICO A PICO MENOR QUE ISSO DO NÍVEL É RUÍDO NUMÉRICO DO SOLVER
const STILL            = 1e-4       // VARIAÇÃO DE UM VETOR DO TRANSITÓRIO ABAIXO DISSO DO NÍVEL NÃO SE VÊ: É REGIME (O LED DC VARIA 2e-6)

export const ledBase = (part: Part, instance: Instance) => LED_COLORS[getProperty(part, instance, 'color')] ?? null

// COR DOS ELEMENTOS color_* DO LED: c' = min(255, ⌊0,3c + min(1, 4b)·c⌋) (SPEC 04 §8.3)
export const ledColor = (base: string, brightness: number) => {
    const level = Math.min(1, Math.max(0, brightness) * BRIGHT_GAIN)
    const value = parseInt(base.slice(1), 16)
    return `#${[16, 8, 0].map(shift => Math.min(255, Math.floor(OFF_COLOR * ((value >> shift) & 255) + level * ((value >> shift) & 255))).toString(16).padStart(2, '0')).join('')}`
}

export const idleColor = (base: string) => ledColor(base, IDLE_BRIGHTNESS)

// NÚMERO NO DISPLAY DE 5 POSIÇÕES: PREFIXO SI, CASAS CONFORME A POSIÇÃO DO PONTO, k→K, ESPAÇOS À ESQUERDA (SPEC 04 §8.4)
export const toDisplay = (value: number) => {
    const x       = Math.abs(value) < TINY ? 0 : value
    const pick    = x === 0 ? SI_LETTERS[4] : SI_LETTERS.find(([, scale]) => Math.abs(x) < 1000 * scale) ?? SI_LETTERS[SI_LETTERS.length - 1]
    const point   = (x / pick[1]).toFixed(6).indexOf('.')
    const text    = `${(x / pick[1]).toFixed(Math.max(0, 4 - point))}${pick[0]}`.replace('k', 'K')
    const visible = text.replace('.', '').length
    return ' '.repeat(Math.max(0, DISPLAY_DIGITS - visible)) + text
}

// MEDIDAS DE UMA SÉRIE ATÉ O PASSO last, PONDERADAS PELO TEMPO NO TRANSITÓRIO (MÉDIA = NÍVEL DC, RMS, PICO A PICO E FREQUÊNCIA PELAS SUBIDAS PELA MÉDIA)
const isFlat = (min: number, max: number, tolerance = FLAT) => max - min <= Math.max(tolerance * Math.max(Math.abs(max), Math.abs(min)), TINY)

const span = (values: ArrayLike<number>) => Array.from(values).reduce<[number, number]>(([min, max], value) => [Math.min(min, value), Math.max(max, value)], [Infinity, -Infinity])

export const getStats = (values: ArrayLike<number>, time: ArrayLike<number> | null, last: number): Stats => {
    const count = Math.max(1, Math.min(last + 1, values.length))
    const list  = Array.from({ length: count }, (_, i) => values[i])
    const span  = time && count > 1 ? time[count - 1] - time[0] : 0
    const area  = (read: (value: number) => number) => span > 0 && time ? list.slice(1).reduce((sum, value, i) => sum + (read(value) + read(list[i])) / 2 * (time[i + 1] - time[i]), 0) / span : list.reduce((sum, value) => sum + read(value), 0) / count
    const [min, max] = [Math.min(...list), Math.max(...list)]
    const mean  = area(value => value)
    const band  = (max - min) * HYSTERESIS / 2
    const rises: number[] = []
    let low     = list[0] < mean - band

    list.forEach((value, i) => {
        if (low && value > mean + band)
            rises.push(time?.[i] ?? i)

        low = value < mean - band ? true : value > mean + band ? false : low
    })

    const flat      = isFlat(min, max)
    const frequency = time && rises.length > 1 && !flat ? (rises.length - 1) / (rises[rises.length - 1] - rises[0]) : null
    return { value: list[count - 1], min, max, mean, rms: Math.sqrt(Math.max(0, area(value => value * value))), pp: flat ? 0 : max - min, frequency }
}

export const familyOf = (part: Part) => {
    const family = (part.properties.family ?? '').toLowerCase()
    return FAMILIES.find(([needles]) => needles.some(needle => family.includes(needle)))?.[1] ?? null
}

// RESULTADO DA SIMULAÇÃO LIDO POR PASSO: TENSÕES, CORRENTES E O ESTADO VISUAL DE CADA PEÇA (SPEC 04 §7–§8)
export class Simulation {
    doc: Doc
    library: Library
    circuit: Circuit
    vectors: Vectors
    steps: number
    still: boolean | null = null

    constructor(doc: Doc, library: Library, circuit: Circuit, vectors: Vectors) {
        this.doc     = doc
        this.library = library
        this.circuit = circuit
        this.vectors = vectors
        this.steps   = vectors.time?.length ?? 1
    }

    // NADA MUDA NO TEMPO: TODO VETOR DO TRANSITÓRIO FICA PARADO (PICO A PICO NO RUÍDO DO SOLVER); O PAINEL MOSTRA O REGIME, SEM ANIMAÇÃO (FRIZING_KICAD §5, DECISÃO 2)
    isStill() {
        this.still ??= this.circuit.analysis.type === 'op' || Object.entries(this.vectors).every(([name, values]) => name === 'time' || isFlat(...span(values), STILL))
        return this.still
    }

    getTime(step: number) {
        return this.vectors.time?.[Math.min(step, this.steps - 1)] ?? 0
    }

    getSeries(name: string, step: number) {
        const series = this.vectors[name.toLowerCase()]
        return series ? series[Math.min(step, series.length - 1)] ?? 0 : 0
    }

    getVoltage(key: string, step: number) {
        const node = this.circuit.nodes.get(key)
        return !node || node === '0' ? 0 : this.vectors[`v(${node})`] ? this.getSeries(`v(${node})`, step) : this.getSeries(node, step)
    }

    getNodeSeries(node: string) {
        const series = this.vectors[`v(${node})`] ?? this.vectors[node]
        return node === '0' || !series ? new Float64Array(this.steps) : series
    }

    getPart(modelIndex: string) {
        return this.library.getPart(this.doc.instances[modelIndex]?.moduleIdRef ?? '')
    }

    findKey(modelIndex: string, test: (name: string, description: string) => boolean) {
        const connector = this.getPart(modelIndex)?.connectors.find(item => test(item.name.trim().toLowerCase(), item.description.trim().toLowerCase()))
        return connector ? keyOf(modelIndex, connector.id) : null
    }

    getBetween(a: string | null, b: string | null, step: number) {
        return a && b ? this.getVoltage(a, step) - this.getVoltage(b, step) : 0
    }

    // NOME DO VETOR DE CORRENTE PELA LETRA DO DISPOSITIVO DA PRIMEIRA LINHA SPICE (SPEC 04 §7)
    getCurrentName(modelIndex: string, sub = '') {
        const instance = this.doc.instances[modelIndex]
        const part     = this.getPart(modelIndex)
        const text     = part ? getSpice(part).lines.join('\n') : ''
        const device   = (text[text.toLowerCase().indexOf('{instancetitle}') - 1] ?? '').toLowerCase()
        const title    = `${(instance?.title ?? '').replaceAll(' ', '_').toLowerCase()}${sub.toLowerCase()}`
        const prefixed = title.startsWith(device) ? title : `${device}${title}`

        if ('rcl'.includes(device) && device)
            return `@${prefixed}[i]`

        if (device === 'd')
            return `@${prefixed}[id]`

        return 'efghbiv'.includes(device) && device ? `${prefixed}#branch` : null
    }

    getCurrent(modelIndex: string, step: number, sub = '') {
        const name = this.getCurrentName(modelIndex, sub)
        return name ? this.getSeries(name, step) : 0
    }

    // TENSÃO ENTRE OS DOIS PINOS E CORRENTE DE UMA PEÇA DE DOIS TERMINAIS SIMULADA; NULO NAS OUTRAS
    getReading(modelIndex: string, step: number) {
        const part = this.getPart(modelIndex)

        if (!part || part.connectors.length !== 2 || !this.circuit.simulated.includes(modelIndex))
            return null

        const [a, b] = part.connectors.map(connector => keyOf(modelIndex, connector.id))
        return { voltage: this.getBetween(a, b, step), current: this.getCurrent(modelIndex, step) }
    }

    getMax(modelIndex: string, name: string) {
        const instance = this.doc.instances[modelIndex]
        const part     = this.getPart(modelIndex)
        const text     = part && instance ? getProperty(part, instance, name) : ''
        const symbol   = part ? getSymbol(part.moduleId, name) : ''

        if (!text.trim())
            return Infinity

        return parseSi(symbol ? text : text.replace(/[^pnuµmkMGT^\d.]/g, ''), symbol) ?? Infinity
    }

    isWired(key: string | null) {
        return key !== null && this.doc.edges.some(([a, b]) => (a === key && this.isWire(b)) || (b === key && this.isWire(a)))
    }

    isWire(key: string) {
        return this.doc.instances[splitKey(key)[0]]?.moduleIdRef === 'WireModuleID'
    }

    getMultimeter(modelIndex: string, step: number): string {
        const part    = this.getPart(modelIndex)
        const variant = (part?.properties.variant ?? '').toLowerCase()
        const com     = this.findKey(modelIndex, name => name === 'com probe')
        const volt    = this.findKey(modelIndex, name => name === 'v probe')
        const amp     = this.findKey(modelIndex, name => name === 'a probe')
        const ac      = variant.includes('(ac)')
        const rms     = (values: number[]) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / Math.max(1, values.length))
        const upTo    = (read: (index: number) => number) => Array.from({ length: Math.min(step, this.steps - 1) + 1 }, (_, index) => read(index))

        if (this.isWired(com) && this.isWired(volt) && this.isWired(amp))
            return 'ERR'

        if (variant.startsWith('voltmeter') && this.isWired(amp))
            return 'ERR'

        if (variant.startsWith('voltmeter'))
            return this.isWired(com) && this.isWired(volt) ? toDisplay(ac ? rms(upTo(index => this.getBetween(volt, com, index))) : this.getBetween(volt, com, step)) : ''

        if (variant.startsWith('ammeter') && this.isWired(volt))
            return 'ERR'

        if (variant.startsWith('ammeter'))
            return toDisplay(ac ? rms(upTo(index => this.getCurrent(modelIndex, index))) : this.getCurrent(modelIndex, step))

        if (variant === 'ohmmeter' && this.isWired(amp))
            return 'ERR'

        return variant === 'ohmmeter' ? toDisplay(Math.abs(this.getBetween(volt, com, step) / this.getCurrent(modelIndex, step))) : ''
    }

    getScope(modelIndex: string, step: number): Effect['scope'] {
        const instance = this.doc.instances[modelIndex]
        const part     = this.getPart(modelIndex)

        if (!part || !instance)
            return null

        const read     = (name: string, symbol: string) => parseSi(getProperty(part, instance, name), symbol) ?? 0
        const channels = Math.min(4, Math.max(1, Math.round(read('channels', ''))))
        const timeDiv  = read('time/div', 's') || 1
        const hpos     = read('horizontal position', 's')
        const com      = this.findKey(modelIndex, name => name === 'com probe')
        const division = SCOPE_SCREEN.height / 8
        const trace    = (view: 'breadboardView' | 'schematicView') => Array.from({ length: channels }, (_, channel): Trace[] => {
            const probe = this.findKey(modelIndex, name => name === `v${channel + 1} probe`)

            if (!this.isWired(probe))
                return []

            const voltsDiv = read(`ch${channel + 1} volts/div`, 'V') || 1
            const offset   = read(`ch${channel + 1} offset`, 'V')
            const [x0, y0] = SCOPE_SCREEN[view]
            const points   = Array.from({ length: Math.min(step, this.steps - 1) + 1 }, (_, index) => index).filter(index => this.getTime(index) >= hpos && this.getTime(index) <= hpos + 10 * timeDiv).map((index): Point => {
                const value = this.getVoltage(probe ?? '', index) - (this.isWired(com) ? this.getVoltage(com ?? '', index) : 0)
                const x     = x0 + (this.getTime(index) - hpos) / timeDiv * SCOPE_SCREEN.width / 10
                const y     = Math.min(y0 + SCOPE_SCREEN.height, Math.max(y0, y0 + SCOPE_SCREEN.height / 2 - (value + offset) / voltsDiv * division))
                return [milsToPx(x), milsToPx(y)]
            })
            const marker   = milsToPx(y0 + SCOPE_SCREEN.height / 2 - offset / voltsDiv * division)
            const at: Point = [milsToPx(x0 + division * channel), milsToPx(SCOPE_SCREEN.height + y0 * SCOPE_LEGEND)]
            return [{ color: SCOPE_COLORS[channel], points, label: `CH${channel + 1}: ${toDisplay(voltsDiv).trim()}V`, marker, at }]
        }).flat()

        return { breadboardView: trace('breadboardView'), schematicView: trace('schematicView') }
    }

    getEffect(modelIndex: string, step: number): Effect {
        const part     = this.getPart(modelIndex)
        const instance = this.doc.instances[modelIndex]
        const effect   = { smoke: false, color: null, light: 0, display: null, arrow: null, scope: null } as Effect
        const family   = part ? familyOf(part) : null
        const keys     = part?.connectors.map(connector => keyOf(modelIndex, connector.id)) ?? []

        if (!part || !instance)
            return effect

        if (family === 'capacitor') {
            const voltage = this.getBetween(this.findKey(modelIndex, name => name === '+'), this.findKey(modelIndex, name => name === '-'), step)
            const max     = this.getMax(modelIndex, 'voltage')
            const polar   = !(part.properties.family ?? '').toLowerCase().includes('bidirectional')
            return { ...effect, smoke: polar ? voltage > max / 2 || voltage < HARMFUL_NEGATIVE : Math.abs(voltage) > max }
        }

        if (family === 'diode')
            return { ...effect, smoke: Math.abs(this.getBetween(keys[0], keys[1], step)) * Math.abs(this.getCurrent(modelIndex, step)) > this.getMax(modelIndex, 'power') }

        if (family === 'led' && !getProperty(part, instance, 'rgb')) {
            const current = this.getCurrent(modelIndex, step)
            const max     = this.getMax(modelIndex, 'current')
            const base    = ledBase(part, instance)
            const level   = current > max ? 0 : current / max
            return { ...effect, smoke: current > max, color: base ? ledColor(base, level) : null, light: level }
        }

        if (family === 'led') {
            const levels = ['R', 'G', 'B'].map(sub => this.getCurrent(modelIndex, step, sub) / this.getMax(modelIndex, 'current'))
            const burnt  = Math.max(...levels) > 1
            const color  = `#${levels.map(level => Math.min(230, Math.floor(40 + 800 * (burnt ? 0 : Math.max(0, level)))).toString(16).padStart(2, '0')).join('')}`
            return { ...effect, smoke: burnt, color: levels.some(level => level > 0) && !burnt ? color : RGB_GREY, light: burnt ? 0 : Math.max(...levels) }
        }

        if (family === 'resistor') {
            const voltage = this.getBetween(this.findKey(modelIndex, name => name === 'pin 0'), this.findKey(modelIndex, name => name === 'pin 1'), step)
            return { ...effect, smoke: Math.abs(voltage * this.getCurrent(modelIndex, step)) > this.getMax(modelIndex, 'power') }
        }

        if (family === 'multimeter')
            return { ...effect, display: [this.getMultimeter(modelIndex, step)] }

        if (family === 'motor') {
            const voltage = this.getBetween(this.findKey(modelIndex, name => name === 'pin 1'), this.findKey(modelIndex, name => name === 'pin 2'), step)
            const turning = Math.abs(voltage) >= this.getMax(modelIndex, 'voltage (min)')
            return { ...effect, smoke: Math.abs(voltage) > this.getMax(modelIndex, 'voltage (max)'), arrow: turning ? voltage > 0 ? 'cw' : 'ccw' : null }
        }

        if (family === 'sensor') {
            const pick    = (needles: string[]) => this.findKey(modelIndex, (_, description) => needles.includes(description))
            const voltage = this.getBetween(pick(['vcc', 'supply voltage']), pick(['gnd', 'ground']), step)
            const current = (part.properties.family ?? '').toLowerCase().includes('line sensor') ? this.getSeries(`@q${instance.title.toLowerCase()}[ic]`, step) : this.getCurrent(modelIndex, step, 'a')
            return { ...effect, smoke: voltage > this.getMax(modelIndex, 'voltage (max)') || voltage < HARMFUL_NEGATIVE || Math.abs(current) > this.getMax(modelIndex, 'max output current') }
        }

        if (family === 'source') {
            const current = this.getCurrent(modelIndex, step)
            const short   = Math.abs(current) > SAFETY * this.getMax(modelIndex, 'voltage') / this.getMax(modelIndex, 'internal resistance')
            const lab     = part.moduleId.includes('LabDCPowerSupply')
            return { ...effect, smoke: short, display: lab ? [toDisplay(this.getBetween(keyOf(modelIndex, 'connector0'), keyOf(modelIndex, 'connector1'), step)), toDisplay(-current)] : null }
        }

        if (family === 'potentiometer') {
            const max   = this.getMax(modelIndex, 'maximum resistance')
            const knob  = this.getMax(modelIndex, 'knob status')
            const power = max * knob / 100 * this.getCurrent(modelIndex, step, 'A') ** 2 + max * (100 - knob) / 100 * this.getCurrent(modelIndex, step, 'B') ** 2
            return { ...effect, smoke: power > this.getMax(modelIndex, 'power') }
        }

        if (family === 'oscilloscope')
            return { ...effect, scope: this.getScope(modelIndex, step) }

        return effect
    }

    getEffects(step: number) {
        return new Map(this.circuit.simulated.map(modelIndex => [modelIndex, this.getEffect(modelIndex, step)]))
    }

    // SÉRIES DE UMA PONTA DE PROVA: TENSÃO DA NET EM RELAÇÃO AO TERRA E CORRENTE PELA FONTE DE 0 V DO CORTE (ZERO COM UM LADO EM ABERTO) (SPEC 04 §8.7)
    getProbe(id: string): Reading {
        const meter   = this.circuit.meters.get(id)
        const node    = meter?.node ?? null
        const raw     = meter?.current ? this.vectors[meter.current] : undefined
        const voltage = node === '0' ? new Float64Array(this.steps) : node ? this.vectors[`v(${node})`] ?? this.vectors[node] ?? null : null
        const current = raw && meter ? Float64Array.from(raw, value => value * meter.sign) : meter?.open ? new Float64Array(this.steps) : null
        return { voltage, current }
    }
}

// COM O CIRCUITO DESCARREGADO (UIC) O NGSPICE NÃO GRAVA t = 0: ENTRA NO COMEÇO O INSTANTE ANTES DE LIGAR, COM TUDO EM ZERO (SPEC 04 §5.5)
export const fromRest = (vectors: Vectors): Vectors => {
    if (!vectors.time?.length || vectors.time[0] <= 0)
        return vectors

    return Object.fromEntries(Object.entries(vectors).map(([name, values]) => {
        const joined = new Float64Array(values.length + 1)
        joined.set(values, 1)
        return [name, joined]
    }))
}

// TENSÃO NO PASSO keep DE CADA NÓ DO CIRCUITO NOVO, LIDA NO NÓ ANTIGO DE UMA PORTA EM COMUM (A NUMERAÇÃO DAS NETS PODE MUDAR) (SPEC 04 §5.3)
export const getInitial = (previous: Simulation, circuit: Circuit, keep: number): [string, number][] => [...new Map([...circuit.nodes].flatMap(([key, node]) => {
    const old = previous.circuit.nodes.get(key)
    return node !== '0' && old ? [[node, previous.getNodeSeries(old)[keep] ?? 0] as const] : []
})).entries()]

// HISTÓRICO ATÉ O PASSO keep (INCLUSIVE: É A CONDIÇÃO INICIAL) SEGUIDO DA CONTINUAÇÃO ATÉ COMPLETAR OS PASSOS DA JANELA, QUE COM UIC COMEÇA EM t = Δ: TEMPO DESLOCADO, TENSÃO DE NÓ PELA PORTA EM COMUM, O RESTO PELO NOME (ZERO SE NÃO EXISTIA) (SPEC 04 §5.3)
export const joinRuns = (previous: Simulation, keep: number, circuit: Circuit, vectors: Vectors): Vectors => {
    const offset = previous.getTime(keep)
    const half   = (offset - previous.getTime(keep - 1)) / 2
    const skip   = (vectors.time?.[0] ?? half) < half ? 1 : 0
    const older  = new Map<string, string>()

    circuit.nodes.forEach((node, key) => {
        const old = previous.circuit.nodes.get(key)

        if (old && !older.has(node))
            older.set(node, old)
    })

    const history = (name: string) => {
        const node   = name.match(/^v\((.+)\)$/)?.[1]
        const old    = node !== undefined ? older.get(node) : undefined
        const series = name === 'time' ? previous.vectors.time : node !== undefined ? old !== undefined ? previous.getNodeSeries(old) : undefined : previous.vectors[name]
        return series ? Float64Array.from({ length: keep + 1 }, (_, i) => series[i] ?? 0) : new Float64Array(keep + 1)
    }

    return Object.fromEntries(Object.entries(vectors).map(([name, values]) => {
        const after  = values.subarray(skip, skip + previous.steps - keep - 1)
        const joined = new Float64Array(keep + 1 + after.length)
        joined.set(history(name))
        joined.set(name === 'time' ? after.map(t => t + offset) : after, keep + 1)
        return [name, joined]
    }))
}
