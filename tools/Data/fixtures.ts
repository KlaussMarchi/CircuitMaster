// MONTA tests/fixtures: OS ARQUIVOS DO PACOTE (data/) QUE OS TESTES LERAM NUMA RODADA GRAVADA, COM AS LICENÇAS E AS LISTAGENS (O APP TAMBÉM SOBE
// COM ELE). SEM VERSION.json: O SUBCONJUNTO NÃO É O PACOTE COMPLETO. USO: npm run data:fixtures (PRECISA DO data/)
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import * as Fritzing from '../Fritzing/index.ts'
import * as KiCad from '../KiCad/index.ts'

const ROOT     = path.resolve(import.meta.dirname, '../..')
const PACK     = path.join(ROOT, 'data')
const OUT      = path.join(ROOT, 'tests/fixtures')
const RECORD   = path.join(ROOT, 'build/fixture-reads.txt')
const LICENSES = ['fritzing/LICENSE.CC-BY-SA', 'fritzing/LICENSE.GPL3', 'fritzing/parts/LICENSE.txt', 'kicad/symbols/LICENSE.md', 'kicad/footprints/LICENSE.md', 'fritzing/fonts/DroidSans/NOTICE', 'fritzing/fonts/NotoSans/OFL.txt', 'fritzing/fonts/Segment16/Segment16.txt']

if (!fs.existsSync(path.join(PACK, 'VERSION.json')))
    throw new Error('sem o pacote completo em data/: rode npm run data antes')

fs.rmSync(RECORD, { force: true })
execFileSync('npx', ['vitest', 'run'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, CM_DATA: PACK, CM_RECORD: RECORD } })

const files = [...new Set([...fs.readFileSync(RECORD, 'utf8').split('\n').filter(Boolean), ...LICENSES])].sort()
fs.rmSync(OUT, { recursive: true, force: true })
files.forEach(file => fs.cpSync(path.join(PACK, file), path.join(OUT, file), { preserveTimestamps: true }))

const roots = (mount: string, names: string[]) => Object.fromEntries(names.map(root => [root, path.join(OUT, mount, root)]))

for (const [name, data] of Object.entries(Fritzing.getListings(roots('fritzing', Object.keys(Fritzing.UPSTREAM)))))
    fs.writeFileSync(path.join(OUT, 'fritzing', name), JSON.stringify(data))

for (const [name, data] of Object.entries(KiCad.getListings(roots('kicad', Object.keys(KiCad.UPSTREAM)))))
    fs.writeFileSync(path.join(OUT, 'kicad', name), JSON.stringify(data))

console.log(`${files.length} arquivos em ${OUT}`)
