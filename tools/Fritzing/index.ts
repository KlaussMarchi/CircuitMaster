import fs from 'node:fs'
import path from 'node:path'

export const FRITZING = process.env.FRITZING_ROOT ?? path.resolve(import.meta.dirname, '../../../Fritzing')

export const ROOTS: Record<string, string> = {
    parts: `${FRITZING}/fritzing-parts`,
    app: `${FRITZING}/fritzing-app/resources/parts`,
    sketches: `${FRITZING}/fritzing-app/sketches`,
    fonts: `${FRITZING}/fritzing-app/resources/fonts`
}

export const PART_FOLDERS: Record<string, string[]> = { parts: ['core', 'contrib', 'obsolete', 'user'], app: ['core'] }

export const listFiles = (root: string, folder: string, extension: string): string[] => {
    const base = path.join(root, folder)

    if (!fs.existsSync(base))
        return []

    return fs.readdirSync(base, { recursive: true, encoding: 'utf8' }).filter(name => name.endsWith(extension)).map(name => path.join(folder, name).split(path.sep).join('/'))
}

export const getListings = () => {
    const fzp = Object.entries(PART_FOLDERS).flatMap(([root, folders]) => folders.flatMap(folder => listFiles(ROOTS[root], folder, '.fzp').map(file => {
        const stat = fs.statSync(path.join(ROOTS[root], file))
        return { root, path: file, size: stat.size, mtime: stat.mtimeMs }
    })))

    const svg      = Object.keys(PART_FOLDERS).flatMap(root => listFiles(ROOTS[root], 'svg', '.svg').map(file => `${root}/${file}`))
    const sketches = listFiles(ROOTS.sketches, '', '.fzz')
    return { 'fzp.json': fzp, 'svg.json': svg, 'sketches.json': sketches }
}
