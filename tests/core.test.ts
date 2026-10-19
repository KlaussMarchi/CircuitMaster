import { describe, expect, it } from 'vitest'
import { toInches } from '../src/core/Units'
import { apply, parseTransform } from '../src/core/Geometry'
import { SvgFile, flattenPath } from '../src/core/SvgFile'
import { loadWasm } from './Fixtures'

describe('unidades', () => {
    it('converte comprimentos para polegadas', () => {
        expect(toInches('2.54cm')).toBeCloseTo(1)
        expect(toInches('25.4mm')).toBeCloseTo(1)
        expect(toInches('0.5in')).toBe(0.5)
        expect(toInches('90px')).toBe(1)
        expect(toInches('72px', true)).toBe(1)
        expect(toInches('1000mil')).toBe(1)
        expect(toInches('72pt')).toBe(1)
        expect(toInches('180')).toBe(2)
        expect(toInches('')).toBeNull()
        expect(toInches('abc')).toBeNull()
    })
})

describe('geometria', () => {
    it('compõe transformações na ordem do SVG', () => {
        const m = parseTransform('translate(10,0) rotate(90)')
        const [x, y] = apply(m, 1, 0)
        expect(x).toBeCloseTo(10)
        expect(y).toBeCloseTo(1)
    })

    it('achata curvas e arcos de path', () => {
        const [arc] = flattenPath('M0,0 A10,10 0 0 1 20,0')
        expect(Math.min(...arc.points.map(([, y]) => y))).toBeCloseTo(-10, 1)
        const [curve] = flattenPath('M0,0 C0,10 10,10 10,0')
        expect(Math.max(...curve.points.map(([, y]) => y))).toBeCloseTo(7.5, 1)
    })
})

describe('caixa de elemento SVG', () => {
    const svg = new SvgFile('<svg xmlns="http://www.w3.org/2000/svg" width="1in" height="1in" viewBox="0 0 100 100"><g transform="translate(10,0)"><line id="round" x1="0" y1="50" x2="20" y2="50" stroke="#000" stroke-width="4" stroke-linecap="round"/><line id="butt" x1="0" y1="60" x2="20" y2="60" stroke="#000" stroke-width="4"/><rect id="plain" x="0" y="0" width="10" height="10"/><circle id="ring" cx="50" cy="50" r="10" stroke="#000" stroke-width="4" fill="none"/></g></svg>')
    svg.update()

    const boxOf = (id: string) => svg.getBox(id)?.map(value => Number(value.toFixed(6)))

    it('inclui o traço conforme a terminação', () => {
        expect(boxOf('round')).toEqual([7.2, 43.2, 28.8, 46.8])
        expect(boxOf('butt')).toEqual([9, 52.2, 27, 55.8])
        expect(boxOf('plain')).toEqual([9, 0, 18, 9])
        expect(boxOf('ring')).toEqual([43.2, 34.2, 64.8, 55.8])
    })
})

describe('núcleo wasm do netlist', () => {
    it('rotula componentes conexas pelo menor índice', async () => {
        const wasm = await loadWasm()
        expect(Array.from(wasm.components(6, Uint32Array.from([0, 3, 3, 5, 1, 4])))).toEqual([0, 1, 2, 0, 1, 0])
    })

    it('gera a árvore mínima sem arestas dentro da mesma classe', async () => {
        const wasm   = await loadWasm()
        const points = Float64Array.from([0, 0, 10, 0, 10, 1, 30, 0])
        const pairs  = Array.from(wasm.spanningTree(points, Uint32Array.from([0, 1, 1, 2])))
        expect(pairs).toEqual([1, 0, 3, 1])
    })
})
