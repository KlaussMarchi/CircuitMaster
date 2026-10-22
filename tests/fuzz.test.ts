import fs from 'node:fs'
import path from 'node:path'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { exportSketch, readFile, readSketch, type Sketch } from '../src/core/Sketch'
import { emptyDoc, fromSketch, keyOf, type Doc } from '../src/core/Document'
import { readPart } from '../src/core/Part'
import { VIEWS } from '../src/core/Layer'
import { apply, invert, multiply, parseTransform, type Matrix, type Point } from '../src/core/Geometry'
import { createInstance, createWire, deleteItems, flipInstances, moveInstances, rotateInstances, setProperty } from '../src/engine/Edit'
import { ROOTS } from '../tools/Fritzing'
import { HAS_FRITZING, makeLibrary } from './Fixtures'

const RUNS   = 200
const SAMPLE = 'core/Button.fzz'
const PARTS  = ['ResistorModuleID', '100milCeramicCapacitorModuleID', 'LED-genedb611bf8177f41ac9c325217070f0c62ColorLEDModuleID']
const NUMBER = /-?\d+(\.\d+)?/g
const WEIRD  = ['NaN', '1e308', '-1e308', 'Infinity', '', 'abc', '0x10', '-0']

// MUTAÇÕES DE UM ARQUIVO DE TEXTO VÁLIDO: TRUNCAR, NÚMEROS ESTRANHOS, BLOCO DUPLICADO (ids REPETIDOS), ANINHAMENTO PROFUNDO E LIXO NO MEIO
const mutated = (text: string, block: RegExp) => fc.oneof(
    fc.nat({ max: text.length }).map(cut => text.slice(0, cut)),
    fc.array(fc.tuple(fc.nat(), fc.constantFrom(...WEIRD)), { minLength: 1, maxLength: 20 }).map(changes => {
        const spots = [...text.matchAll(NUMBER)]
        const picks = new Map(changes.map(([spot, value]) => [spot % Math.max(1, spots.length), value]))
        return spots.reduceRight((current, match, i) => picks.has(i) ? current.slice(0, match.index) + picks.get(i) + current.slice((match.index ?? 0) + match[0].length) : current, text)
    }),
    fc.nat().map(i => {
        const blocks = [...text.matchAll(block)]
        const chosen = blocks[i % Math.max(1, blocks.length)]
        return chosen ? text.slice(0, (chosen.index ?? 0) + chosen[0].length) + chosen[0] + text.slice((chosen.index ?? 0) + chosen[0].length) : text
    }),
    fc.integer({ min: 1, max: 20000 }).map(depth => text.replace('<instances>', `<instances>${'<x>'.repeat(depth)}${'</x>'.repeat(depth)}`)),
    fc.tuple(fc.nat({ max: text.length }), fc.string({ maxLength: 40 })).map(([at, junk]) => text.slice(0, at) + junk + text.slice(at))
)

// O ARQUIVO VIRA DOCUMENTO, CAUSA OU NULO, E O DOCUMENTO LIDO É GRAVÁVEL: NENHUMA EXCEÇÃO ESCAPA ATÉ O DOCUMENTO SUBSTITUIR O ABERTO
const opens = (name: string, bytes: Uint8Array) => {
    const bundle = readFile(name, bytes)

    if (bundle && typeof bundle !== 'string' && bundle.sketch)
        exportSketch(fromSketch(bundle.sketch))

    return true
}

const sampleBytes = () => new Uint8Array(fs.readFileSync(path.join(ROOTS.sketches, SAMPLE)))

const sampleSketch = () => {
    const files = unzipSync(sampleBytes())
    return strFromU8(files[Object.keys(files).find(name => name.endsWith('.fz')) ?? ''])
}

describe.skipIf(!HAS_FRITZING)('fuzzing dos leitores (fase 1, seção 6)', () => {
    it('bytes aleatórios e pacotes truncados com qualquer nome nunca deixam escapar exceção', () => {
        const bytes = sampleBytes()
        fc.assert(fc.property(fc.uint8Array({ maxLength: 4096 }), fc.constantFrom('a.fzz', 'a.fz', 'a.fzb', 'a.fzpz', 'a.fzbz', 'sem nome'), (noise, name) => opens(name, noise)), { numRuns: RUNS })
        fc.assert(fc.property(fc.nat({ max: bytes.length }), cut => opens('a.fzz', bytes.slice(0, cut))), { numRuns: RUNS })
    })

    it('.fz mutado (truncado, NaN, 1e308, ids duplicados, 20.000 níveis, lixo) abre ou é recusado sem exceção, também dentro do .fzz', () => {
        const text = sampleSketch()
        fc.assert(fc.property(mutated(text, /<instance [\s\S]*?<\/instance>/g), changed => opens('a.fz', strToU8(changed)) && opens('a.fzz', zipSync({ 'a.fz': strToU8(changed) }))), { numRuns: RUNS })
    })

    it('.fzp mutado vira peça ou nulo, sem exceção', () => {
        const text = fs.readFileSync(path.join(ROOTS.parts, 'core/resistor.fzp'), 'utf8')
        fc.assert(fc.property(mutated(text, /<connector [\s\S]*?<\/connector>/g), changed => {
            readPart(changed, false)
            return true
        }), { numRuns: RUNS })
    })
})

const matrix = fc.tuple(...Array.from({ length: 6 }, () => fc.double({ min: -1e3, max: 1e3, noNaN: true }))).filter(([a, b, c, d]) => Math.abs(a * d - b * c) > 1e-3) as fc.Arbitrary<Matrix>
const point  = fc.tuple(fc.double({ min: -1e4, max: 1e4, noNaN: true }), fc.double({ min: -1e4, max: 1e4, noNaN: true })) as fc.Arbitrary<Point>
const close  = (a: number[], b: number[], scale: number) => a.every((value, i) => Math.abs(value - b[i]) <= 1e-6 * scale)

describe('fuzzing da geometria (fase 1, seção 6)', () => {
    it('inverter e aplicar devolve o ponto; a matriz vezes a inversa é a identidade', () => {
        fc.assert(fc.property(matrix, point, (m, p) => {
            const scale = 1 + Math.max(...m.map(Math.abs)) * (1 + Math.hypot(...p))
            return close(apply(invert(m), ...apply(m, ...p)), p, scale * 1e3) && close(multiply(m, invert(m)), [1, 0, 0, 1, 0, 0], scale * 1e3)
        }), { numRuns: 1000 })
    })

    it('transformação de texto qualquer vira matriz finita ou nulo, sem exceção', () => {
        fc.assert(fc.property(fc.oneof(fc.string(), fc.constantFrom('matrix(1,0,0,1,NaN,0)', 'rotate(1e308)', 'translate(', 'scale(-1) skewX(90)')), text => {
            const parsed = parseTransform(text)
            return parsed === null || parsed.every(Number.isFinite)
        }), { numRuns: 1000 })
    })
})

type Op = { kind: 'add' | 'move' | 'rotate' | 'flip' | 'delete' | 'wire' | 'value', a: number, b: number, x: number, y: number }

const op = fc.record({ kind: fc.constantFrom('add', 'move', 'rotate', 'flip', 'delete', 'wire', 'value'), a: fc.nat(), b: fc.nat(), x: fc.integer({ min: -2000, max: 2000 }), y: fc.integer({ min: -2000, max: 2000 }) }) as fc.Arbitrary<Op>

const finite = (doc: Doc) => Object.values(doc.instances).every(instance => Object.values(instance.views).every(state => [state.geometry.x, state.geometry.y, ...(state.geometry.transform ?? [])].every(Number.isFinite)))

describe.skipIf(!HAS_FRITZING)('fuzzing das edições (fase 1, seção 6)', () => {
    it('qualquer sequência de edições não altera o documento de entrada (desfazer devolve o idêntico), mantém a geometria finita e grava e relê o mesmo', async () => {
        const library = makeLibrary()
        await library.load(['WireModuleID', ...PARTS])
        const views   = Object.fromEntries(VIEWS.map(view => [view, [0, 0]])) as Record<typeof VIEWS[number], Point>

        const step = (doc: Doc, { kind, a, b, x, y }: Op) => {
            const ids   = Object.keys(doc.instances).filter(id => doc.instances[id].moduleIdRef !== 'WireModuleID')
            const one   = ids[a % Math.max(1, ids.length)]
            const other = ids[b % Math.max(1, ids.length)]
            const part  = library.getPart(doc.instances[one ?? '']?.moduleIdRef ?? '')
            const pin   = (id: string, n: number) => keyOf(id, library.getPart(doc.instances[id].moduleIdRef)?.connectors[n % 2]?.id ?? 'connector0')

            if (kind === 'add' || !one)
                return createInstance(doc, library, PARTS[a % PARTS.length], { ...views, breadboardView: [x, y], schematicView: [y, x], pcbView: [x / 2, y / 2] })

            if (kind === 'move')
                return moveInstances(doc, library, VIEWS[a % 3], [one], x, y)

            if (kind === 'rotate')
                return rotateInstances(doc, library, VIEWS[b % 3], [one], [45, 90, -90, 180][b % 4])

            if (kind === 'flip')
                return flipInstances(doc, library, 'schematicView', [one], b % 2 === 0)

            if (kind === 'delete')
                return deleteItems(doc, library, VIEWS[b % 3], [one], b % 2 === 0)

            if (kind === 'wire' && one !== other && part)
                return createWire(doc, library, VIEWS[x & 1 ? 0 : 1], pin(one, a), pin(other, b))

            return setProperty(doc, one, 'resistance', `${Math.abs(x)}Ω`)
        }

        fc.assert(fc.property(fc.array(op, { minLength: 1, maxLength: 25 }), ops => {
            ops.reduce((doc, item) => {
                const before = JSON.stringify(doc)
                const next   = step(doc, item)
                const read   = readSketch(exportSketch(next))
                expect(read).not.toBeNull()
                const back   = fromSketch(read as Sketch)
                expect(JSON.stringify(doc)).toBe(before)
                expect(finite(next)).toBe(true)
                expect(Object.keys(back.instances).sort()).toEqual(Object.keys(next.instances).sort())
                expect(back.edges.map(edge => [...edge].sort().join('|')).sort()).toEqual(next.edges.map(edge => [...edge].sort().join('|')).sort())
                return next
            }, emptyDoc())
        }), { numRuns: 60 })
    })
})
