export type NgspiceModule = {
    addFunction: (fn: (...args: number[]) => number, signature: string) => number
    UTF8ToString: (pointer: number) => string
    stringToUTF8: (text: string, pointer: number, size: number) => void
    lengthBytesUTF8: (text: string) => number
    getValue: (pointer: number, type: string) => number
    setValue: (pointer: number, value: number, type: string) => void
    HEAPF64: Float64Array
    _malloc: (size: number) => number
    _free: (pointer: number) => void
    _ngSpice_Init: (...callbacks: number[]) => number
    _ngSpice_Circ: (lines: number) => number
    _ngSpice_Command: (command: number) => number
    _ngGet_Vec_Info: (name: number) => number
    _ngSpice_CurPlot: () => number
    _ngSpice_AllVecs: (plot: number) => number
}

declare const createNgspice: (options?: Record<string, unknown>) => Promise<NgspiceModule>
export default createNgspice
