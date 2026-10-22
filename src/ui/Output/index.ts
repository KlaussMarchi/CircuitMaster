import { strToU8, zipSync } from 'fflate'
import type { Box } from '../../core/Geometry'
import { PX_PER_INCH } from '../../core/Units'
import type { Clipper } from '../../core/Clipper'
import { getArtwork, type Artwork } from '../../core/Cam'
import { exportEtchable, exportEtchablePdf, exportFabrication } from '../../core/Gerber'
import { exportBomCsv, exportBomHtml, exportBomPdf, exportPickAndPlace } from '../../core/Bom'
import { exportIpc } from '../../core/Ipc'
import { exportSpice } from '../../core/Spice'
import { Pdf } from '../../core/Pdf'
import { Scene } from '../../engine/Scene'
import { boardProblem, download, getClipper, needsBoard, type BoardKind, type Context, type ExportKind } from '../Export'
import { t } from '../../core/Text'

type Output = [string, string | Uint8Array, string]

const ZIP        = 'application/zip'
const TEXT       = 'text/plain'
const PDF        = 'application/pdf'
const IMAGE_DPI  = 300
const MAX_PIXELS = 8000     // LADO MÁXIMO DA IMAGEM EXPORTADA
const MARGIN     = 10       // PX DE CENA EM VOLTA DO DESENHO
const QUALITY    = 0.92
const POINTS     = 72

const zip = (files: Record<string, string | Uint8Array>) => zipSync(Object.fromEntries(Object.entries(files).map(([name, data]) => [name, typeof data === 'string' ? strToU8(data) : data])))

const toBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))

// TUDO O QUE A FÁBRICA PEDE NUM ZIP SÓ: GERBER E FURAÇÃO, MONTAGEM (PICK-AND-PLACE), TESTE ELÉTRICO (IPC-D-356A) E A LISTA DE MATERIAIS
const getProduction = (artwork: Artwork, clipper: Clipper, context: Context, base: string) => ({
    ...exportFabrication(artwork, clipper, base),
    [`${base}_pnp.xy`]: exportPickAndPlace(artwork, context.library, base),
    [`${base}.ipc`]: exportIpc(context.doc, context.library, artwork, new Scene(context.doc, context.library, 'pcbView'), base),
    [`${base}_bom.csv`]: exportBomCsv(context.doc, context.library),
    [`${base}_bom.html`]: exportBomHtml(context.doc, context.library, base)
})

const BOARD: Record<BoardKind, (artwork: Artwork, clipper: Clipper, context: Context, base: string) => Output> = {
    production: (artwork, clipper, context, base) => [`${base}_producao.zip`, zip(getProduction(artwork, clipper, context, base)), ZIP],
    gerber: (artwork, clipper, context, base) => [`${base}_gerber.zip`, zip({ ...exportFabrication(artwork, clipper, base), [`${base}_pnp.xy`]: exportPickAndPlace(artwork, context.library, base) }), ZIP],
    etchableSvg: (artwork, clipper, _, base) => [`${base}_etch_svg.zip`, zip(exportEtchable(artwork, clipper, base)), ZIP],
    etchablePdf: (artwork, clipper, _, base) => [`${base}_etch_pdf.zip`, zip(exportEtchablePdf(artwork, clipper, base)), ZIP],
    pnp: (artwork, _, context, base) => [`${base}_pnp.xy`, exportPickAndPlace(artwork, context.library, base), TEXT],
    ipc: (artwork, _, context, base) => [`${base}.ipc`, exportIpc(context.doc, context.library, artwork, new Scene(context.doc, context.library, 'pcbView'), base), TEXT]
}

const SKETCH: Partial<Record<ExportKind, (context: Context, base: string) => Output | null>> = {
    bomHtml: (context, base) => [`${base}_bom.html`, exportBomHtml(context.doc, context.library, base), 'text/html'],
    bomCsv: (context, base) => [`${base}_bom.csv`, exportBomCsv(context.doc, context.library), 'text/csv'],
    bomPdf: (context, base) => [`${base}_bom.pdf`, exportBomPdf(context.doc, context.library, base), PDF],
    xml: (context, base) => context.netlist && [`${base}_netlist.xml`, context.netlist.export(context.view, instance => new Scene(context.doc, context.library, context.view).isShown(instance), context.name), 'application/xml'],
    spice: (context, base) => context.netlist && [`${base}.cir`, exportSpice(context.doc, context.library, context.netlist, base), TEXT]
}

// SVG AUTÔNOMO DA VISTA: SEM GRADE, SELEÇÃO NEM RATSNEST, IMAGENS DAS PEÇAS EMBUTIDAS, CAIXA DO DESENHO EM POLEGADAS
const getSvgText = async (svg: SVGSVGElement, bounds: Box, flat: boolean) => {
    const clone   = svg.cloneNode(true) as SVGSVGElement
    const [x, y]  = [bounds[0] - MARGIN, bounds[1] - MARGIN]
    const [w, h]  = [bounds[2] - bounds[0] + 2 * MARGIN, bounds[3] - bounds[1] + 2 * MARGIN]
    const encoder = new TextEncoder()

    clone.querySelectorAll(`[data-overlay]${flat ? ', foreignObject' : ''}`).forEach(node => node.remove())
    await Promise.all([...clone.querySelectorAll('image')].map(async image => {
        const href = image.getAttribute('href') ?? ''

        if (href.startsWith('blob:'))
            image.setAttribute('href', `data:image/svg+xml;base64,${toBase64(encoder.encode(await (await fetch(href)).text()))}`)
    }))

    clone.removeAttribute('class')
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('viewBox', `${x} ${y} ${w} ${h}`)
    clone.setAttribute('width', `${(w / PX_PER_INCH).toFixed(4)}in`)
    clone.setAttribute('height', `${(h / PX_PER_INCH).toFixed(4)}in`)
    clone.setAttribute('style', `background:${svg.dataset.background}`)
    clone.removeAttribute('data-background')
    return { text: new XMLSerializer().serializeToString(clone), size: [w, h] as const, background: svg.dataset.background ?? '#ffffff' }
}

const rasterize = async (svg: SVGSVGElement, bounds: Box, type: string) => {
    const draw = async (flat: boolean) => {
        const { text, size, background } = await getSvgText(svg, bounds, flat)
        const scale  = Math.min(IMAGE_DPI / PX_PER_INCH, MAX_PIXELS / Math.max(size[0], size[1]))
        const image  = new Image()
        const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(size[0] * scale), height: Math.round(size[1] * scale) })
        const ctx    = canvas.getContext('2d')
        image.src    = `data:image/svg+xml;base64,${toBase64(new TextEncoder().encode(text))}`
        await image.decode()

        if (ctx) {
            ctx.fillStyle = background || '#ffffff'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
        }

        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, QUALITY))
        return { bytes: new Uint8Array(await (blob ?? new Blob()).arrayBuffer()), pixels: [canvas.width, canvas.height] as [number, number], size }
    }

    try {
        return await draw(false)
    } catch (error) {
        if (error instanceof DOMException)    // NOTAS EM foreignObject CONTAMINAM O CANVAS: SAI SEM ELAS
            return draw(true)

        throw error
    }
}

const IMAGES: Partial<Record<ExportKind, (svg: SVGSVGElement, bounds: Box, base: string) => Promise<Output>>> = {
    svg: async (svg, bounds, base) => [`${base}.svg`, (await getSvgText(svg, bounds, false)).text, 'image/svg+xml'],
    png: async (svg, bounds, base) => [`${base}.png`, (await rasterize(svg, bounds, 'image/png')).bytes, 'image/png'],
    jpg: async (svg, bounds, base) => [`${base}.jpg`, (await rasterize(svg, bounds, 'image/jpeg')).bytes, 'image/jpeg'],
    pdf: async (svg, bounds, base) => {
        const { bytes, pixels, size } = await rasterize(svg, bounds, 'image/jpeg')
        const pdf = new Pdf()
        pdf.addPage(size[0] / PX_PER_INCH * POINTS, size[1] / PX_PER_INCH * POINTS)
        pdf.image(bytes, pixels, 0, 0, size[0] / PX_PER_INCH * POINTS, size[1] / PX_PER_INCH * POINTS)
        return [`${base}.pdf`, pdf.export(), PDF]
    }
}

// GERA E BAIXA O ARQUIVO PEDIDO NO MENU EXPORTAR; DEVOLVE A MENSAGEM DA BARRA DE STATUS (SPEC 02 §10.4)
export const exportAs = async (kind: ExportKind, context: Context) => {
    const base  = context.name.replace(/\.(fzz|fz)$/i, '') || 'sem-titulo'
    const image = IMAGES[kind]
    const board = needsBoard(kind) ? BOARD[kind] : null
    const plain = SKETCH[kind]

    if (image && (!context.svg || !context.bounds))
        return t('a vista está vazia')

    if (image && context.svg && context.bounds) {
        const [name, data, type] = await image(context.svg, context.bounds, `${base}_${context.view.replace('View', '')}`)
        download(name, data, type)
        return t('{0} exportado', name)
    }

    const problem = board ? boardProblem(context.doc, context.library, context.selection) : null

    if (problem)
        return problem

    if (board) {
        const tools   = await getClipper()
        const artwork = getArtwork(context.doc, context.library, tools, new Scene(context.doc, context.library, 'pcbView'), context.selection)

        if (!artwork)
            return t('a exportação para produção precisa de uma placa na vista PCB')

        const [name, data, type] = board(artwork, tools, context, base)
        download(name, data, type)
        return artwork.skipped ? t('{0} exportado ({1} elementos sem suporte ignorados)', name, artwork.skipped) : t('{0} exportado', name)
    }

    const output = plain?.(context, base)

    if (!output)
        return t('nada para exportar')

    download(...output)
    return t('{0} exportado', output[0])
}
