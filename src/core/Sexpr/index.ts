// PORTADO DE kicad/common/io/kicad/kicad_io_utils.cpp (KICAD_FORMAT::Prettify) (GPL-3.0-or-later; Copyright The KiCad Developers)

// ÁTOMO GUARDADO COMO ESTÁ NO TEXTO (NÚMERO, SÍMBOLO OU STRING COM AS ASPAS E OS ESCAPES), PARA A IDA E VOLTA SER EXATA
export type Sexpr = string | Sexpr[]
export type Mode  = 'normal' | 'compact' | 'library'

const XY_COLUMN   = 99    // LISTAS (xy ...) SEGUIDAS FICAM NA MESMA LINHA ATÉ ESTA COLUNA
const WRAP_COLUMN = 72    // DEPOIS DESTA COLUNA, ESPAÇO ENTRE ÁTOMOS VIRA QUEBRA DE LINHA
const SHORT_FORMS = ['font', 'stroke', 'fill', 'teardrop', 'offset', 'rotate', 'scale']

const isSpace = (char: string) => char === ' ' || char === '\t' || char === '\n' || char === '\r'

// TEXTO DE ARQUIVO KICAD EM ÁRVORE, SEM RECURSÃO (ANINHAMENTO FUNDO NÃO ESTOURA A PILHA); TEXTO MAL FORMADO VOLTA NULO
export const readSexpr = (text: string): Sexpr[] | null => {
    const root: Sexpr[] = []
    const stack         = [root]
    let i = 0

    while (i < text.length) {
        const char = text[i]

        if (isSpace(char)) {
            i++
            continue
        }

        if (char === '(') {
            const list: Sexpr[] = []
            stack[stack.length - 1].push(list)
            stack.push(list)
            i++
            continue
        }

        if (char === ')') {
            if (stack.length === 1)
                return null

            stack.pop()
            i++
            continue
        }

        const start = i

        if (char === '"') {
            i++

            while (i < text.length && text[i] !== '"')
                i += text[i] === '\\' ? 2 : 1

            if (i >= text.length)
                return null

            i++
        } else {
            while (i < text.length && !isSpace(text[i]) && text[i] !== '(' && text[i] !== ')')
                i++
        }

        stack[stack.length - 1].push(text.slice(start, i))
    }

    return stack.length === 1 ? root : null
}

export const isList = (node: Sexpr | undefined): node is Sexpr[] => Array.isArray(node)

export const headOf = (node: Sexpr | undefined) => isList(node) && typeof node[0] === 'string' ? node[0] : ''

export const childrenOf = (node: Sexpr | undefined, head: string) => isList(node) ? node.filter((child): child is Sexpr[] => headOf(child) === head) : []

export const childOf = (node: Sexpr | undefined, head: string) => childrenOf(node, head)[0]

// TEXTO DE UM ÁTOMO: TIRA AS ASPAS E DESFAZ OS ESCAPES \" \\ \n
export const unquote = (atom: Sexpr | undefined) => typeof atom !== 'string' ? '' : atom.startsWith('"') ? atom.slice(1, -1).replace(/\\(.)/g, (_, char: string) => char === 'n' ? '\n' : char) : atom

export const quote = (text: string) => `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')}"`

// A ÁRVORE NUMA LINHA, SEM RECURSÃO; DUAS ÁRVORES SÃO IGUAIS QUANDO AS LINHAS SÃO IGUAIS
export const flatSexpr = (nodes: Sexpr[]) => {
    const out: string[]              = []
    const stack: [Sexpr[], number][] = [[nodes, 0]]

    while (stack.length) {
        const top          = stack[stack.length - 1]
        const [list, next] = top

        if (next === list.length) {
            stack.pop()

            if (stack.length)
                out.push(')')

            continue
        }

        if (next > 0)
            out.push(' ')

        top[1]++
        const node = list[next]

        if (isList(node)) {
            out.push('(')
            stack.push([node, 0])
        } else {
            out.push(node)
        }
    }

    return out.join('')
}

// TEXTO NO FORMATO DO KICAD: O Prettify SOBRE A ÁRVORE EM UMA LINHA (TABULAÇÃO, LISTAS (xy) JUNTAS, QUEBRA DEPOIS DA COLUNA 72)
export const writeSexpr = (nodes: Sexpr[], mode: Mode = 'normal') => prettify(flatSexpr(nodes), mode)

export const prettify = (source: string, mode: Mode) => {
    const out: string[] = []    // PARTES DO TEXTO FORMATADO, JUNTADAS NO FIM (CONCATENAR CARACTERE A CARACTERE ESGOTA A MEMÓRIA NUM .kicad_pcb GRANDE)
    let depth         = 0
    let libDepth      = 0
    let last          = ''
    let inQuote       = false
    let spaced        = false
    let multiLine     = false
    let inXY          = false
    let inShort       = false
    let inLib         = false
    let shortDepth    = 0
    let column        = 0
    let backslashes   = 0

    const nextSolid = (at: number) => {
        let seek = at

        while (seek < source.length && isSpace(source[seek]))
            seek++

        return source[seek] ?? ''
    }
    const tokenAt   = (at: number) => source.slice(at + 1).match(/^[a-zA-Z]*/)?.[0] ?? ''
    const indent    = () => '\t'.repeat(depth)

    for (let at = 0; at < source.length; at++) {
        const char = source[at]
        const next = nextSolid(at)

        if (isSpace(char) && !inQuote) {
            if (!spaced && depth > 0 && last !== '(' && next !== ')' && next !== '(') {
                if (inXY || column < WRAP_COLUMN) {
                    out.push(' ')
                    column++
                } else if (inShort || inLib) {
                    out.push(' ')
                } else {
                    out.push(`\n${indent()}`)
                    column    = depth
                    multiLine = true
                }

                spaced = true
            }

            continue
        }

        spaced = false

        if (char === '(' && !inQuote) {
            const xy    = source.startsWith('xy ', at + 1)
            const short = mode === 'compact' && SHORT_FORMS.includes(tokenAt(at))
            const lib   = mode === 'library' && tokenAt(at) === 'lib'

            if (!out.length) {
                out.push('(')
                column++
            } else if ((inXY && xy && column < XY_COLUMN) || inShort || inLib) {
                out.push(' (')
                column += 2
            } else {
                out.push(`\n${indent()}(`)
                column = depth + 1
            }

            inXY = xy

            if (short) {
                inShort    = true
                shortDepth = depth
            } else if (lib) {
                inLib    = true
                libDepth = depth
            }

            depth++
        } else if (char === ')' && !inQuote) {
            depth = Math.max(0, depth - 1)

            if (inShort) {
                out.push(')')
                column++
            } else if (inLib && depth === libDepth) {
                out.push(')')
                inLib = false
            } else if (last === ')' || multiLine) {
                out.push(`\n${indent()})`)
                column    = depth + 1
                multiLine = false
            } else {
                out.push(')')
                column++
            }

            if (shortDepth === depth) {
                inShort    = false
                shortDepth = 0
            }
        } else {
            const start = at

            // O ÁTOMO INTEIRO DE UMA VEZ: DENTRO DE ASPAS VAI ATÉ A ASPA SEM ESCAPE, FORA ATÉ O ESPAÇO OU O PARÊNTESE
            for (; at < source.length && (inQuote || !(isSpace(source[at]) || source[at] === '(' || source[at] === ')')); at++) {
                if (source[at] === '\\')
                    backslashes++
                else if (source[at] === '"' && backslashes % 2 === 0)
                    inQuote = !inQuote

                if (source[at] !== '\\')
                    backslashes = 0
            }

            out.push(source.slice(start, at))
            column += at - start
            last = source[at - 1]
            at--
            continue
        }

        last = char
    }

    return `${out.join('')}\n`
}
