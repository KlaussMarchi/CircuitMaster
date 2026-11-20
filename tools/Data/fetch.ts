// BAIXA O ACERVO DO RELEASE FIXADO EM tools/Data/release.json, CONFERE O SHA-256 E EXTRAI EM data/ (NO LUGAR DO npm run data, QUE PRECISA DOS
// REPOSITÓRIOS DO FRITZING E DO KICAD). PULA SE data/ JÁ VEIO DESSE RELEASE; --force BAIXA DE NOVO. USO: npm run data:fetch
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const ROOT   = path.resolve(import.meta.dirname, '../..')
const DATA   = path.join(ROOT, 'data')
const TEMP   = `${DATA}.tmp`
const MARK   = path.join(DATA, 'RELEASE')    // TAG DE ONDE O data/ VEIO
const { tag, url, sha256 } = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'release.json'), 'utf8')) as { tag: string, url: string, sha256: string }

if (!process.argv.includes('--force') && fs.existsSync(MARK) && fs.readFileSync(MARK, 'utf8').trim() === tag) {
    console.log(`data/ já está no ${tag}`)
    process.exit(0)
}

const response = await fetch(url)

if (!response.ok)
    throw new Error(`download falhou: HTTP ${response.status} em ${url}`)

const bytes  = Buffer.from(await response.arrayBuffer())
const digest = crypto.createHash('sha256').update(bytes).digest('hex')

if (digest !== sha256)
    throw new Error(`SHA-256 diferente do release.json: ${digest}`)

fs.rmSync(TEMP, { recursive: true, force: true })
fs.mkdirSync(TEMP)
const tar = spawn('tar', ['-x', '-C', TEMP], { stdio: ['pipe', 'inherit', 'inherit'] })
const done = new Promise((resolve, reject) => tar.on('close', code => code === 0 ? resolve(null) : reject(new Error(`tar saiu com ${code}`))))
await pipeline(Readable.from([bytes]), zlib.createZstdDecompress(), tar.stdin)
await done

fs.writeFileSync(path.join(TEMP, 'RELEASE'), tag + '\n')
fs.rmSync(DATA, { recursive: true, force: true })
fs.renameSync(TEMP, DATA)
console.log(`acervo ${tag} em ${DATA}`)
