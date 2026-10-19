import type { NgspiceModule } from '../../workers/Simulator/ngspice/ngspice'

export type Vectors = Record<string, Float64Array>
export type Run     = { vectors: Vectors, log: string[], error: string | null }

const POINTER  = 4        // BYTES DE UM PONTEIRO NO WASM32
const REAL     = 12       // DESLOCAMENTO DE v_realdata EM vector_info
const LENGTH   = 20       // DESLOCAMENTO DE v_length EM vector_info
const FAILURES = /\berror\b|there aren't any circuits loaded|simulation interrupted/i

// SESSÃO DO NGSPICE EM WASM PELA API COMPARTILHADA: CARREGA O DECK, RODA DE FORMA SÍNCRONA E LÊ OS VETORES (SPEC 04 §6–§7)
export class Ngspice {
    module: NgspiceModule
    log: string[] = []

    constructor(module: NgspiceModule) {
        this.module = module
    }

    setup() {
        const ng   = this.module
        const text = ng.addFunction(pointer => {
            this.log.push(ng.UTF8ToString(pointer))
            return 0
        }, 'iiii')
        const quiet = ng.addFunction(() => 0, 'iiii')
        const exit  = ng.addFunction(status => {
            this.log.push(`stderr ngspice exit ${status}`)
            return 0
        }, 'iiiiii')
        const data  = ng.addFunction(() => 0, 'iiiii')
        ng._ngSpice_Init(text, quiet, exit, data, quiet, quiet, 0)
    }

    withString<T>(text: string, use: (pointer: number) => T) {
        const size    = this.module.lengthBytesUTF8(text) + 1
        const pointer = this.module._malloc(size)
        this.module.stringToUTF8(text, pointer, size)
        const result  = use(pointer)
        this.module._free(pointer)
        return result
    }

    command(text: string) {
        return this.withString(text, pointer => this.module._ngSpice_Command(pointer))
    }

    load(deck: string) {
        const ng       = this.module
        const lines    = deck.split('\n')
        const pointers = lines.map(line => {
            const size    = ng.lengthBytesUTF8(line) + 1
            const pointer = ng._malloc(size)
            ng.stringToUTF8(line, pointer, size)
            return pointer
        })
        const array    = ng._malloc(POINTER * (pointers.length + 1))

        pointers.forEach((pointer, i) => ng.setValue(array + POINTER * i, pointer, 'i32'))
        ng.setValue(array + POINTER * pointers.length, 0, 'i32')
        ng._ngSpice_Circ(array)
        pointers.forEach(pointer => ng._free(pointer))
        ng._free(array)
    }

    getNames() {
        const ng    = this.module
        const list  = ng._ngSpice_AllVecs(ng._ngSpice_CurPlot())
        const names = []

        for (let i = 0; list && ng.getValue(list + POINTER * i, 'i32'); i++)
            names.push(ng.UTF8ToString(ng.getValue(list + POINTER * i, 'i32')))

        return names
    }

    getVector(name: string) {
        const info = this.withString(name, pointer => this.module._ngGet_Vec_Info(pointer))
        const data = info ? this.module.getValue(info + REAL, 'i32') : 0

        if (!data)
            return null

        const length = this.module.getValue(info + LENGTH, 'i32')
        return this.module.HEAPF64.slice(data / 8, data / 8 + length)
    }

    run(deck: string): Run {
        this.command('remcirc')
        this.log = []
        this.load(deck)

        const loading = this.log.find(line => FAILURES.test(line))

        if (loading)
            return { vectors: {}, log: this.log, error: loading.replace(/^std(out|err) /, '') }

        this.command('run')
        const failed  = this.log.find(line => FAILURES.test(line))
        const vectors = Object.fromEntries(this.getNames().flatMap(name => {
            const vector = this.getVector(name)
            return vector ? [[name.toLowerCase(), vector]] : []
        }))

        return { vectors, log: this.log, error: failed ? failed.replace(/^std(out|err) /, '') : null }
    }
}
