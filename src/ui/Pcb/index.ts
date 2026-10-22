import type { PcbRequest } from '../../workers/Pcb'
import { ROUTE_DEFAULTS, type RouteConfig } from '../../core/Router'
import { MIL_PER_INCH, toInches } from '../../core/Units'
import { Supervisor } from '../Supervisor'

export type Progress = { cycle: number, cycles: number, connected: number, requested: number }

const PCB_IDLE = 60000    // MS SEM NOTÍCIA DO WORKER DE PCB; O AUTOROUTER AVISA A CADA CICLO, DRC E PREENCHIMENTO SÓ NO FIM

// WORKER DE PCB (DRC, PREENCHIMENTO, AUTOROUTER) VIGIADO; stop() CANCELA E O PEDIDO VOLTA NULO
export const createPcbTools = () => new Supervisor<PcbRequest>(() => new Worker(new URL('../../workers/Pcb/index.ts', import.meta.url), { type: 'module' }), PCB_IDLE)

export type PcbConfig = RouteConfig & { fillKeepout: number, holeSize: string }

const mils = (value: string | undefined, fallback: string) => (toInches(value || fallback) ?? toInches(fallback) ?? 0) * MIL_PER_INCH

// AJUSTES DO AUTOROUTER, DRC E PREENCHIMENTO GRAVADOS NOS ATRIBUTOS DA VISTA PCB DO .fz (SPEC 03 §8.1)
export const getConfig = (settings: Record<string, string> = {}): PcbConfig => {
    const hole = settings.autorouteViaHoleSize || '0.4mm'
    const ring = settings.autorouteViaRingThickness || '0.3mm'
    return { traceWidth: Number(settings.autorouteTraceWidth) || ROUTE_DEFAULTS.traceWidth, keepout: mils(settings.DRC_Keepout, '0.01in'), viaHole: mils(hole, '0.4mm'), viaRing: mils(ring, '0.3mm'), cycles: Number(settings.autorouteCycles) || ROUTE_DEFAULTS.cycles, fillKeepout: mils(settings.GPG_Keepout, '0.01in'), holeSize: `${hole},${ring}` }
}
