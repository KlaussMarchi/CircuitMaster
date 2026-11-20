// EMPACOTA EM data/ SÓ O QUE O APP E OS TESTES LEEM DOS REPOSITÓRIOS DO FRITZING E DO KICAD, NO LEIAUTE SERVIDO EM /fritzing E /kicad,
// COM AS LISTAGENS JÁ GRAVADAS (QUALQUER SERVIDOR ESTÁTICO SERVE) E OS COMMITS DE ORIGEM NO VERSION.json. USO: npm run data
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import * as Fritzing from '../Fritzing/index.ts'
import * as KiCad from '../KiCad/index.ts'

const OUT  = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(import.meta.dirname, '../../data')
const TEMP = `${OUT}.tmp`

// ENTRADAS DO PRIMEIRO NÍVEL DE CADA RAIZ QUE ENTRAM NO PACOTE (O RESTO É CÓDIGO, CI E DOCUMENTAÇÃO DOS REPOSITÓRIOS)
const PICK: Record<string, Record<string, RegExp>> = {
    fritzing: { parts: /^(core|contrib|obsolete|user|svg|bins|LICENSE\.txt)$/, app: /./, sketches: /./, fonts: /./ },
    kicad: { symbols: /(\.kicad_symdir|\.sp|^sym-lib-table|^LICENSE\.md)$/, footprints: /(\.pretty|^fp-lib-table|^LICENSE\.md)$/ }
}

const UPSTREAM: Record<string, Record<string, string>> = { fritzing: Fritzing.UPSTREAM, kicad: KiCad.UPSTREAM }

const commit = (folder: string) => {
    try {
        return execFileSync('git', ['-C', folder, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    } catch {
        return null
    }
}

const writeJson = (file: string, data: unknown) => fs.writeFileSync(file, JSON.stringify(data))

fs.rmSync(TEMP, { recursive: true, force: true })

for (const [mount, roots] of Object.entries(UPSTREAM))
    for (const [root, source] of Object.entries(roots)) {
        if (!fs.existsSync(source))
            throw new Error(`acervo ausente: ${source} (defina FRITZING_ROOT ou KICAD_ROOT)`)

        for (const name of fs.readdirSync(source).filter(name => PICK[mount][root].test(name)))
            fs.cpSync(path.join(source, name), path.join(TEMP, mount, root, name), { recursive: true, preserveTimestamps: true, filter: file => path.basename(file) !== '.git' })    // O mtime ENTRA NO fzp.json E NO CACHE DO ÍNDICE
    }

// LICENÇAS DO fritzing-app (SKETCHES, FONTES E PEÇAS DO APP)
for (const name of ['LICENSE.CC-BY-SA', 'LICENSE.GPL3'])
    fs.copyFileSync(path.join(Fritzing.FRITZING, 'fritzing-app', name), path.join(TEMP, 'fritzing', name))

const roots = (mount: string) => Object.fromEntries(Object.keys(UPSTREAM[mount]).map(root => [root, path.join(TEMP, mount, root)]))

for (const [name, data] of Object.entries(Fritzing.getListings(roots('fritzing'))))
    writeJson(path.join(TEMP, 'fritzing', name), data)

for (const [name, data] of Object.entries(KiCad.getListings(roots('kicad'))))
    writeJson(path.join(TEMP, 'kicad', name), data)

const sources = { 'fritzing-parts': Fritzing.UPSTREAM.parts, 'fritzing-app': path.join(Fritzing.FRITZING, 'fritzing-app'), 'kicad-symbols': KiCad.UPSTREAM.symbols, 'kicad-footprints': KiCad.UPSTREAM.footprints }
writeJson(path.join(TEMP, 'VERSION.json'), { packed: new Date().toISOString(), commits: Object.fromEntries(Object.entries(sources).map(([name, folder]) => [name, commit(folder)])) })

fs.rmSync(OUT, { recursive: true, force: true })
fs.renameSync(TEMP, OUT)
console.log(`acervo empacotado em ${OUT}`)
