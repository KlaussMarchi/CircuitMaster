/// <reference types="vitest/config" />
import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { ROOTS, getListings } from './tools/Fritzing/index.ts'

const TYPES: Record<string, string> = { '.svg': 'image/svg+xml', '.json': 'application/json', '.fzp': 'application/xml', '.fzb': 'application/xml', '.fzz': 'application/zip', '.png': 'image/png', '.ttf': 'font/ttf' }

// SERVE O ACERVO DO FRITZING COMO DADOS EM /fritzing (LISTAGENS JSON E ARQUIVOS), SEM SAIR DAS RAÍZES
const fritzingParts = (): Plugin => {
    let listings: ReturnType<typeof getListings> | null = null

    const handle: Connect.NextHandleFunction = (request, response, next) => {
        const url  = decodeURIComponent((request.url ?? '').split('?')[0]).replace(/^\/+/, '')
        const name = url as keyof ReturnType<typeof getListings>

        if (name === 'fzp.json' || name === 'svg.json' || name === 'sketches.json') {
            listings = listings ?? getListings()
            response.setHeader('Content-Type', TYPES['.json'])
            return response.end(JSON.stringify(listings[name]))
        }

        const slash = url.indexOf('/')
        const root  = ROOTS[url.slice(0, slash)]
        const file  = root ? path.resolve(root, url.slice(slash + 1)) : ''

        if (!root || !file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
            return next()

        response.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
        fs.createReadStream(file).pipe(response)
    }

    return {
        name: 'fritzing-parts',
        configureServer: server => void server.middlewares.use('/fritzing', handle),
        configurePreviewServer: server => void server.middlewares.use('/fritzing', handle)
    }
}


// BIBLIOTECAS EM CHUNKS PRÓPRIOS: O CÓDIGO DO APP MUDA MAIS QUE ELAS E O CACHE DO NAVEGADOR AS REAPROVEITA
const CHUNKS = [{ name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ }, { name: 'vendor', test: /node_modules[\\/]/ }]


export default defineConfig({
    plugins: [react(), tailwindcss(), fritzingParts()],
    worker: { format: 'es' },
    build: { rolldownOptions: { output: { codeSplitting: { groups: CHUNKS } } } },
    test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 600000 }
})
