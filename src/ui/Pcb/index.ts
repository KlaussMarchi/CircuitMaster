import type { PcbRequest } from '../../workers/Pcb'
import { ROUTE_DEFAULTS, type RouteConfig } from '../../core/Router'
import { MIL_PER_INCH, toInches } from '../../core/Units'

export type Progress = { cycle: number, cycles: number, connected: number, requested: number }

// CLIENTE DO WORKER DE PCB: UMA REQUISIÇÃO POR VEZ COM PROGRESSO; CANCELAR ENCERRA O WORKER E DEVOLVE NULO
export class PcbTools {
    worker: Worker | null = null
    next = 0
    pending = new Map<number, (result: unknown) => void>()

    start() {
        if (!this.worker)
            this.worker = new Worker(new URL('../../workers/Pcb/index.ts', import.meta.url), { type: 'module' })

        return this.worker
    }

    stop() {
        this.worker?.terminate()
        this.worker = null
        this.pending.forEach(resolve => resolve(null))
        this.pending.clear()
    }

    request<T>(message: PcbRequest, progress: (progress: Progress) => void = () => {}) {
        const worker = this.start()
        const id     = this.next++

        return new Promise<T | null>(resolve => {
            const listen = ({ data }: MessageEvent) => {
                if (data.id !== id)
                    return

                if (data.progress)
                    return progress(data.progress)

                worker.removeEventListener('message', listen)
                this.pending.delete(id)
                resolve(data.result)
            }

            this.pending.set(id, resolve as (result: unknown) => void)
            worker.addEventListener('message', listen)
            worker.postMessage({ ...message, id })
        })
    }
}

export type PcbConfig = RouteConfig & { fillKeepout: number, holeSize: string }

const mils = (value: string | undefined, fallback: string) => (toInches(value || fallback) ?? toInches(fallback) ?? 0) * MIL_PER_INCH

// AJUSTES DO AUTOROUTER, DRC E PREENCHIMENTO GRAVADOS NOS ATRIBUTOS DA VISTA PCB DO .fz (SPEC 03 §8.1)
export const getConfig = (settings: Record<string, string> = {}): PcbConfig => {
    const hole = settings.autorouteViaHoleSize || '0.4mm'
    const ring = settings.autorouteViaRingThickness || '0.3mm'
    return { traceWidth: Number(settings.autorouteTraceWidth) || ROUTE_DEFAULTS.traceWidth, keepout: mils(settings.DRC_Keepout, '0.01in'), viaHole: mils(hole, '0.4mm'), viaRing: mils(ring, '0.3mm'), cycles: Number(settings.autorouteCycles) || ROUTE_DEFAULTS.cycles, fillKeepout: mils(settings.GPG_Keepout, '0.01in'), holeSize: `${hole},${ring}` }
}
