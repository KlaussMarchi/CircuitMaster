import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EN } from '../src/core/Text/en'
import { getTag, setWords, t } from '../src/core/Text'

const SRC    = path.resolve(import.meta.dirname, '../src')
const QUOTED = /'((?:[^'\\\n]|\\.)*)'|"([^"\n]*)"/g
const KEYED  = /\bt\(\s*'((?:[^'\\\n]|\\.)*)'/g
const SLOTS  = /\{\d\}/g

const listSources = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? listSources(path.join(dir, entry.name)) : /\.tsx?$/.test(entry.name) && entry.name !== 'en.ts' ? [path.join(dir, entry.name)] : [])

const decode = (body: string) => body.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))).replace(/\\(.)/g, '$1')

const sources = listSources(SRC).map(file => fs.readFileSync(file, 'utf8').replace(/\/\/[^\n]*/g, ''))
const quoted  = new Set(sources.flatMap(text => [...text.matchAll(QUOTED)].map(match => match[1] === undefined ? match[2] : decode(match[1]))))
const keyed   = [...new Set(sources.flatMap(text => [...text.matchAll(KEYED)].map(match => decode(match[1]))))]

describe('textos da interface em inglês (fase 2)', () => {
    afterEach(() => setWords('pt', {}))

    it('toda chave escrita em t(…) tem tradução, com os mesmos {0}, {1}…', () => {
        expect(keyed.filter(key => !(key in EN))).toEqual([])
        expect(Object.entries(EN).filter(([key, text]) => !text.trim() || (key.match(SLOTS) ?? []).sort().join() !== (text.match(SLOTS) ?? []).sort().join()).map(([key]) => key)).toEqual([])
    })

    it('nenhuma tradução sobra: cada chave aparece como texto no código (em t(…) ou numa tabela mostrada por t)', () => {
        expect(Object.keys(EN).filter(key => !quoted.has(key))).toEqual([])
    })

    it('t troca a língua, preenche os valores e cai no português sem tradução', () => {
        expect(t('{0} peças', 3)).toBe('3 peças')
        setWords('en', EN)
        expect(t('{0} peças', 3)).toBe('3 parts')
        expect(t('Fechar {0}', 'R1')).toBe('Close R1')
        expect(t('texto sem tradução')).toBe('texto sem tradução')
        expect(getTag()).toBe('en')
    })
})
