/// <reference types="vitest/config" />
import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import * as Fritzing from './tools/Fritzing/index.ts'
import * as KiCad from './tools/KiCad/index.ts'

const TYPES: Record<string, string> = { '.sp': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.fzp': 'application/xml', '.fzb': 'application/xml', '.fzz': 'application/zip', '.png': 'image/png', '.ttf': 'font/ttf', '.kicad_pro': 'application/json', '.step': 'model/step' }
const KICAD_TEXT = /\.(kicad_(sch|pcb|sym|mod|wks)|.*-lib-table)$/    // S-EXPRESSION DO KICAD: TEXTO UTF-8

// SERVE UM ACERVO COMO DADOS EM /<nome> (LISTAGENS JSON E ARQUIVOS), SEM SAIR DAS RAÍZES, NO dev E NO preview
const dataServer = (mount: string, roots: Record<string, string>, getListings: () => Record<string, unknown>): Plugin => {
    let listings: Record<string, unknown> | null = null

    const handle: Connect.NextHandleFunction = (request, response, next) => {
        const url = decodeURIComponent((request.url ?? '').split('?')[0]).replace(/^\/+/, '')

        if (url.endsWith('.json') && !url.includes('/')) {
            listings = listings ?? getListings()

            if (!(url in listings))
                return next()

            response.setHeader('Content-Type', TYPES['.json'])
            return response.end(JSON.stringify(listings[url]))
        }

        const slash = url.indexOf('/')
        const root  = roots[url.slice(0, slash)]
        const file  = root ? path.resolve(root, url.slice(slash + 1)) : ''

        if (!root || !file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
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


// BIBLIOTECAS EM CHUNKS PRÓPRIOS: O CÓDIGO DO APP MUDA MAIS QUE ELAS E O CACHE DO NAVEGADOR AS REAPROVEITA
const CHUNKS = [{ name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ }, { name: 'vendor', test: /node_modules[\\/]/ }]


export default defineConfig({
    plugins: [react(), tailwindcss(), dataServer('fritzing', Fritzing.ROOTS, Fritzing.getListings), dataServer('kicad', KiCad.ROOTS, KiCad.getListings)],
    worker: { format: 'es' },
    build: { rolldownOptions: { output: { codeSplitting: { groups: CHUNKS } } } },
    test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 600000 }
})
