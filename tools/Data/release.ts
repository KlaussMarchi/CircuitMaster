// EMPACOTA data/ EM build/circuitmaster-data.tar.zst E GRAVA EM tools/Data/release.json A TAG, A URL E O SHA-256 QUE O npm run data:fetch
// BAIXA. DEPOIS: CRIAR NO GITHUB O RELEASE COM ESSA TAG, ANEXAR O ARQUIVO E FAZER COMMIT DO release.json. USO: npm run data:release
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { pipeline } from 'node:stream/promises'

const ROOT  = path.resolve(import.meta.dirname, '../..')
const DATA  = path.join(ROOT, 'data')
const ASSET = 'circuitmaster-data.tar.zst'
const OUT   = path.join(ROOT, 'build', ASSET)

const version = JSON.parse(fs.readFileSync(path.join(DATA, 'VERSION.json'), 'utf8')) as { packed: string }
const tag     = `data-${version.packed.slice(0, 10).replaceAll('-', '.')}`
const repo    = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8' }).trim().replace(/^https:\/\/[^@/]+@/, 'https://').replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '')

fs.mkdirSync(path.dirname(OUT), { recursive: true })
const tar = spawn('tar', ['-c', '-C', DATA, '.'], { stdio: ['ignore', 'pipe', 'inherit'] })
await pipeline(tar.stdout, zlib.createZstdCompress({ params: { [zlib.constants.ZSTD_c_compressionLevel]: 19 } }), fs.createWriteStream(OUT))

const sha256  = crypto.createHash('sha256').update(fs.readFileSync(OUT)).digest('hex')
const release = { tag, url: `${repo}/releases/download/${tag}/${ASSET}`, sha256 }
fs.writeFileSync(path.join(import.meta.dirname, 'release.json'), JSON.stringify(release, null, 4) + '\n')

console.log(`${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)\ncrie o release ${tag} em ${repo}/releases/new, anexe o arquivo e faça commit de tools/Data/release.json`)
