import type { Doc } from '../../core/Document'
import type { Library } from '../../core/Library'
import type { Netlist } from '../../core/Netlist'
import type { VIEWS } from '../../core/Layer'
import type { Box } from '../../core/Geometry'
import { Clipper } from '../../core/Clipper'
import { pickBoard } from '../../core/Cam'
import { Scene } from '../../engine/Scene'
import { t } from '../../core/Text'

// EXPORTAÇÕES QUE PRECISAM DE UMA PLACA NA VISTA PCB; A GERAÇÃO DOS ARQUIVOS (ui/Output) SÓ CARREGA QUANDO SE EXPORTA
const BOARD_EXPORTS = ['production', 'gerber', 'etchableSvg', 'etchablePdf', 'pnp', 'ipc'] as const

export type BoardKind  = typeof BOARD_EXPORTS[number]
export type ExportKind = BoardKind | 'png' | 'jpg' | 'svg' | 'pdf' | 'bomHtml' | 'bomCsv' | 'bomPdf' | 'xml' | 'spice'
export type Context    = { doc: Doc, library: Library, netlist: Netlist | null, view: typeof VIEWS[number], name: string, svg: SVGSVGElement | null, bounds: Box | null, selection: string[] }

export const needsBoard = (kind: ExportKind): kind is BoardKind => (BOARD_EXPORTS as readonly string[]).includes(kind)

let clipper: Promise<Clipper> | null = null

export const getClipper = () => clipper ?? (clipper = import('../../core/Clipper/clipper2.js').then(({ default: createClipper }) => createClipper()).then(module => new Clipper(module)))    // A COLA DO WASM SÓ CARREGA NA PRIMEIRA OPERAÇÃO DE PCB

export const download = (name: string, data: string | Uint8Array, type: string) => {
    const url  = URL.createObjectURL(new Blob([typeof data === 'string' ? data : new Uint8Array(data)], { type }))
    const link = Object.assign(document.createElement('a'), { href: url, download: name })
    link.click()
    setTimeout(() => URL.revokeObjectURL(url))
}


// MOTIVO DE NÃO HAVER PLACA PARA UMA OPERAÇÃO DE PCB, OU NULO (SPEC 03 §2.1)
export const boardProblem = (doc: Doc, library: Library, selection: string[]) => {
    const { host, boards } = pickBoard(doc, library, new Scene(doc, library, 'pcbView'), selection)
    return host          ? null :
           boards.length ? t('há mais de uma placa: selecione a placa desejada (as operações de PCB trabalham com uma placa por vez)') : t('é preciso uma placa na vista PCB')
}
