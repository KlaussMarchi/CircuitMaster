import fs from 'node:fs'
import path from 'node:path'

// ACERVO EMPACOTADO (npm run data) EM data/; SEM ELE, O SUBCONJUNTO VERSIONADO DOS TESTES, QUE TAMBÉM SOBE O APP COM POUCAS PEÇAS
const PACK     = path.resolve(import.meta.dirname, '../../data')
const FIXTURES = path.resolve(import.meta.dirname, '../../tests/fixtures')

export const DATA = process.env.CM_DATA ?? (fs.existsSync(PACK) ? PACK : FIXTURES)
// O PACOTE COMPLETO GRAVA O VERSION.json E O SUBCONJUNTO NÃO; NA RODADA GRAVADA DO tools/Data/fixtures.ts OS TESTES QUE PERCORREM O ACERVO INTEIRO FICAM DE FORA
export const FULL = fs.existsSync(path.join(DATA, 'VERSION.json')) && !process.env.CM_RECORD

// REPOSITÓRIOS DO FRITZING, LIDOS SÓ PELO EMPACOTADOR (tools/Data)
export const FRITZING = process.env.FRITZING_ROOT ?? path.resolve(import.meta.dirname, '../../../Fritzing')

export const UPSTREAM: Record<string, string> = {
    parts: `${FRITZING}/fritzing-parts`,
    app: `${FRITZING}/fritzing-app/resources/parts`,
    sketches: `${FRITZING}/fritzing-app/sketches`,
    fonts: `${FRITZING}/fritzing-app/resources/fonts`
}

export const ROOTS: Record<string, string> = Object.fromEntries(Object.keys(UPSTREAM).map(root => [root, `${DATA}/fritzing/${root}`]))

export const PART_FOLDERS: Record<string, string[]> = { parts: ['core', 'contrib', 'obsolete', 'user'], app: ['core'] }

export const listFiles = (root: string, folder: string, extension: string): string[] => {
    const base = path.join(root, folder)

    if (!fs.existsSync(base))
        return []

    return fs.readdirSync(base, { recursive: true, encoding: 'utf8' }).filter(name => name.endsWith(extension)).map(name => path.join(folder, name).split(path.sep).join('/'))
}

// LISTAGENS QUE O EMPACOTADOR GRAVA COMO ARQUIVOS AO LADO DAS RAÍZES (data/fritzing/*.json)
export const getListings = (roots = ROOTS) => {
    const fzp = Object.entries(PART_FOLDERS).flatMap(([root, folders]) => folders.flatMap(folder => listFiles(roots[root], folder, '.fzp').map(file => {
        const stat = fs.statSync(path.join(roots[root], file))
        return { root, path: file, size: stat.size, mtime: stat.mtimeMs }
    })))

    const svg      = Object.keys(PART_FOLDERS).flatMap(root => listFiles(roots[root], 'svg', '.svg').map(file => `${root}/${file}`))
    const sketches = listFiles(roots.sketches, '', '.fzz')
    return { 'fzp.json': fzp, 'svg.json': svg, 'sketches.json': sketches, 'bins.json': listFiles(roots.parts, 'bins', '.fzb') }
}
