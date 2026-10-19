import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FONT_FILES, Font, getTextRuns, pickFont } from '../src/core/Font'
import { SvgFile } from '../src/core/SvgFile'
import { parseXml, walk, type XmlElement } from '../src/core/Xml'
import { ROOTS } from '../tools/Fritzing'
import { HAS_FRITZING } from './Fixtures'

const loadFonts = () => new Map(Object.entries(FONT_FILES).map(([key, file]) => {
    const font = new Font(new Uint8Array(fs.readFileSync(path.join(ROOTS.fonts, file))))
    font.update()
    return [key, font]
}))

describe.skipIf(!HAS_FRITZING)('fontes TrueType do Fritzing', () => {
    it('lê cmap, avanços e contornos de todas as fontes', () => {
        const fonts = loadFonts()
        const lines = [...fonts].map(([key, font], i) => `<path d="${font.getPath('AREF 13 ~A0 gnd μΩ', 10, 40 + 40 * i, 30)}" fill="#000"/><text x="420" y="${40 + 40 * i}" font-size="14">${key}</text>`)

        for (const [key, font] of fonts) {
            expect(font.cmap.size, key).toBeGreaterThan(90)
            expect(font.getContours(font.getGlyph('A')).length, key).toBeGreaterThan(0)
            expect(font.getPath('8', 0, 0, 10), key).toMatch(/^M[-\d.]+ [-\d.]+.*Z$/)
        }

        expect(fonts.get('ocra')?.getWidth('ABCD', 10)).toBeCloseTo(4 * (fonts.get('ocra')?.getWidth('A', 10) ?? 0), 6)
        expect(fonts.get('droidsans')?.getWidth('W', 2048)).toBe(1810)
        fs.writeFileSync(new URL('../build/fonts.svg', import.meta.url), `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="${50 + 40 * fonts.size}">${lines.join('')}</svg>`)
    })

    it('resolve família, tamanho, âncora e tspans do SVG', () => {
        const fonts = loadFonts()
        const svg   = new SvgFile('<svg xmlns="http://www.w3.org/2000/svg" width="1in" height="1in" viewBox="0 0 100 100"><style>.big{font-size:20px}</style><text id="a" x="50" y="50" font-family="\'Droid Sans\'" text-anchor="middle" class="big">AB</text><text id="b" x="0" y="10" font-family="OCRA" font-size="10"><tspan x="0" y="10">L1</tspan><tspan x="0" y="22">L2</tspan></text></svg>')
        svg.update()

        const texts: XmlElement[] = []
        walk(svg.root as XmlElement, element => element.tagName === 'text' && texts.push(element))
        const [middle, lines] = texts.map(text => getTextRuns(svg, text, fonts))
        const width = fonts.get('droidsans')?.getWidth('AB', 20) ?? 0
        const first = Number(middle[0].d.slice(1).split(' ')[0])

        expect(pickFont(fonts, "'Droid Sans'", null)).toBe(fonts.get('droidsans'))
        expect(pickFont(fonts, 'OCR A Std', null)).toBe(fonts.get('ocra'))
        expect(pickFont(fonts, 'Times New Roman', 'bold')).toBe(fonts.get('droidsansbold'))
        expect(first).toBeGreaterThanOrEqual(50 - width / 2 - 1)
        expect(first).toBeLessThan(50)
        expect(lines.length).toBe(2)
        expect(parseXml(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${lines[1].d}"/></svg>`)).toBeTruthy()
    })
})
