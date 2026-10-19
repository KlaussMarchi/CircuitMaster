import type { ClipperModule } from './clipper2'

export type Path  = number[]
export type Paths = Path[]

export const CLIP = { intersection: 1, union: 2, difference: 3, xor: 4 } as const
export const FILL = { evenOdd: 0, nonZero: 1, positive: 2, negative: 3 } as const
export const JOIN = { square: 0, bevel: 1, round: 2, miter: 3 } as const
export const END  = { polygon: 0, joined: 1, butt: 2, square: 3, round: 4 } as const

const PRECISION = 4       // CASAS DECIMAIS EM MIL: 0,1 µin, A RESOLUÇÃO DO GERBER 2.6 COM FOLGA
const MITER     = 2
const ARC       = 0.05    // MIL DE ERRO CORDAL NOS ARCOS DO OFFSET (SPEC 03 §2.3)
const DOUBLE    = 8

// OPERAÇÕES BOOLEANAS E OFFSET DO CLIPPER2 EM WASM; CAMINHOS SÃO LISTAS PLANAS [x0, y0, x1, y1, …] EM MIL (SPEC 03 §2, §6, §7)
export class Clipper {
    module: ClipperModule

    constructor(module: ClipperModule) {
        this.module = module
    }

    write(paths: Paths) {
        const valid   = paths.filter(path => path.length >= 4 && path.length % 2 === 0 && path.every(Number.isFinite))
        const size    = 2 + valid.reduce((sum, path) => sum + 2 + path.length, 0)
        const pointer = this.module._malloc(size * DOUBLE)
        const heap    = this.module.HEAPF64
        let at        = pointer / DOUBLE

        heap[at++] = size
        heap[at++] = valid.length
        valid.forEach(path => {
            heap[at++] = path.length / 2
            heap[at++] = 0
            heap.set(path, at)
            at += path.length
        })

        return pointer
    }

    read(pointer: number) {
        const heap  = this.module.HEAPF64
        const count = pointer ? heap[pointer / DOUBLE + 1] : 0
        const paths: Paths = []
        let at = pointer / DOUBLE + 2

        for (let i = 0; i < count; i++) {
            const length = 2 * heap[at]
            paths.push(Array.from(heap.subarray(at + 2, at + 2 + length)))
            at += 2 + length
        }

        return paths
    }

    dispose(pointer: number) {
        const slot = this.module._malloc(4)
        this.module.HEAP32[slot / 4] = pointer
        this.module._DisposeArrayD(slot)
        this.module._free(slot)
    }

    boolean(clip: number, subjects: Paths, clips: Paths, fill: number = FILL.nonZero) {
        const inputs = [this.write(subjects), this.write([]), this.write(clips)]
        const slots  = this.module._malloc(8)
        this.module._BooleanOpD(clip, fill, inputs[0], inputs[1], inputs[2], slots, slots + 4, PRECISION, 0, 0)

        const solution = this.module.HEAP32[slots / 4]
        const open     = this.module.HEAP32[slots / 4 + 1]
        const result   = this.read(solution)
        inputs.forEach(pointer => this.module._free(pointer))
        this.dispose(solution)
        this.dispose(open)
        this.module._free(slots)
        return result
    }

    union(paths: Paths, fill: number = FILL.nonZero) {
        return this.boolean(CLIP.union, paths, [], fill)
    }

    difference(subjects: Paths, clips: Paths) {
        return this.boolean(CLIP.difference, subjects, clips)
    }

    intersection(subjects: Paths, clips: Paths) {
        return this.boolean(CLIP.intersection, subjects, clips)
    }

    inflate(paths: Paths, delta: number, join: number = JOIN.round, end: number = END.polygon) {
        const input  = this.write(paths)
        const output = this.module._InflatePathsD(input, delta, join, end, PRECISION, MITER, ARC * 10 ** PRECISION, 0)
        const result = this.read(output)
        this.module._free(input)
        this.dispose(output)
        return result
    }
}

export const area = (path: Path) => {
    let sum = 0

    for (let i = 0; i < path.length; i += 2)
        sum += path[i] * path[(i + 3) % path.length] - path[(i + 2) % path.length] * path[i + 1]

    return sum / 2
}
