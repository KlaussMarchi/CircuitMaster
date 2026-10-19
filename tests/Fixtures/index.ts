import fs from 'node:fs'
import path from 'node:path'
import { ROOTS, getListings, listFiles } from '../../tools/Fritzing'
import { Library, type PartLocation, type Source } from '../../src/core/Library'
import { loadNetlistWasm } from '../../src/core/Netlist'
import { FONT_FILES } from '../../src/core/Font'

export const HAS_FRITZING = fs.existsSync(ROOTS.parts)

export const readText = (root: string, file: string) => fs.readFileSync(path.join(ROOTS[root], file), 'utf8')

export const listParts = () => HAS_FRITZING ? getListings()['fzp.json'] : []

let moduleIndex: Map<string, PartLocation> | null = null

export const getModuleIndex = () => {
    if (moduleIndex)
        return moduleIndex

    moduleIndex = new Map()

    for (const { root, path: file } of listParts()) {
        const id = readText(root, file).slice(0, 4000).match(/moduleId\s*=\s*["']([^"']+)/)?.[1]

        if (id && !moduleIndex.has(id))
            moduleIndex.set(id, { root, path: file })
    }

    return moduleIndex
}

export const fileSource: Source = {
    locate: async moduleIds => Object.fromEntries(moduleIds.flatMap(id => {
        const location = getModuleIndex().get(id)
        return location ? [[id, location]] : []
    })),
    read: async (root, file) => fs.existsSync(path.join(ROOTS[root], file)) ? readText(root, file) : null,
    has: (root, file) => fs.existsSync(path.join(ROOTS[root], file))
}

export const makeLibrary = (fonts = false) => {
    const library = new Library(fileSource)

    if (fonts)
        Object.entries(FONT_FILES).forEach(([key, file]) => library.addFont(key, new Uint8Array(fs.readFileSync(path.join(ROOTS.fonts, file)))))

    return library
}

export const listSketches = (modern: boolean) => listFiles(ROOTS.sketches, '', '.fzz').filter(file => !modern || !file.includes('obsolete/')).map(file => path.join(ROOTS.sketches, file))

export const loadWasm = () => loadNetlistWasm(fs.readFileSync(path.resolve(import.meta.dirname, '../../src/core/Netlist/netlist.wasm')))
