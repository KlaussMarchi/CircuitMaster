export type Element   = { kind: string, name: string, nodes: string[], value: number, wave: string }
export type Source    = { name: string, kind: 'pulse' | 'sin', period: number, delay: number, rise: number, width: number }
export type Resonance = { frequency: number, damping: number, settling: number }
export type Timing    = { constants: number[], resonances: Resonance[], sources: Source[], events: number[] }

const SCALES: [string, number][] = [['meg', 1e6], ['mil', 25.4e-6], ['t', 1e12], ['g', 1e9], ['k', 1e3], ['m', 1e-3], ['u', 1e-6], ['µ', 1e-6], ['n', 1e-9], ['p', 1e-12], ['f', 1e-15]]
const OPEN = 'dqmxabefghijkostuwyz'    // SEMICONDUTORES, SUBCIRCUITOS E FONTES CONTROLADAS: ABERTOS NA ESTIMATIVA

// NÚMERO SPICE: SUFIXO DE ESCALA (MEG, MIL, T, G, K, M, U, N, P, F) E O RESTO DAS LETRAS IGNORADO COMO UNIDADE (100uF, 60Hz, 5V); TEXTO QUE NÃO É NÚMERO DÁ NaN
export const spiceNumber = (text: string) => {
    const match = text.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(\S*)$/i)
    const unit  = match?.[2].toLowerCase() ?? ''
    const scale = SCALES.find(([prefix]) => unit.startsWith(prefix))
    return match ? Number(match[1]) * (scale?.[1] ?? 1) : NaN
}

// EXPRESSÃO ARITMÉTICA ENTRE CHAVES ({50/100*10k}): NÚMEROS SPICE, + − * /, PARÊNTESES E SINAL; OUTRA COISA DÁ NaN
export const evaluate = (text: string) => {
    const tokens = text.match(/\d+\.?\d*(?:e[+-]?\d+)?[a-zµ]*|\.\d+(?:e[+-]?\d+)?[a-zµ]*|[-+*/()]|\S/gi) ?? []
    let position = 0

    const factor = (): number => {
        const token = tokens[position++] ?? ''

        if (token === '(') {
            const value = sum()
            return tokens[position++] === ')' ? value : NaN
        }

        return token === '-' ? -factor() : token === '+' ? factor() : spiceNumber(token)
    }

    const product = (): number => {
        let value = factor()

        while (tokens[position] === '*' || tokens[position] === '/')
            value = tokens[position++] === '*' ? value * factor() : value / factor()

        return value
    }

    const sum = (): number => {
        let value = product()

        while (tokens[position] === '+' || tokens[position] === '-')
            value = tokens[position++] === '+' ? value + product() : value - product()

        return value
    }

    const value = sum()
    return position === tokens.length ? value : NaN
}

const valueOf = (text: string) => text.startsWith('{') ? evaluate(text.replace(/[{}]/g, '')) : spiceNumber(text)

// LINHAS DE ELEMENTO DO DECK (CONTINUAÇÕES JUNTADAS, SEM COMENTÁRIOS, COMANDOS NEM O CORPO DOS .subckt); O VALOR DE R, C E L E A ONDA DAS FONTES
export const getElements = (deck: string): Element[] => {
    const lines = deck.split('\n').reduce<string[]>((joined, line) => line.trim().startsWith('+') && joined.length ? [...joined.slice(0, -1), `${joined[joined.length - 1]} ${line.trim().slice(1)}`] : [...joined, line.trim()], [])
    let depth   = 0

    return lines.flatMap(line => {
        const lower = line.toLowerCase()
        depth += lower.startsWith('.subckt') ? 1 : lower.startsWith('.ends') ? -1 : 0

        if (depth > 0 || lower.startsWith('.ends') || !line || '*.'.includes(line[0]))
            return []

        const fields = line.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|\w+\s*\([^)]*\)|\S+/g) ?? []
        const kind   = line[0].toLowerCase()
        const count  = 'rclvi'.includes(kind) ? 2 : 0
        const rest   = fields.slice(1 + count)
        const value  = 'rcl'.includes(kind) ? valueOf(rest[0] ?? '') : NaN
        return [{ kind, name: fields[0] ?? '', nodes: fields.slice(1, 1 + count), value, wave: rest.join(' ') }]
    })
}

// PERÍODO DAS FONTES PULSE(V1 V2 TD TR TF PW PER) E SIN(VO VA FREQ TD …) DO DECK
const getSources = (elements: Element[]) => elements.filter(element => element.kind === 'v').flatMap((element): Source[] => {
    const match = element.wave.match(/(pulse|sin)\s*\(([^)]*)\)/i)
    const args  = (match?.[2] ?? '').trim().split(/[\s,]+/).map(valueOf)
    const kind  = match?.[1].toLowerCase()

    if (kind === 'pulse' && args[6] > 0)
        return [{ name: element.name, kind: 'pulse', period: args[6], delay: args[2] || 0, rise: args[3] || 0, width: args[5] || 0 }]

    if (kind === 'sin' && args[2] > 0)
        return [{ name: element.name, kind: 'sin', period: 1 / args[2], delay: args[3] || 0, rise: 0, width: 0 }]

    return []
})

// INSTANTES EM QUE AS FONTES PWL COMEÇAM A MUDAR DE VALOR (COMUTAÇÕES PROGRAMADAS), DEPOIS DE t = 0
const getEvents = (elements: Element[]) => elements.filter(element => element.kind === 'v').flatMap(element => {
    const match  = element.wave.match(/pwl\s*\(([^)]*)\)/i)
    const values = (match?.[1] ?? '').trim().split(/[\s,]+/).filter(Boolean).map(valueOf)
    return Array.from({ length: Math.floor(values.length / 2) }, (_, i) => i).filter(i => i > 0 && values[2 * i + 1] !== values[2 * i - 1] && values[2 * i - 2] > 0).map(i => values[2 * i - 2])
})

// RESISTÊNCIA ENTRE a E b COM AS FONTES DE TENSÃO E OS ELEMENTOS DE shorted EM CURTO; O QUE NÃO É RESISTOR FICA ABERTO (INFINITO SEM CAMINHO)
const getSeen = (elements: Element[], shorted: Element[], a: string, b: string) => {
    const parent = new Map<string, string>()
    const find   = (node: string): string => parent.has(node) && parent.get(node) !== node ? find(parent.get(node) as string) : node
    shorted.forEach(element => parent.set(find(element.nodes[0]), find(element.nodes[1])))

    const [start, end] = [find(a), find(b)]
    const edges = elements.filter(element => element.kind === 'r' && element.value > 0 && Number.isFinite(element.value)).map(element => [find(element.nodes[0]), find(element.nodes[1]), 1 / element.value] as const).filter(([p, q]) => p !== q)

    if (start === end)
        return 0

    const reached = new Set([start])

    for (let grown = true; grown;) {
        const before = reached.size
        edges.filter(([p, q]) => reached.has(p) || reached.has(q)).forEach(([p, q]) => reached.add(p).add(q))
        grown = reached.size > before
    }

    if (!reached.has(end))
        return Infinity

    const nodes  = [...reached].filter(node => node !== end)
    const index  = new Map(nodes.map((node, i) => [node, i]))
    const matrix = nodes.map(() => new Array(nodes.length + 1).fill(0))

    edges.forEach(([p, q, g]) => {
        const [i, j] = [index.get(p), index.get(q)]

        if (i !== undefined)
            matrix[i][i] += g

        if (j !== undefined)
            matrix[j][j] += g

        if (i !== undefined && j !== undefined) {
            matrix[i][j] -= g
            matrix[j][i] -= g
        }
    })

    matrix[index.get(start) ?? 0][nodes.length] = 1
    return solve(matrix)[index.get(start) ?? 0]
}

// ELIMINAÇÃO DE GAUSS COM PIVÔ PARCIAL NA MATRIZ AUMENTADA [A | b]
const solve = (matrix: number[][]) => {
    const n = matrix.length

    for (let column = 0; column < n; column++) {
        const pivot = matrix.slice(column).reduce((best, row, i) => Math.abs(row[column]) > Math.abs(matrix[best][column]) ? column + i : best, column)
        ;[matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]]

        for (let row = column + 1; row < n; row++) {
            const factor = matrix[row][column] / (matrix[column][column] || 1e-30)
            matrix[row] = matrix[row].map((value, k) => value - factor * matrix[column][k])
        }
    }

    const result = new Array<number>(n).fill(0)

    for (let row = n - 1; row >= 0; row--)
        result[row] = (matrix[row][n] - matrix[row].slice(row + 1, n).reduce((sum, value, k) => sum + value * result[row + 1 + k], 0)) / (matrix[row][row] || 1e-30)

    return result
}

// ESCALAS DE TEMPO DO CIRCUITO: τ = R·C DE CADA CAPACITOR E L/R DE CADA INDUTOR PELA RESISTÊNCIA QUE ELE VÊ (FONTES EM CURTO), E A FREQUÊNCIA NATURAL, O AMORTECIMENTO E A ACOMODAÇÃO DE CADA PAR L–C COM UM NÓ EM COMUM (SPEC 04 §5.5)
export const getTiming = (deck: string): Timing => {
    const elements   = getElements(deck).filter(element => !OPEN.includes(element.kind) || element.kind === 'v')
    const reactive   = (kind: string) => elements.filter(element => element.kind === kind && element.value > 0 && Number.isFinite(element.value))
    const sources    = elements.filter(element => element.kind === 'v')
    const [cs, ls]   = [reactive('c'), reactive('l')]
    const fromC      = cs.map(c => c.value * getSeen(elements, [...sources, ...ls], c.nodes[0], c.nodes[1]))
    const fromL      = ls.map(l => l.value / getSeen(elements, sources, l.nodes[0], l.nodes[1]))
    const constants  = [...fromC, ...fromL].filter(tau => tau > 0 && Number.isFinite(tau))
    const pairs      = ls.flatMap(l => cs.filter(c => c.nodes.some(node => node !== '0' && l.nodes.includes(node))).map(c => [l, c] as const))
    const resonances = pairs.map(([l, c]) => {
        const wn    = 1 / Math.sqrt(l.value * c.value)
        const rl    = getSeen(elements, [...sources, c], l.nodes[0], l.nodes[1])
        const rc    = getSeen(elements, sources, c.nodes[0], c.nodes[1])
        const alpha = (Number.isFinite(rl) ? rl / (2 * l.value) : 0) + (rc > 0 && Number.isFinite(rc) ? 1 / (2 * rc * c.value) : 0)
        const zeta  = alpha / wn
        const slow  = zeta >= 1 ? wn * (zeta - Math.sqrt(zeta ** 2 - 1)) : alpha
        return { frequency: wn / (2 * Math.PI), damping: zeta, settling: slow > 0 ? 4 / slow : Infinity }
    })

    return { constants, resonances, sources: getSources(getElements(deck)), events: getEvents(getElements(deck)) }
}

// ESCALAS DE MAIS DE UMA VERSÃO DO MESMO CIRCUITO (CHAVES FECHADAS E ABERTAS), SEM REPETIR FONTES NEM EVENTOS
export const joinTiming = (timings: Timing[]): Timing => ({
    constants: timings.flatMap(timing => timing.constants),
    resonances: timings.flatMap(timing => timing.resonances),
    sources: timings[0]?.sources ?? [],
    events: [...new Set(timings.flatMap(timing => timing.events))]
})

export type Preset = 'auto' | 'step' | 'square' | 'sine'
export type Window = { stop: number, points: number }

const SETTLE     = 6         // CONSTANTES DE TEMPO ATÉ A RESPOSTA DE 1ª ORDEM FICAR A 0,25% DO FINAL
const MARGIN     = 1.5       // FOLGA SOBRE A ACOMODAÇÃO DE 2ª ORDEM
const UNDAMPED   = 10        // PERÍODOS MOSTRADOS DE UMA RESSONÂNCIA SEM PERDAS
const PULSES     = 3         // PERÍODOS DA ONDA QUADRADA
const CYCLES     = 5         // PERÍODOS DA SENOIDE
const PER_CYCLE  = 40        // AMOSTRAS POR PERÍODO DA OSCILAÇÃO MAIS RÁPIDA
const POINTS     = 500       // AMOSTRAS DOS MODELOS DE TESTE
const MAX_POINTS = 20000
const LIMITS     = [1e-9, 1e4]    // s

const NICE  = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
const SLACK = 0.02    // UM VALOR REDONDO ATÉ 2% ABAIXO SERVE

// ARREDONDA PARA CIMA NUM VALOR REDONDO DA SÉRIE NICE × 10ⁿ
const nice = (value: number) => {
    const base = 10 ** Math.floor(Math.log10(value))
    return NICE.map(factor => Number((factor * base).toPrecision(12))).find(candidate => candidate >= value * (1 - SLACK)) ?? 10 * base
}

// JANELA DE CADA MODELO DE TESTE: DEGRAU ATÉ ACOMODAR (6τ OU 1,5× A ACOMODAÇÃO DE 2ª ORDEM), ONDA QUADRADA EM 3 PERÍODOS DO PULSO, SENOIDE EM 5 PERÍODOS, AUTOMÁTICO O MAIOR DE TODOS, SEMPRE ATÉ ACOMODAR DEPOIS DA ÚLTIMA COMUTAÇÃO PROGRAMADA; AMOSTRAS PARA 40 POR OSCILAÇÃO; NULO SEM ESCALA NENHUMA (SPEC 04 §5.5)
export const getWindow = (timing: Timing, preset: Preset, points = POINTS): Window | null => {
    const tau      = Math.max(0, ...timing.constants)
    const settle   = Math.max(SETTLE * tau, ...timing.resonances.map(item => Number.isFinite(item.settling) ? MARGIN * item.settling : UNDAMPED / item.frequency), 0)
    const longest  = (kind: Source['kind'] | null, count: number) => Math.max(0, ...timing.sources.filter(item => !kind || item.kind === kind).map(item => item.delay + count * item.period))
    const last     = Math.max(0, ...timing.events)
    const after    = (span: number) => last ? Math.max(span, last + (settle || last)) : span
    const options  = { step: after(settle || longest(null, PULSES)), square: after(longest('pulse', PULSES) || settle), sine: after(longest('sin', CYCLES) || Math.max(settle, longest(null, PULSES))), auto: after(Math.max(settle, longest(null, PULSES))) }
    const fastest  = Math.min(...timing.sources.map(item => item.period), ...timing.resonances.map(item => 1 / item.frequency))
    const stop     = options[preset] > 0 ? nice(Math.min(LIMITS[1], Math.max(LIMITS[0], options[preset]))) : 0

    if (!stop)
        return null

    return { stop, points: Math.min(MAX_POINTS, Math.max(points, Number.isFinite(fastest) ? Math.ceil(stop / fastest * PER_CYCLE) : 0)) }
}
