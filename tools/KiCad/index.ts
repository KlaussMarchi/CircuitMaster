import fs from 'node:fs'
import path from 'node:path'
import { listFiles } from '../Fritzing/index.ts'

export const KICAD = process.env.KICAD_ROOT ?? path.resolve(import.meta.dirname, '../../../KiCad')

export const ROOTS: Record<string, string> = {
    symbols: `${KICAD}/kicad-symbols`,
    footprints: `${KICAD}/kicad-footprints`,
    models: `${KICAD}/kicad-packages3D`,
    templates: `${KICAD}/kicad-templates`,
    demos: `${KICAD}/kicad/demos`
}

const KICAD_FILES = ['.kicad_pro', '.kicad_sch', '.kicad_pcb', '.kicad_sym', '.kicad_wks']

const field = (text: string, name: string) => text.match(new RegExp(`\\(property "${name}" "((?:[^"\\\\]|\\\\.)*)"`))?.[1] ?? ''

// RESUMO DE CADA SÍMBOLO PARA A BUSCA UNIFICADA: [BIBLIOTECA, NOME, DESCRIÇÃO, PALAVRAS-CHAVE] (SPEC 08 §5)
const getSymbols = (files: string[]) => files.flatMap(file => {
    const [folder, name] = file.split('/')
    const text           = fs.readFileSync(path.join(ROOTS.symbols, file), 'utf8')
    return folder?.endsWith('.kicad_symdir') && name ? [[folder.slice(0, -'.kicad_symdir'.length), name.slice(0, -'.kicad_sym'.length), field(text, 'Description'), field(text, 'ki_keywords')]] : []
})

// LISTAGENS DAS BIBLIOTECAS (UM .kicad_sym POR SÍMBOLO NAS PASTAS .kicad_symdir, UM .kicad_mod POR FOOTPRINT), DO RESUMO DOS SÍMBOLOS, DOS MODELOS DE PROJETO E DOS DEMOS
export const getListings = () => ({
    'symbols.json': listFiles(ROOTS.symbols, '', '.kicad_sym'),
    'symbols-index.json': getSymbols(listFiles(ROOTS.symbols, '', '.kicad_sym')),
    'footprints.json': listFiles(ROOTS.footprints, '', '.kicad_mod'),
    'models.json': listFiles(ROOTS.models, '', '.step'),
    'templates.json': KICAD_FILES.flatMap(extension => listFiles(ROOTS.templates, '', extension)),
    'demos.json': KICAD_FILES.flatMap(extension => listFiles(ROOTS.demos, '', extension))
})
