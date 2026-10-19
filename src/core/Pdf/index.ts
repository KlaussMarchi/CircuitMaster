import { strToU8 } from 'fflate'

type Page  = { width: number, height: number, content: string[], images: number[] }
type Image = { bytes: Uint8Array, width: number, height: number }

const DIGITS = 3
const LATIN  = 0xff
const ASCII  = 0x7e

const WINANSI: Record<string, number> = { '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 }

const number = (value: number) => String(Math.round(value * 10 ** DIGITS) / 10 ** DIGITS)

const color = (hex: string) => [1, 3, 5].map(i => number(parseInt(hex.slice(i, i + 2), 16) / 255)).join(' ')

// TEXTO EM WinAnsi: ASCII, LATIN-1 E A PONTUAÇÃO TIPOGRÁFICA PASSAM, Ω VIRA "Ohm", O RESTO VIRA "?"; PARÊNTESES E BARRA ESCAPADOS
const encode = (text: string) => [...text.replace(/[\u2126\u03a9]/g, 'Ohm')].map(char => {
    const code = char.codePointAt(0) ?? 63
    const byte = WINANSI[char] ?? (code <= ASCII || (code >= 0xa0 && code <= LATIN) ? code : 63)
    return byte === 40 || byte === 41 || byte === 92 ? `\\${char}` : byte > ASCII ? `\\${byte.toString(8).padStart(3, '0')}` : String.fromCharCode(byte)
}).join('')

// DOCUMENTO PDF 1.4 MÍNIMO: PÁGINAS EM PONTOS COM ORIGEM NO CANTO SUPERIOR ESQUERDO, POLÍGONOS PREENCHIDOS (NÃO ZERO), LINHAS, TEXTO HELVETICA E IMAGENS JPEG
export class Pdf {
    pages: Page[] = []
    images: Image[] = []

    addPage(width: number, height: number) {
        this.pages.push({ width, height, content: [], images: [] })
    }

    get page() {
        return this.pages[this.pages.length - 1]
    }

    fill(polygons: number[][], hex = '#000000') {
        const y     = (value: number) => number(this.page.height - value)
        const paths = polygons.filter(polygon => polygon.length >= 6).map(polygon => Array.from({ length: polygon.length / 2 }, (_, i) => `${number(polygon[2 * i])} ${y(polygon[2 * i + 1])} ${i ? 'l' : 'm'}`).join(' ') + ' h')

        if (paths.length)
            this.page.content.push(`${color(hex)} rg ${paths.join(' ')} f`)
    }

    line(x0: number, y0: number, x1: number, y1: number, width: number, hex = '#000000') {
        this.page.content.push(`${color(hex)} RG ${number(width)} w ${number(x0)} ${number(this.page.height - y0)} m ${number(x1)} ${number(this.page.height - y1)} l S`)
    }

    text(x: number, y: number, size: number, text: string, bold = false, hex = '#000000') {
        this.page.content.push(`${color(hex)} rg BT /${bold ? 'F2' : 'F1'} ${number(size)} Tf ${number(x)} ${number(this.page.height - y)} Td (${encode(text)}) Tj ET`)
    }

    image(bytes: Uint8Array, pixels: [number, number], x: number, y: number, width: number, height: number) {
        this.images.push({ bytes, width: pixels[0], height: pixels[1] })
        this.page.images.push(this.images.length)
        this.page.content.push(`q ${number(width)} 0 0 ${number(height)} ${number(x)} ${number(this.page.height - y - height)} cm /Im${this.images.length} Do Q`)
    }

    export() {
        const objects: (string | Uint8Array)[][] = []
        const add     = (...parts: (string | Uint8Array)[]) => void objects.push(parts)
        const pageIds = this.pages.map((_, i) => 5 + 2 * i)
        const imageId = (k: number) => 5 + 2 * this.pages.length + k - 1

        objects.push(['<< /Type /Catalog /Pages 2 0 R >>'])
        objects.push([`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${this.pages.length} >>`])
        objects.push(['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'])
        objects.push(['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'])

        this.pages.forEach((page, i) => {
            const stream    = page.content.join('\n')
            const xobjects  = page.images.map(k => `/Im${k} ${imageId(k)} 0 R`).join(' ')
            const resources = `<< /Font << /F1 3 0 R /F2 4 0 R >>${xobjects ? ` /XObject << ${xobjects} >>` : ''} >>`
            add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${number(page.width)} ${number(page.height)}] /Contents ${pageIds[i] + 1} 0 R /Resources ${resources} >>`)
            add(`<< /Length ${strToU8(stream).length} >>\nstream\n`, stream, '\nendstream')
        })

        this.images.forEach(image => add(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`, image.bytes, '\nendstream'))

        const chunks: Uint8Array[] = [strToU8('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')]
        const offsets: number[]    = []
        let size = chunks[0].length

        objects.forEach((parts, i) => {
            offsets.push(size)
            const bytes = [strToU8(`${i + 1} 0 obj\n`), ...parts.map(part => typeof part === 'string' ? strToU8(part) : part), strToU8('\nendobj\n')]
            bytes.forEach(chunk => size += chunk.length)
            chunks.push(...bytes)
        })

        const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`), `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`].join('')
        chunks.push(strToU8(xref))

        const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
        let at = 0

        for (const chunk of chunks) {
            result.set(chunk, at)
            at += chunk.length
        }

        return result
    }
}
