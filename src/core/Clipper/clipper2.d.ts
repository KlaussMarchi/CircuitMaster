export type ClipperModule = {
    HEAPF64: Float64Array
    HEAP32: Int32Array
    _malloc: (size: number) => number
    _free: (pointer: number) => void
    _BooleanOpD: (clip: number, fill: number, subjects: number, open: number, clips: number, solution: number, solutionOpen: number, precision: number, collinear: number, reverse: number) => number
    _InflatePathsD: (paths: number, delta: number, join: number, end: number, precision: number, miter: number, arc: number, reverse: number) => number
    _DisposeArrayD: (slot: number) => void
}

declare const createClipper: (options?: Record<string, unknown>) => Promise<ClipperModule>
export default createClipper
