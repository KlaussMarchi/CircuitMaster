import { childrenOf, tagOf, type XmlElement } from '../Xml'
import type { SvgFile } from '../SvgFile'

type Point   = { x: number, y: number }
type Contour = (Point & { on: boolean })[]

export type TextRun = { d: string, element: XmlElement }

export const FONT_FILES: Record<string, string> = {
    ocra: 'OCRA.ttf',
    ocrfritzingmono: 'OCR-Fritzing-mono.ttf',
    droidsans: 'DroidSans/DroidSans.ttf',
    droidsansbold: 'DroidSans/DroidSans-Bold.ttf',
    droidsansmono: 'DroidSans/DroidSansMono.ttf',
    notosans: 'NotoSans/NotoSans-Regular.ttf',
    segment16c: 'Segment16/Segment16C Bold.ttf'
}

const ALIASES: Record<string, string> = { ocrastd: 'ocra', ocra10: 'ocra', ocrabold: 'ocra', droiddroidsans: 'droidsans', droid: 'droidsans', sans: 'droidsans', sansserif: 'droidsans' }
const FALLBACK     = 'droidsans'    // FAMÍLIAS SEM SUPORTE VIRAM DROID SANS
const MAX_DEPTH    = 8              // ANINHAMENTO MÁXIMO DE GLIFOS COMPOSTOS
const DEFAULT_SIZE = 16
const DIGITS       = 1000
const CMAP_RANK: [number, number, number][] = [[3, 10, 0], [0, 4, 1], [0, 6, 1], [3, 1, 2], [0, 3, 3], [0, 1, 3], [0, 0, 3]]

const round = (value: number) => Math.round(value * DIGITS) / DIGITS

const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

// CONTORNOS DE UMA FONTE TRUETYPE (TABELAS glyf/loca): MAPA DE CARACTERES, AVANÇOS E CURVAS QUADRÁTICAS DOS GLIFOS
export class Font {
    view: DataView
    tables = new Map<string, number>()
    unitsPerEm = 1000
    longLoca = false
    metrics = 0
    cmap = new Map<number, number>()
    contours = new Map<number, Contour[]>()

    constructor(bytes: Uint8Array) {
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    }

    u8 = (at: number) => this.view.getUint8(at)
    i8 = (at: number) => this.view.getInt8(at)
    u16 = (at: number) => this.view.getUint16(at)
    i16 = (at: number) => this.view.getInt16(at)
    u32 = (at: number) => this.view.getUint32(at)
    f2dot14 = (at: number) => this.i16(at) / 16384

    update() {
        for (let i = 0; i < this.u16(4); i++) {
            const at  = 12 + 16 * i
            const tag = String.fromCharCode(this.u8(at), this.u8(at + 1), this.u8(at + 2), this.u8(at + 3))
            this.tables.set(tag, this.u32(at + 8))
        }

        const head = this.tables.get('head') ?? 0
        this.unitsPerEm = this.u16(head + 18)
        this.longLoca   = this.i16(head + 50) === 1
        this.metrics    = this.u16((this.tables.get('hhea') ?? 0) + 34)
        this.readCmap()
    }

    // TABELA cmap PREFERIDA (UNICODE COMPLETO, DEPOIS BMP): FORMATO 12 POR GRUPOS, FORMATO 4 POR SEGMENTOS COM idDelta/idRangeOffset
    readCmap() {
        const base    = this.tables.get('cmap') ?? 0
        const records = Array.from({ length: this.u16(base + 2) }, (_, i) => ({ platform: this.u16(base + 4 + 8 * i), encoding: this.u16(base + 6 + 8 * i), at: base + this.u32(base + 8 + 8 * i) }))
        const rank    = (platform: number, encoding: number) => CMAP_RANK.find(([p, e]) => p === platform && e === encoding)?.[2] ?? 9
        const chosen  = records.filter(record => [4, 12].includes(this.u16(record.at))).sort((a, b) => rank(a.platform, a.encoding) - rank(b.platform, b.encoding))[0]

        if (!chosen)
            return

        if (this.u16(chosen.at) === 12) {
            for (let i = 0; i < this.u32(chosen.at + 12); i++) {
                const at    = chosen.at + 16 + 12 * i
                const first = this.u32(at)

                for (let code = first; code <= this.u32(at + 4); code++)
                    this.cmap.set(code, this.u32(at + 8) + code - first)
            }

            return
        }

        const segments = this.u16(chosen.at + 6) / 2
        const ends     = chosen.at + 14
        const starts   = ends + 2 * segments + 2
        const deltas   = starts + 2 * segments
        const ranges   = deltas + 2 * segments

        for (let i = 0; i < segments; i++) {
            const [first, last, delta, offset] = [this.u16(starts + 2 * i), this.u16(ends + 2 * i), this.i16(deltas + 2 * i), this.u16(ranges + 2 * i)]

            for (let code = first; code <= last && code !== 0xffff; code++) {
                const indexed = offset ? this.u16(ranges + 2 * i + offset + 2 * (code - first)) : code
                const glyph   = offset && indexed === 0 ? 0 : (indexed + delta) & 0xffff

                if (glyph)
                    this.cmap.set(code, glyph)
            }
        }
    }

    getGlyph(char: string) {
        return this.cmap.get(char.codePointAt(0) ?? 0) ?? 0
    }

    getAdvance(glyph: number) {
        return this.u16((this.tables.get('hmtx') ?? 0) + 4 * Math.min(glyph, this.metrics - 1))
    }

    getLocation(glyph: number) {
        const loca = this.tables.get('loca') ?? 0
        return this.longLoca ? this.u32(loca + 4 * glyph) : 2 * this.u16(loca + 2 * glyph)
    }

    getContours(glyph: number, depth = 0): Contour[] {
        if (this.contours.has(glyph))
            return this.contours.get(glyph) ?? []

        const start = this.getLocation(glyph)
        const at    = (this.tables.get('glyf') ?? 0) + start
        const count = this.getLocation(glyph + 1) > start ? this.i16(at) : 0
        const found = count > 0 ? this.readSimple(at, count) : count < 0 && depth < MAX_DEPTH ? this.readComposite(at, depth) : []
        this.contours.set(glyph, found)
        return found
    }

    // GLIFO SIMPLES: FIM DE CADA CONTORNO, FLAGS COM REPETIÇÃO E COORDENADAS DELTA CURTAS (u8 COM SINAL NA FLAG) OU LONGAS (i16)
    readSimple(at: number, count: number): Contour[] {
        const ends  = Array.from({ length: count }, (_, i) => this.u16(at + 10 + 2 * i))
        const total = ends[count - 1] + 1
        const flags: number[] = []
        let p = at + 12 + 2 * count + this.u16(at + 10 + 2 * count)

        while (flags.length < total) {
            const flag = this.u8(p++)
            const more = flag & 8 ? this.u8(p++) : 0
            flags.push(...Array(1 + more).fill(flag))
        }

        const readAxis = (short: number, same: number) => {
            let value = 0
            return flags.slice(0, total).map(flag => {
                if (flag & short)
                    value += flag & same ? this.u8(p++) : -this.u8(p++)

                if (!(flag & short) && !(flag & same)) {
                    value += this.i16(p)
                    p += 2
                }

                return value
            })
        }

        const xs = readAxis(2, 16)
        const ys = readAxis(4, 32)
        return ends.map((end, i) => Array.from({ length: end - (i ? ends[i - 1] : -1) }, (_, k) => {
            const n = (i ? ends[i - 1] + 1 : 0) + k
            return { x: xs[n], y: ys[n], on: (flags[n] & 1) === 1 }
        }))
    }

    // GLIFO COMPOSTO: COMPONENTES COM DESLOCAMENTO E ESCALA (ÚNICA, POR EIXO OU 2×2); CASAMENTO POR PONTOS NÃO DESLOCA
    readComposite(at: number, depth: number): Contour[] {
        const result: Contour[] = []
        let p = at + 10
        let flags = 0x20

        while (flags & 0x20) {
            flags       = this.u16(p)
            const glyph = this.u16(p + 2)
            const words = (flags & 1) !== 0
            const xy    = (flags & 2) !== 0
            const dx    = xy ? (words ? this.i16(p + 4) : this.i8(p + 4)) : 0
            const dy    = xy ? (words ? this.i16(p + 6) : this.i8(p + 5)) : 0
            p += words ? 8 : 6

            const [a, b, c, d] = flags & 8    ? [this.f2dot14(p), 0, 0, this.f2dot14(p)] :
                                 flags & 0x40 ? [this.f2dot14(p), 0, 0, this.f2dot14(p + 2)] :
                                 flags & 0x80 ? [this.f2dot14(p), this.f2dot14(p + 2), this.f2dot14(p + 4), this.f2dot14(p + 6)] : [1, 0, 0, 1]
            p += flags & 8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0

            result.push(...this.getContours(glyph, depth + 1).map(contour => contour.map(point => ({ x: a * point.x + c * point.y + dx, y: b * point.x + d * point.y + dy, on: point.on }))))
        }

        return result
    }

    getWidth(text: string, size: number, spacing = 0) {
        return [...text].reduce((sum, char) => sum + this.getAdvance(this.getGlyph(char)) * size / this.unitsPerEm + spacing, 0)
    }

    // CAMINHO SVG DO TEXTO COM A LINHA DE BASE EM (x, y): ON-CURVE VIRA L, OFF-CURVE VIRA Q, DOIS OFF-CURVE SEGUIDOS IMPLICAM O PONTO MÉDIO
    getPath(text: string, x: number, y: number, size: number, spacing = 0) {
        const scale = size / this.unitsPerEm
        let pen = x
        let d   = ''

        for (const char of text) {
            const glyph = this.getGlyph(char)
            const at    = (point: Point) => `${round(pen + point.x * scale)} ${round(y - point.y * scale)}`

            for (const contour of this.getContours(glyph)) {
                const first = contour.findIndex(point => point.on)
                const start = first >= 0 ? contour[first] : mid(contour[contour.length - 1], contour[0])
                const order = first >= 0 ? [...contour.slice(first + 1), ...contour.slice(0, first + 1)] : contour
                let control: Point | null = null
                d += `M${at(start)}`

                for (const point of order) {
                    if (point.on)
                        d += control ? `Q${at(control)} ${at(point)}` : `L${at(point)}`

                    if (!point.on && control)
                        d += `Q${at(control)} ${at(mid(control, point))}`

                    control = point.on ? null : point
                }

                d += `${control ? `Q${at(control)} ${at(start)}` : ''}Z`
            }

            pen += this.getAdvance(glyph) * scale + spacing
        }

        return d
    }
}

export type Fonts = Map<string, Font>

export const pickFont = (fonts: Fonts, family: string | null, weight: string | null) => {
    const names = (family ?? '').split(',').map(name => name.replace(/['"\s-]/g, '').toLowerCase()).map(name => ALIASES[name] ?? name)
    const key   = names.find(name => fonts.has(name)) ?? FALLBACK
    const bold  = /bold|[6-9]00/.test(weight ?? '') && fonts.has(`${key}bold`) ? `${key}bold` : key
    return fonts.get(bold) ?? fonts.get(FALLBACK)
}

const collapse = (text: string, preserve: boolean) => preserve ? text.replace(/[\n\r\t]/g, ' ') : text.replace(/[\n\r]/g, '').replace(/\t/g, ' ').replace(/ +/g, ' ')

const firstNumber = (value: string | null) => {
    const number = parseFloat((value ?? '').trim().split(/[\s,]+/)[0])
    return Number.isFinite(number) ? number : null
}

// TEXTO DO SVG EM CONTORNOS: CADA TRECHO DE <text>/<tspan> COM FONTE, TAMANHO E POSIÇÃO DO ESTILO HERDADO; TRECHO COM x PRÓPRIO ABRE UM BLOCO DE ÂNCORA
export const getTextRuns = (svg: SvgFile, text: XmlElement, fonts: Fonts): TextRun[] => {
    if (!fonts.size || childrenOf(text).some(child => tagOf(child) === 'textPath'))
        return []

    const preserve = text.getAttribute('xml:space') === 'preserve'
    const pieces   = Array.from({ length: text.childNodes.length }, (_, i) => text.childNodes[i]).flatMap(node => {
        if (node.nodeType === 3)
            return [{ content: collapse(node.nodeValue ?? '', preserve), element: text }]

        return node.nodeType === 1 && tagOf(node as XmlElement) === 'tspan' ? [{ content: collapse(node.textContent ?? '', preserve), element: node as XmlElement }] : []
    })

    if (!preserve && pieces.length) {
        pieces[0].content = pieces[0].content.trimStart()
        pieces[pieces.length - 1].content = pieces[pieces.length - 1].content.trimEnd()
    }

    const placed: { content: string, element: XmlElement, font: Font, size: number, spacing: number, x: number, y: number, chunk: number }[] = []
    const chunks: { anchor: string, width: number }[] = []
    let pen = [firstNumber(text.getAttribute('x')) ?? 0, firstNumber(text.getAttribute('y')) ?? 0]

    for (const { content, element } of pieces) {
        const own     = element !== text
        const x       = own ? firstNumber(element.getAttribute('x')) : null
        const y       = own ? firstNumber(element.getAttribute('y')) : null
        const font    = pickFont(fonts, svg.getStyle(element, 'font-family'), svg.getStyle(element, 'font-weight'))
        const sized   = svg.getStyle(element, 'font-size')
        const size    = sized ? svg.length(element, 'font-size', sized) || DEFAULT_SIZE : DEFAULT_SIZE
        const spacing = parseFloat(svg.getStyle(element, 'letter-spacing') ?? '') || 0
        pen = [(x ?? pen[0]) + (own ? firstNumber(element.getAttribute('dx')) ?? 0 : 0), (y ?? pen[1]) + (own ? firstNumber(element.getAttribute('dy')) ?? 0 : 0)]

        if (!font || !content)
            continue

        if (x !== null || !chunks.length)
            chunks.push({ anchor: svg.getStyle(element, 'text-anchor') ?? 'start', width: 0 })

        const width = font.getWidth(content, size, spacing)
        placed.push({ content, element, font, size, spacing, x: pen[0], y: pen[1], chunk: chunks.length - 1 })
        chunks[chunks.length - 1].width += width
        pen = [pen[0] + width, pen[1]]
    }

    const shift = chunks.map(({ anchor, width }) => anchor === 'middle' ? -width / 2 : anchor === 'end' ? -width : 0)
    return placed.map(item => ({ d: item.font.getPath(item.content, item.x + shift[item.chunk], item.y, item.size, item.spacing), element: item.element }))
}
