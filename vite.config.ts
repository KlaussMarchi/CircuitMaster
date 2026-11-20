/// <reference types="vitest/config" />
import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { DATA } from './tools/Fritzing/index.ts'

const TYPES: Record<string, string> = { '.sp': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.fzp': 'application/xml', '.fzb': 'application/xml', '.fzz': 'application/zip', '.png': 'image/png', '.ttf': 'font/ttf' }
const KICAD_TEXT = /\.(kicad_(sch|pcb|sym|mod|wks)|.*-lib-table)$/    // S-EXPRESSION DO KICAD: TEXTO UTF-8

// SERVE O ACERVO EMPACOTADO (data/<nome>, LISTAGENS JÁ GRAVADAS) EM /<nome>, SEM SAIR DA RAIZ, NO dev E NO preview; NUM SERVIDOR
// ESTÁTICO BASTA PUBLICAR data/fritzing E data/kicad EM /fritzing E /kicad
const dataServer = (mount: string): Plugin => {
    const root = path.resolve(DATA, mount)    // NORMALIZADA: NO WINDOWS A RAIZ VEM COM / E O resolve DEVOLVE \

    const handle: Connect.NextHandleFunction = (request, response, next) => {
        const file = path.resolve(root, decodeURIComponent((request.url ?? '').split('?')[0]).replace(/^\/+/, ''))

        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
            return next()

        response.setHeader('Content-Type', KICAD_TEXT.test(file) ? 'text/plain; charset=utf-8' : TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
        fs.createReadStream(file).pipe(response)
    }

    return {
        name: `data-${mount}`,
        configureServer: server => void server.middlewares.use(`/${mount}`, handle),
        configurePreviewServer: server => void server.middlewares.use(`/${mount}`, handle)
    }
}


// BIBLIOTECAS EM CHUNKS PRÓPRIOS: O CÓDIGO DO APP MUDA MAIS QUE ELAS E O CACHE DO NAVEGADOR AS REAPROVEITA; O XMLDOM FORA DO vendor,
// QUE É INICIAL: ELE CARREGA NO setup DO STORE (core/Xml)
const CHUNKS = [{ name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ }, { name: 'xmldom', test: /node_modules[\\/]@xmldom[\\/]/ }, { name: 'vendor', test: /node_modules[\\/]/ }]


export default defineConfig({
    plugins: [react(), tailwindcss(), dataServer('fritzing'), dataServer('kicad')],
    server: { watch: { ignored: ['**/data/**', '**/data.tmp/**'] } },    // O ACERVO TEM ~110 MIL ARQUIVOS: VIGIÁ-LO ESTOURA O LIMITE DO inotify (E ELE SÓ MUDA PELO npm run data)
    worker: { format: 'es' },
    build: { rolldownOptions: { output: { codeSplitting: { groups: CHUNKS } } } },
    test: { environment: 'node', include: ['tests/**/*.test.ts'], setupFiles: ['src/core/Xml/xmldom.ts', 'tests/Fixtures/record.ts'], testTimeout: 600000 }
})
