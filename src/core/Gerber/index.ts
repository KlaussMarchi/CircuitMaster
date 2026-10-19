import type { Artwork, Face, Hole, Pad, Shape } from '../Cam'
import { toPolygons } from '../Cam'
import type { Clipper, Paths } from '../Clipper'
import { Pdf } from '../Pdf'

const MICRO      = 1000     // µin POR mil (FORMATO 2.6 EM POLEGADAS)
const MASK_GROW  = 5        // mil DE DILATAÇÃO DA MÁSCARA POR LADO (SPEC 03 §2.5)
const CONTOUR    = 8        // mil DA ABERTURA DO CONTORNO
const REGION     = 0.1      // mil DA ABERTURA SELECIONADA ANTES DE UMA REGIÃO
const EDGE       = 0.1      // mil DE TOLERÂNCIA ANTES DE RECORTAR PELA PLACA
const DRILL_UNIT = 10       // UNIDADES DE 0,1 mil POR mil NO EXCELLON
const DIGITS     = 6
const PLATED_AT  = 100

const SUFFIXES: Record<string, string> = { copperTop: '_copperTop.gtl', copperBottom: '_copperBottom.gbl', maskTop: '_maskTop.gts', maskBottom: '_maskBottom.gbs', pasteTop: '_pasteMaskTop.gtp', pasteBottom: '_pasteMaskBottom.gbp', silkTop: '_silkTop.gto', silkBottom: '_silkBottom.gbo', contour: '_contour.gm1' }
const FUNCTIONS: Record<string, string> = { copperTop: 'Copper,L1,Top', copperBottom: 'Copper,L2,Bot', maskTop: 'Soldermask,Top', maskBottom: 'Soldermask,Bot', pasteTop: 'Paste,Top', pasteBottom: 'Paste,Bot', silkTop: 'Legend,Top', silkBottom: 'Legend,Bot', contour: 'Profile,NP' }

const inches = (mils: number) => (mils / 1000).toFixed(6)

const pathBox = (points: number[], pad = 0) => points.reduce((box, value, i) => i % 2 ? [box[0], Math.min(box[1], value - pad), box[2], Math.max(box[3], value + pad)] : [Math.min(box[0], value - pad), box[1], Math.max(box[2], value + pad), box[3]], [Infinity, Infinity, -Infinity, -Infinity])

const boxOf = (shape: Shape) => {
    if (shape.kind === 'circle')
        return [shape.x - shape.r - shape.w / 2, shape.y - shape.r - shape.w / 2, shape.x + shape.r + shape.w / 2, shape.y + shape.r + shape.w / 2]

    if (shape.kind === 'rect')
        return [shape.x - shape.w / 2, shape.y - shape.w / 2, shape.x + shape.width + shape.w / 2, shape.y + shape.height + shape.w / 2]

    return shape.kind === 'region' ? pathBox(shape.paths.flat()) : pathBox(shape.points, shape.w / 2)
}

const isInside = (polygon: number[], x: number, y: number) => {
    let hit = false

    for (let i = 0, j = polygon.length - 2; i < polygon.length; j = i, i += 2) {
        if ((polygon[i + 1] > y) !== (polygon[j + 1] > y) && x < (polygon[j] - polygon[i]) * (y - polygon[i + 1]) / (polygon[j + 1] - polygon[i + 1]) + polygon[i])
            hit = !hit
    }

    return hit
}

// UM CONTORNO DENTRO DO OUTRO: CAIXA CONTIDA E A MAIORIA DOS TRÊS PRIMEIROS VÉRTICES DENTRO (VÉRTICES PODEM TOCAR A BORDA)
const encloses = (outer: number[], outerBox: number[], inner: number[], innerBox: number[]) => outerBox[0] <= innerBox[0] && outerBox[1] <= innerBox[1] && outerBox[2] >= innerBox[2] && outerBox[3] >= innerBox[3] && [0, 2, 4].filter(i => isInside(outer, inner[i], inner[i + 1])).length >= 2

const solidOf = (shape: Shape): Shape => shape.kind === 'circle' || shape.kind === 'rect' ? { ...shape, fill: true } : shape

// UMA CAMADA RS-274X: ABERTURAS DEDUPLICADAS PELO TEXTO (D10 EM DIANTE), FLASHES, TRAÇOS E REGIÕES EM COORDENADAS DE PLACA (SPEC 03 §3)
export class Plotter {
    height: number
    apertures = new Map<string, number>()
    body: string[] = []
    current = ''

    constructor(height: number) {
        this.height = height
    }

    point(x: number, y: number) {
        return `X${Math.round(x * MICRO)}Y${Math.round((this.height - y) * MICRO)}`
    }

    select(aperture: string) {
        if (!this.apertures.has(aperture))
            this.apertures.set(aperture, 10 + this.apertures.size)

        if (this.current !== aperture)
            this.body.push(`D${this.apertures.get(aperture)}*`)

        this.current = aperture
    }

    flash(aperture: string, x: number, y: number) {
        this.select(aperture)
        this.body.push(`${this.point(x, y)}D03*`)
    }

    trace(points: number[], closed: boolean) {
        const pairs = Array.from({ length: points.length / 2 }, (_, i) => [points[2 * i], points[2 * i + 1]])

        for (const [i, [x, y]] of [...pairs, ...closed ? [pairs[0]] : []].entries())
            this.body.push(`${this.point(x, y)}${i ? 'D01' : 'D02'}*`)
    }

    draw(aperture: string, points: number[], closed: boolean) {
        if (points.length < 4)
            return

        this.select(aperture)
        this.trace(points, closed)
        this.body.push('D02*')
    }

    // CONTORNOS ANINHADOS POR PROFUNDIDADE: PAR É COBRE (LPD), ÍMPAR É FURO (LPC), DO MAIS EXTERNO PARA DENTRO
    region(polygons: Paths) {
        const valid = polygons.filter(polygon => polygon.length >= 6)
        const boxes = valid.map(polygon => pathBox(polygon))
        const depth = valid.map((polygon, i) => valid.filter((other, k) => k !== i && encloses(other, boxes[k], polygon, boxes[i])).length)

        for (let level = 0; level <= Math.max(-1, ...depth); level++) {
            const chosen = valid.filter((_, i) => depth[i] === level)

            if (!chosen.length)
                continue

            if (level % 2)
                this.body.push('%LPC*%')

            this.select(`C,${inches(REGION)}`)
            this.body.push('G36*')
            chosen.forEach(polygon => this.trace(polygon, true))
            this.body.push('G37*')

            if (level % 2)
                this.body.push('%LPD*%')
        }
    }

    export(title: string, purpose: string) {
        const apertures = [...this.apertures].map(([aperture, code]) => `%ADD${code}${aperture}*%`)
        return [`G04 CircuitMaster ${title}*`, '%TF.GenerationSoftware,CircuitMaster,CircuitMaster,0.1*%', `%TF.FileFunction,${purpose}*%`, '%FSLAX26Y26*%', '%MOIN*%', ...apertures, '%LPD*%', 'G01*', ...this.body, 'M02*', ''].join('\n')
    }
}

// PRIMITIVA NO PLOTTER: CÍRCULO E RETÂNGULO VIRAM FLASH, PREENCHIMENTO VIRA REGIÃO E TRAÇO VIRA DESENHO (SPEC 03 §3.3–§3.4)
const plot = (plotter: Plotter, clipper: Clipper, shape: Shape, grow = 0) => {
    if (shape.kind === 'region')
        return plotter.region(toPolygons(clipper, shape, grow))

    if (shape.kind === 'circle' && 2 * shape.r + shape.w + 2 * grow > 0)
        return plotter.flash(`C,${inches(2 * shape.r + shape.w + 2 * grow)}`, shape.x, shape.y)

    if (shape.kind === 'rect' && shape.fill)
        return plotter.flash(`R,${inches(shape.width + shape.w + 2 * grow)}X${inches(shape.height + shape.w + 2 * grow)}`, shape.x + shape.width / 2, shape.y + shape.height / 2)

    if (shape.kind === 'rect' && shape.w > 0)
        return plotter.draw(`C,${inches(shape.w + 2 * grow)}`, [shape.x, shape.y, shape.x + shape.width, shape.y, shape.x + shape.width, shape.y + shape.height, shape.x, shape.y + shape.height], true)

    if (shape.kind !== 'path')
        return

    if (shape.fill)
        plotter.region([shape.points])

    if (shape.w + 2 * grow > 0)
        plotter.draw(`${shape.cap === 'square' ? 'R' : 'C'},${inches(shape.w + 2 * grow)}${shape.cap === 'square' ? `X${inches(shape.w + 2 * grow)}` : ''}`, shape.points, shape.closed)
}

const crosses = (shape: Shape, width: number, height: number) => {
    const [x0, y0, x1, y1] = boxOf(shape)
    return x0 < -EDGE || y0 < -EDGE || x1 > width + EDGE || y1 > height + EDGE
}

// COBRE DE UMA FACE: REGIÕES (PLANOS, TEXTO, PATHS PREENCHIDOS) E O QUE CRUZA A BORDA VÃO PRIMEIRO, UNIDOS E RECORTADOS PELA PLACA; DEPOIS FLASHES E TRAÇOS
const copperLayer = (artwork: Artwork, clipper: Clipper, face: Face) => {
    const { board } = artwork
    const plotter   = new Plotter(board.height)
    const areas     = artwork.copper[face].filter(shape => shape.kind === 'region' || crosses(shape, board.width, board.height))
    plotter.region(clipper.intersection(clipper.union(areas.flatMap(shape => toPolygons(clipper, solidOf(shape)))), board.outline))
    artwork.copper[face].filter(shape => !areas.includes(shape)).forEach(shape => plot(plotter, clipper, shape))
    return plotter
}

const padLayer = (artwork: Artwork, clipper: Clipper, pads: Pad[], grow: number) => {
    const plotter = new Plotter(artwork.board.height)
    pads.forEach(pad => plot(plotter, clipper, pad.shape.kind === 'circle' ? { ...pad.shape, fill: true } : pad.shape, grow))
    return plotter
}

const silkLayer = (artwork: Artwork, clipper: Clipper, face: Face) => {
    const plotter  = new Plotter(artwork.board.height)
    const ink      = clipper.union(artwork.silk[face].flatMap(shape => toPolygons(clipper, shape)))
    const openings = clipper.union(artwork.pads.filter(pad => pad.face === face).flatMap(pad => toPolygons(clipper, solidOf(pad.shape), MASK_GROW)))
    plotter.region(clipper.intersection(clipper.difference(ink, openings), artwork.board.outline))
    return plotter
}

// FURAÇÃO EXCELLON: NÃO METALIZADOS EM T1…, METALIZADOS A PARTIR DE T100, COORDENADAS EM 0,1 mil TRUNCADAS (SPEC 03 §4)
export const exportDrill = (holes: Hole[], height: number) => {
    const tools  = (plated: boolean) => [...new Set(holes.filter(hole => hole.plated === plated).map(hole => hole.diameter.toFixed(2)))].sort((a, b) => Number(a) - Number(b))
    const plain  = tools(false)
    const plated = tools(true)
    const first  = (Math.floor(plain.length / PLATED_AT) + 1) * PLATED_AT
    const coord  = (value: number) => String(Math.trunc(value * DRILL_UNIT)).padStart(DIGITS, '0')
    const table  = [...plain.map((diameter, i) => [`T${i + 1}`, diameter, false] as const), ...plated.map((diameter, i) => [`T${first + i}`, diameter, true] as const)]
    const body   = table.flatMap(([tool, diameter, isPlated]) => [tool, ...holes.filter(hole => hole.plated === isPlated && hole.diameter.toFixed(2) === diameter).map(hole => `X${coord(hole.x)}Y${coord(height - hole.y)}`)])
    return ['; CircuitMaster', `; NON-PLATED HOLES START AT T1`, `; THROUGH (PLATED) HOLES START AT T${first}`, 'M48', 'INCH,LZ', 'FMAT,2', ...table.map(([tool, diameter]) => `${tool}C${(Number(diameter) / 1000).toFixed(6)}`), '%', 'G90', 'G05', ...body, 'T00', 'M30', ''].join('\n')
}

// CONJUNTO DE FABRICAÇÃO: GERBERS POR FACE CONFORME AS CAMADAS DA PLACA, CONTORNO E FURAÇÃO (SPEC 03 §3.1)
export const exportFabrication = (artwork: Artwork, clipper: Clipper, prefix: string) => {
    const { board } = artwork
    const faces: Face[] = board.layers > 1 ? ['top', 'bottom'] : ['bottom']
    const name    = (face: Face) => face === 'top' ? 'Top' : 'Bottom'
    const contour = new Plotter(board.height)
    board.outline.forEach(polygon => contour.draw(`C,${inches(CONTOUR)}`, polygon, true))

    const layers: [string, Plotter][] = [
        ...faces.map((face): [string, Plotter] => [`copper${name(face)}`, copperLayer(artwork, clipper, face)]),
        ...faces.map((face): [string, Plotter] => [`mask${name(face)}`, padLayer(artwork, clipper, artwork.pads.filter(pad => pad.face === face), MASK_GROW)]),
        ...faces.map((face): [string, Plotter] => [`paste${name(face)}`, padLayer(artwork, clipper, artwork.pads.filter(pad => pad.face === face && pad.smd && !(pad.shape.kind === 'circle' && pad.shape.drill)), 0)]),
        ['silkTop', silkLayer(artwork, clipper, 'top')],
        ['silkBottom', silkLayer(artwork, clipper, 'bottom')],
        ['contour', contour]
    ]

    return Object.fromEntries([...layers.map(([key, plotter]) => [`${prefix}${SUFFIXES[key]}`, plotter.export(key, FUNCTIONS[key])]), [`${prefix}_drill.txt`, exportDrill(artwork.holes, board.height)]]) as Record<string, string>
}

const POINTS = 72 / 1000    // UNIDADES DO SVG GRAVÁVEL (72 POR POLEGADA) POR mil

const svgPath = (polygons: Paths) => polygons.map(polygon => `M${Array.from({ length: polygon.length / 2 }, (_, i) => `${(polygon[2 * i] * POINTS).toFixed(3)} ${(polygon[2 * i + 1] * POINTS).toFixed(3)}`).join('L')}Z`).join('')

// CAMADAS GRAVÁVEIS (FOTOLITO): COBRE, MÁSCARA, PASTA E SERIGRAFIA POR FACE EM POLÍGONOS DE PLACA (SPEC 03 §5.3)
const getEtchable = (artwork: Artwork, clipper: Clipper): [string, Paths][] => {
    const { board } = artwork
    const faces: Face[] = board.layers > 1 ? ['bottom', 'top'] : ['bottom']
    const pads          = (face: Face, grow: number, keep: (pad: Pad) => boolean) => clipper.union(artwork.pads.filter(pad => pad.face === face && keep(pad)).flatMap(pad => toPolygons(clipper, solidOf(pad.shape), grow)))
    return [
        ...faces.map((face): [string, Paths] => [`etch_copper_${face}`, clipper.intersection(clipper.union(artwork.copper[face].flatMap(shape => toPolygons(clipper, solidOf(shape)))), board.outline)]),
        ...faces.map((face): [string, Paths] => [`etch_mask_${face}`, pads(face, MASK_GROW, () => true)]),
        ...faces.map((face): [string, Paths] => [`etch_paste_mask_${face}`, pads(face, 0, pad => pad.smd)]),
        ...(['top', 'bottom'] as Face[]).map((face): [string, Paths] => [`etch_silk_${face}`, clipper.difference(clipper.union(artwork.silk[face].flatMap(shape => toPolygons(clipper, shape))), pads(face, MASK_GROW, () => true))])
    ]
}

const mirrored = (polygons: Paths, width: number) => polygons.map(polygon => polygon.map((value, i) => i % 2 ? value : width - value))

// ARQUIVOS GRAVÁVEIS EM SVG (72 UNIDADES/in), PRETO SOBRE BRANCO COM O CONTORNO, NORMAL E ESPELHADO (SPEC 03 §5.3)
export const exportEtchable = (artwork: Artwork, clipper: Clipper, prefix: string) => {
    const { board } = artwork
    const [w, h]    = [board.width * POINTS, board.height * POINTS]
    const page      = (polygons: Paths, outline: Paths) => `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${(w / 72).toFixed(4)}in" height="${(h / 72).toFixed(4)}in" viewBox="0 0 ${w.toFixed(3)} ${h.toFixed(3)}"><rect width="100%" height="100%" fill="#ffffff"/><path d="${svgPath(polygons)}" fill="#000000" fill-rule="nonzero"/><path d="${svgPath(outline)}" fill="none" stroke="#000000" stroke-width="${(CONTOUR * POINTS).toFixed(3)}"/></svg>\n`
    return Object.fromEntries(getEtchable(artwork, clipper).flatMap(([name, polygons]) => [[`${prefix}_${name}.svg`, page(polygons, board.outline)], [`${prefix}_${name}_mirror.svg`, page(mirrored(polygons, board.width), mirrored(board.outline, board.width))]])) as Record<string, string>
}

// ARQUIVOS GRAVÁVEIS EM PDF VETORIAL NO TAMANHO DA PLACA, NORMAL E ESPELHADO (SPEC 03 §5.3)
export const exportEtchablePdf = (artwork: Artwork, clipper: Clipper, prefix: string) => {
    const { board } = artwork
    const scale     = (polygons: Paths) => polygons.map(polygon => polygon.map(value => value * POINTS))
    const outline   = clipper.difference(clipper.inflate(board.outline, CONTOUR / 2), clipper.inflate(board.outline, -CONTOUR / 2))
    const document  = (polygons: Paths) => {
        const pdf = new Pdf()
        pdf.addPage(board.width * POINTS, board.height * POINTS)
        pdf.fill(scale(polygons))
        return pdf.export()
    }

    return Object.fromEntries(getEtchable(artwork, clipper).flatMap(([name, polygons]) => {
        const inked = clipper.union([...polygons, ...outline])
        return [[`${prefix}_${name}.pdf`, document(inked)], [`${prefix}_${name}_mirror.pdf`, document(mirrored(inked, board.width))]]
    })) as Record<string, Uint8Array>
}
