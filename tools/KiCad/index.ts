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

// LISTAGENS DAS BIBLIOTECAS (UM .kicad_sym POR SÍMBOLO NAS PASTAS .kicad_symdir, UM .kicad_mod POR FOOTPRINT), DOS MODELOS DE PROJETO E DOS DEMOS
export const getListings = () => ({
    'symbols.json': listFiles(ROOTS.symbols, '', '.kicad_sym'),
    'footprints.json': listFiles(ROOTS.footprints, '', '.kicad_mod'),
    'models.json': listFiles(ROOTS.models, '', '.step'),
    'templates.json': KICAD_FILES.flatMap(extension => listFiles(ROOTS.templates, '', extension)),
    'demos.json': KICAD_FILES.flatMap(extension => listFiles(ROOTS.demos, '', extension))
})
