import { describe, expect, it } from 'vitest'
import createClipper from '../src/core/Clipper/clipper2.js'
import { Clipper, END, JOIN, area } from '../src/core/Clipper'

const square = (x: number, y: number, side: number) => [x, y, x + side, y, x + side, y + side, x, y + side]

describe('Clipper2 em WASM', () => {
    it('união, diferença, interseção e offset dão as áreas esperadas', async () => {
        const clipper = new Clipper(await createClipper())
        const total   = (paths: number[][]) => paths.reduce((sum, path) => sum + area(path), 0)

        expect(Math.abs(total(clipper.union([square(0, 0, 10), square(5, 0, 10)])))).toBeCloseTo(150, 6)
        expect(Math.abs(total(clipper.difference([square(0, 0, 10)], [square(5, 0, 10)])))).toBeCloseTo(50, 6)
        expect(Math.abs(total(clipper.intersection([square(0, 0, 10)], [square(5, 5, 10)])))).toBeCloseTo(25, 6)
        expect(Math.abs(total(clipper.inflate([square(0, 0, 10)], 1, JOIN.miter)))).toBeCloseTo(144, 4)
        expect(Math.abs(Math.abs(total(clipper.inflate([[0, 0, 10, 0]], 1, JOIN.round, END.round))) - (20 + Math.PI))).toBeLessThan(0.25)
        expect(clipper.intersection([square(0, 0, 1)], [square(5, 5, 1)])).toEqual([])
    })
})
