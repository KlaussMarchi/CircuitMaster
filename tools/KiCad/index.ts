import fs from 'node:fs'
import path from 'node:path'
import { DATA, listFiles } from '../Fritzing/index.ts'

// REPOSITÓRIOS DO KICAD, LIDOS SÓ PELO EMPACOTADOR (tools/Data) E PELOS TESTES OPCIONAIS DOS DEMOS
export const KICAD = process.env.KICAD_ROOT ?? path.resolve(import.meta.dirname, '../../../KiCad')

export const UPSTREAM: Record<string, string> = {
    symbols: `${KICAD}/kicad-symbols`,
    footprints: `${KICAD}/kicad-footprints`
}

export const DEMOS = `${KICAD}/kicad/demos`    // FORA DO PACOTE: O APP NÃO USA, SÓ A IDA E VOLTA SEM PERDA DOS TESTES (spec 07)

export const ROOTS: Record<string, string> = Object.fromEntries(Object.keys(UPSTREAM).map(root => [root, `${DATA}/kicad/${root}`]))

const field = (text: string, name: string) => text.match(new RegExp(`\\(property "${name}" "((?:[^"\\\\]|\\\\.)*)"`))?.[1] ?? ''

// RESUMO DE CADA SÍMBOLO PARA A BUSCA UNIFICADA: "BIBLIOTECA⇥NOME⇥DESCRIÇÃO⇥PALAVRAS-CHAVE", UM TEXTO POR SÍMBOLO, QUE O NAVEGADOR LÊ MAIS DEPRESSA QUE LISTAS (SPEC 08 §5)
const getSymbols = (root: string, files: string[]) => files.flatMap(file => {
    const [folder, name] = file.split('/')
    const text           = fs.readFileSync(path.join(root, file), 'utf8')
    return folder?.endsWith('.kicad_symdir') && name ? [[folder.slice(0, -'.kicad_symdir'.length), name.slice(0, -'.kicad_sym'.length), field(text, 'Description'), field(text, 'ki_keywords')].map(value => value.replaceAll('\t', ' ')).join('\t')] : []
})

// LISTAGENS DAS BIBLIOTECAS (UM .kicad_sym POR SÍMBOLO NAS PASTAS .kicad_symdir, UM .kicad_mod POR FOOTPRINT) E DO RESUMO DOS SÍMBOLOS
export const getListings = (roots = ROOTS) => {
    const symbols = listFiles(roots.symbols, '', '.kicad_sym')
    return { 'symbols.json': symbols, 'symbols-index.json': getSymbols(roots.symbols, symbols), 'footprints.json': listFiles(roots.footprints, '', '.kicad_mod') }
}
