// CM_RECORD=<arquivo>: ANOTA CADA ARQUIVO DO ACERVO QUE OS TESTES LEEM, PARA O tools/Data/fixtures.ts COPIAR O SUBCONJUNTO PARA tests/fixtures
import fs from 'node:fs'
import path from 'node:path'
import { DATA } from '../../tools/Fritzing'

const RECORD = process.env.CM_RECORD

export const recording = { paused: false }    // O ÍNDICE DE moduleId LÊ O COMEÇO DE TODAS AS PEÇAS: NÃO CONTA

if (RECORD) {
    const root = path.resolve(DATA) + path.sep

    const note = (file: unknown) => {
        const full = typeof file === 'string' ? path.resolve(file) : ''

        if (!recording.paused && full.startsWith(root) && fs.statSync(full, { throwIfNoEntry: false })?.isFile())
            fs.appendFileSync(RECORD, full.slice(root.length) + '\n')
    }

    const { readFileSync, existsSync } = fs
    fs.readFileSync = ((file: fs.PathOrFileDescriptor, ...rest: unknown[]) => (note(file), (readFileSync as (...args: unknown[]) => unknown)(file, ...rest))) as typeof fs.readFileSync
    fs.existsSync = (file => (note(file), existsSync(file))) as typeof fs.existsSync
}
