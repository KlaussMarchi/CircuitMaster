import { keyOf, splitKey, type Doc } from '../Document'
import type { Library } from '../Library'
import type { Netlist } from '../Netlist'
import type { Part } from '../Part'
import type { Instance } from '../Sketch'
import { getSymbol, parseSi } from '../Properties'

export type Analysis = { type: 'op' } | { type: 'tran', t0: number, t1: number, step: number, steps: number, interval: number }
export type Circuit  = { deck: string, nodes: Map<string, string>, simulated: string[], analysis: Analysis }

const TITLE         = 'Simulator Netlist'
const GROUNDED      = new Set(['gnd', 'vss', 'ground'])
const ZERO_DEFAULTS = new Set(['inductance', 'resistance', 'current', 'tolerance', 'power', 'capacitance', 'voltage'])
const WINDOW        = [0, 10]    // S, TRANSITÓRIO SEM OSCILOSCÓPIO (SPEC 04 §5.2)
const MIN_FRAME     = 10         // MS ENTRE QUADROS DA ANIMAÇÃO
const TOKEN         = /\{([^{}]*)\}/

const PROJECT_DEFAULTS: Record<string, string> = { simulator_time_step_mode: 'false', simulator_number_of_steps: '400', simulator_time_step_s: '1us', simulator_animation_time_s: '5s', simulator_spice_options: '' }

// AS VARIANTES AC DO MULTÍMETRO NÃO TÊM <spice> NO ACERVO: USAM O MODELO DA VARIANTE DC (SPEC 04 §8.6)
const AC_SPICE: Record<string, string[]> = {
    'voltmeter (ac)': ['* Multimeter, com probe connected to {net connector0} and voltage probe connected to {net connector1}'],
    'ammeter (ac)': ['V{instanceTitle} {net connector2} {net connector0} DC 0']
}

export const getSpice = (part: Part) => part.spice.lines.length ? part.spice : { lines: AC_SPICE[(part.properties.variant ?? '').toLowerCase()] ?? [], models: [] }

const compareKeys = (a: string, b: string) => {
    const [indexA, idA] = splitKey(a)
    const [indexB, idB] = splitKey(b)
    return Number(indexA) - Number(indexB) || idA.localeCompare(idB)
}

export const getProperty = (part: Part, instance: Instance, name: string) => instance.properties[name] ?? part.properties[name] ?? ''

// NETS DO ESQUEMÁTICO (SEM PONTAS DE FIO) EM ORDEM DETERMINÍSTICA, COM A NET DE TERRA NA POSIÇÃO 0 (SPEC 04 §2.1)
export const getNets = (doc: Doc, library: Library, netlist: Netlist) => {
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
    const ground = multi.filter(net => net.some(key => GROUNDED.has(nameOf(key)))).at(-1) ?? multi.find(minus) ?? nets.find(minus) ?? nets[0]
    return ground ? [ground, ...nets.filter(net => net !== ground)] : nets
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

const projectValue = (doc: Doc, key: string) => doc.projectProperties[key] ?? PROJECT_DEFAULTS[key]

// JANELA E PASSO DO TRANSITÓRIO: OSCILOSCÓPIOS DEFINEM [t0, t1], O PROJETO DEFINE O PASSO E A ANIMAÇÃO (SPEC 04 §5.2)
export const getTransient = (doc: Doc, library: Library, simulated: string[]): Analysis => {
    const scopes = simulated.map(modelIndex => doc.instances[modelIndex]).filter(instance => (library.getPart(instance.moduleIdRef)?.properties.family ?? '').toLowerCase().includes('oscilloscope'))
    const ranges = scopes.map(instance => {
        const part = library.getPart(instance.moduleIdRef) as Part
        const hpos = parseSi(getProperty(part, instance, 'horizontal position'), 's') ?? 0
        return [hpos, hpos + 10 * (parseSi(getProperty(part, instance, 'time/div'), 's') ?? 0)]
    })

    const t0        = ranges.length ? Math.min(...ranges.map(range => range[0])) : WINDOW[0]
    const t1        = ranges.length && Math.max(...ranges.map(range => range[1])) > 0 ? Math.max(...ranges.map(range => range[1])) : WINDOW[1]
    const fixedStep = projectValue(doc, 'simulator_time_step_mode').toLowerCase().includes('true')
    const step      = fixedStep ? parseSi(projectValue(doc, 'simulator_time_step_s'), 's') ?? 1e-6 : (t1 - t0) / (parseSi(projectValue(doc, 'simulator_number_of_steps')) ?? 400)
    const steps     = Math.max(1, Math.round((t1 - t0) / step))
    const animation = parseSi(projectValue(doc, 'simulator_animation_time_s'), 's') ?? 5
    const interval  = Math.max(MIN_FRAME, animation > 0 ? animation * 1000 / steps : (t1 - t0) * 1000 / steps)
    return { type: 'tran', t0, t1, step, steps, interval }
}

// DECK DO NGSPICE A PARTIR DO GRAFO: PEÇAS COM <spice> LIGADAS A ALGUMA NET COM 2+ MEMBROS (SPEC 04 §2–§4)
export const buildCircuit = (doc: Doc, library: Library, netlist: Netlist, transient: boolean): Circuit => {
    const nets      = getNets(doc, library, netlist)
    const nodes     = new Map(nets.flatMap((net, i) => net.map(key => [key, String(i)] as const)))
    const sizes     = new Map(nets.flatMap(net => net.map(key => [key, net.length] as const)))
    const simulated = Object.values(doc.instances).filter(instance => {
        const part = library.getPart(instance.moduleIdRef)
        return part && getSpice(part).lines.join('').trim() && part.connectors.some(connector => (sizes.get(keyOf(instance.modelIndex, connector.id)) ?? 0) >= 2)
    }).sort((a, b) => a.title.localeCompare(b.title))

    const lines    = simulated.map(instance => {
        const part = library.getPart(instance.moduleIdRef) as Part
        return substitute(getSpice(part).lines.map(line => `${line}\n`).join(''), resolver(part, instance, nodes))
    })
    const models   = [...new Map(simulated.map(instance => getSpice(library.getPart(instance.moduleIdRef) as Part).models.join('\n')).filter(Boolean).map(model => [model.toLowerCase(), model] as const)).values()]
    const indexes  = simulated.map(instance => instance.modelIndex)
    const analysis = transient ? getTransient(doc, library, indexes) : { type: 'op' as const }
    const command  = analysis.type === 'tran' ? `.TRAN ${analysis.step} ${analysis.t1} ${analysis.t0}` : '.OP'
    const options  = projectValue(doc, 'simulator_spice_options')
    const deck     = [TITLE, lines.join(''), ...models, '.option savecurrents', '.option interp', ...options ? [options] : [], command, '*.TRAN 1ms 100ms', '* .AC DEC 100 100 1MEG', '.END'].join('\n')
    return { deck: deck.replace(/IC=0(?![\d.])/g, ''), nodes, simulated: indexes, analysis }
}
