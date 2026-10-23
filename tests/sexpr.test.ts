import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { childOf, flatSexpr, headOf, prettify, quote, readSexpr, unquote, writeSexpr, type Sexpr } from '../src/core/Sexpr'
import { ROOTS } from '../tools/KiCad'
import { writeReport } from './Fixtures'

const HAS_KICAD = fs.existsSync(ROOTS.symbols)
const CLI       = process.env.KICAD_CLI ?? 'kicad-cli'
const HAS_CLI   = spawnSync(CLI, ['version']).status === 0
const OUT       = path.resolve('build/kicad/sexpr')    // O kicad-cli DO FLATPAK SÓ ENXERGA A PASTA PESSOAL
const KICAD_10  = '(generator_version "10.0")'    // ARQUIVO GRAVADO PELO PRÓPRIO KICAD 10: TEM DE VOLTAR IGUAL BYTE A BYTE
const LIBRARIES = ['Connector_FFC-FPC', 'Resistor_SMD', 'Package_DIP']    // A PRIMEIRA TEM FOOTPRINTS COM A FORMATAÇÃO ANTIGA

const walk = (dir: string, extension: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name), extension) : entry.name.endsWith(extension) ? [path.join(dir, entry.name)] : [])

const svgOf = (file: string) => fs.readFileSync(file, 'utf8').replace(/ date [\dT:-]+ /, ' ')    // O kicad-cli PÕE A HORA NO <title>

const cli = (...args: string[]) => execFileSync(CLI, args, { encoding: 'utf8', timeout: 300000 })

// IDA E VOLTA DE CADA ARQUIVO: A ÁRVORE RELIDA É A MESMA E O TEXTO DO KICAD 10 VOLTA IGUAL BYTE A BYTE; UMA ÁRVORE POR VEZ NA MEMÓRIA (A MAIOR PLACA DOS DEMOS TEM 85 MB)
const flatOf = (text: string) => {
    const tree = readSexpr(text)
    return tree ? flatSexpr(tree) : null
}

const roundTrip = (files: string[]) => files.map(file => {
    const text = fs.readFileSync(file, 'utf8')
    const flat = flatOf(text)
    const out  = flat === null ? '' : prettify(flat, 'normal')
    const back = flat === null ? null : flatOf(out)
    return { file, read: flat !== null, same: out === text, ours: text.includes(KICAD_10), tree: back === flat, stable: back !== null && prettify(back, 'normal') === out }
})

const report = (name: string, results: ReturnType<typeof roundTrip>) => `${name}: ${results.length} arquivos, ${results.filter(result => result.same).length} iguais byte a byte, ${results.filter(result => !result.same && result.tree).length} com a mesma árvore e outra formatação\n${results.filter(result => !result.same).slice(0, 50).map(result => `  ${path.relative(ROOTS.symbols + '/..', result.file)}`).join('\n')}\n`

describe('S-expression do KiCad: leitura e gravação (spec 07 §2)', () => {
    it('átomos ficam como estão; strings com escapes; listas aninhadas', () => {
        const [root] = readSexpr('(kicad_symbol_lib (version 20251024) (symbol "R \\"1\\"" (pin passive line (at 0 3.81 270))))') ?? []
        expect(headOf(root)).toBe('kicad_symbol_lib')
        expect(childOf(root, 'version')?.[1]).toBe('20251024')
        expect(unquote(childOf(root, 'symbol')?.[1])).toBe('R "1"')
        expect(quote('a "b"\nc\\')).toBe('"a \\"b\\"\\nc\\\\"')
        expect(unquote(quote('a "b"\nc\\'))).toBe('a "b"\nc\\')
    })

    it('texto mal formado volta nulo, sem exceção; aninhamento muito fundo não estoura a pilha', () => {
        for (const text of ['(a (b)', '(a))', '(a "sem fim)', ')'])
            expect(readSexpr(text)).toBeNull()

        const deep = `${'('.repeat(200000)}x${')'.repeat(200000)}`
        expect(flatSexpr(readSexpr(deep) as Sexpr[])).toBe(deep)
        expect(writeSexpr(readSexpr(`${'('.repeat(2000)}x${')'.repeat(2000)}`) as Sexpr[]).split('\n')).toHaveLength(4000)
    })

    it('formato do Prettify: tabulação, (xy) juntos até a coluna 99, quebra depois da coluna 72', () => {
        const text = writeSexpr(readSexpr('(a (pts (xy 1 2) (xy 3 4)) (b c))') ?? [])
        expect(text).toBe('(a\n\t(pts\n\t\t(xy 1 2) (xy 3 4)\n\t)\n\t(b c)\n)\n')
    })
})

describe.skipIf(!HAS_KICAD)('bibliotecas e demos do KiCad 10 lidos e regravados sem perda (spec 07 §2, fase 4)', () => {
    it.each([['símbolos', ROOTS.symbols, '.kicad_sym'], ['footprints', ROOTS.footprints, '.kicad_mod'], ['demos (placas)', ROOTS.demos, '.kicad_pcb'], ['demos (esquemáticos)', ROOTS.demos, '.kicad_sch'], ['demos (símbolos)', ROOTS.demos, '.kicad_sym'], ['folhas de desenho', ROOTS.demos, '.kicad_wks']])('%s', (name, root, extension) => {
        const results = roundTrip(walk(root, extension))
        writeReport(`sexpr-${extension.slice(1)}-${name.replace(/\W+/g, '-')}.txt`, report(name, results))

        expect(results.length).toBeGreaterThan(0)
        expect(results.filter(result => !result.read || !result.tree || !result.stable).map(result => result.file)).toEqual([])
        expect(results.filter(result => result.ours && !result.same).map(result => result.file)).toEqual([])
    })
})

describe.skipIf(!HAS_KICAD || !HAS_CLI)('oráculo kicad-cli: o regravado desenha e verifica igual ao original (fase 4)', () => {
    it('footprints: o SVG exportado do arquivo regravado é o mesmo do original', () => {
        LIBRARIES.forEach(library => {
            const source = path.join(ROOTS.footprints, `${library}.pretty`)
            const copy   = path.join(OUT, 'mod', `${library}.pretty`)
            fs.rmSync(copy, { recursive: true, force: true })
            fs.mkdirSync(copy, { recursive: true })
            walk(source, '.kicad_mod').forEach(file => fs.writeFileSync(path.join(copy, path.basename(file)), writeSexpr(readSexpr(fs.readFileSync(file, 'utf8')) ?? [])))
            ;[['orig', source], ['ours', copy]].forEach(([kind, input]) => {
                fs.mkdirSync(path.join(OUT, 'svg', library, kind), { recursive: true })
                cli('fp', 'export', 'svg', '-o', path.join(OUT, 'svg', library, kind), input)
            })

            const names = fs.readdirSync(path.join(OUT, 'svg', library, 'orig'))
            expect(names.length).toBeGreaterThan(0)
            names.forEach(name => expect(svgOf(path.join(OUT, 'svg', library, 'ours', name)), name).toBe(svgOf(path.join(OUT, 'svg', library, 'orig', name))))
        })
    })

    it('símbolo: o SVG do símbolo regravado é o mesmo do original', () => {
        const source = path.join(ROOTS.symbols, 'Device.kicad_symdir', 'R.kicad_sym')
        const copy   = path.join(OUT, 'sym', 'R.kicad_sym')
        fs.mkdirSync(path.dirname(copy), { recursive: true })
        fs.writeFileSync(copy, writeSexpr(readSexpr(fs.readFileSync(source, 'utf8')) ?? []))
        ;[['orig', source], ['ours', copy]].forEach(([kind, input]) => {
            fs.mkdirSync(path.join(OUT, 'sym', kind), { recursive: true })
            cli('sym', 'export', 'svg', '-o', path.join(OUT, 'sym', kind), input)
        })
        expect(svgOf(path.join(OUT, 'sym', 'ours', 'R_unit1.svg'))).toBe(svgOf(path.join(OUT, 'sym', 'orig', 'R_unit1.svg')))
    })

    it('demo: o DRC da placa e o ERC do esquemático regravados acham as mesmas violações dos originais', () => {
        const source = path.join(ROOTS.demos, 'royalblue54L_feather')
        const copy   = path.join(OUT, 'demo')
        fs.rmSync(copy, { recursive: true, force: true })
        fs.cpSync(source, copy, { recursive: true })
        ;[...walk(copy, '.kicad_pcb'), ...walk(copy, '.kicad_sch')].forEach(file => fs.writeFileSync(file, writeSexpr(readSexpr(fs.readFileSync(file, 'utf8')) ?? [])))

        const drc = (board: string, name: string) => {
            const output = path.join(OUT, `${name}.json`)
            cli('pcb', 'drc', '--format', 'json', '-o', output, board)
            const result = JSON.parse(fs.readFileSync(output, 'utf8')) as { violations: { type: string }[], unconnected_items: unknown[] }
            return [result.violations.map(violation => violation.type).sort(), result.unconnected_items.length]
        }

        expect(drc(walk(copy, '.kicad_pcb')[0], 'drc-ours')).toEqual(drc(walk(source, '.kicad_pcb')[0], 'drc-orig'))

        const erc = (sheet: string, name: string) => {
            const output = path.join(OUT, `${name}.json`)
            cli('sch', 'erc', '--format', 'json', '-o', output, sheet)
            const result = JSON.parse(fs.readFileSync(output, 'utf8')) as { sheets: { violations: { type: string }[] }[] }
            return result.sheets.flatMap(sheet => sheet.violations.map(violation => violation.type)).sort()
        }

        expect(erc(path.join(copy, 'RoyalBlue54L-Feather.kicad_sch'), 'erc-ours')).toEqual(erc(path.join(source, 'RoyalBlue54L-Feather.kicad_sch'), 'erc-orig'))
    })
})
