import type { PcbRequest } from '../../workers/Pcb'
import { ROUTE_DEFAULTS, type RouteConfig } from '../../core/Router'
import { MIL_PER_INCH, toInches } from '../../core/Units'
import { Supervisor } from '../Supervisor'
import type { NetClass, Rules } from '../../core/Drc'

export type Progress = { cycle: number, cycles: number, connected: number, requested: number }

const PCB_IDLE = 60000    // MS SEM NOTÍCIA DO WORKER DE PCB; O AUTOROUTER AVISA A CADA CICLO, DRC E PREENCHIMENTO SÓ NO FIM

// WORKER DE PCB (DRC, PREENCHIMENTO, AUTOROUTER) VIGIADO; stop() CANCELA E O PEDIDO VOLTA NULO
export const createPcbTools = () => new Supervisor<PcbRequest>(() => new Worker(new URL('../../workers/Pcb/index.ts', import.meta.url), { type: 'module' }), PCB_IDLE)

export type PcbConfig = RouteConfig & { fillKeepout: number, holeSize: string, drc: Rules }

const mils = (value: string | undefined, fallback: string) => (toInches(value || fallback) ?? toInches(fallback) ?? 0) * MIL_PER_INCH

// CLASSES DE NET GRAVADAS COMO JSON NO ATRIBUTO DRC_NetClasses (VEM DO ARQUIVO: SÓ ENTRA O QUE TEM A FORMA CERTA)
export const getNetClasses = (text: string | undefined): NetClass[] => {
    try {
        const list: unknown = JSON.parse(text || '[]')
        return Array.isArray(list) ? list.filter(item => item && typeof item.name === 'string' && Array.isArray(item.nets)).map(item => ({ name: item.name, nets: item.nets.filter((net: unknown) => typeof net === 'string'), width: Math.max(0, Number(item.width) || 0), clearance: Math.max(0, Number(item.clearance) || 0) })) : []
    } catch {
        return []
    }
}

// MÍNIMOS DO DRC POR PADRÃO: OS DE FABRICANTES COMUNS DE PROTÓTIPO (TRILHA 0,127 mm, ANEL 0,13 mm, FURO 0,3 mm)
export const DRC_DEFAULTS = { DRC_MinTrace: '0.127mm', DRC_MinRing: '0.13mm', DRC_MinDrill: '0.3mm' }

// AJUSTES DO AUTOROUTER, DRC E PREENCHIMENTO GRAVADOS NOS ATRIBUTOS DA VISTA PCB DO .fz (SPEC 03 §8.1)
export const getConfig = (settings: Record<string, string> = {}): PcbConfig => {
    const hole = settings.autorouteViaHoleSize || '0.4mm'
    const ring = settings.autorouteViaRingThickness || '0.3mm'
    const keepout = mils(settings.DRC_Keepout, '0.01in')
    const drc     = { keepout, minWidth: mils(settings.DRC_MinTrace, DRC_DEFAULTS.DRC_MinTrace), minRing: mils(settings.DRC_MinRing, DRC_DEFAULTS.DRC_MinRing), minDrill: mils(settings.DRC_MinDrill, DRC_DEFAULTS.DRC_MinDrill), classes: getNetClasses(settings.DRC_NetClasses) }
    return { traceWidth: Number(settings.autorouteTraceWidth) || ROUTE_DEFAULTS.traceWidth, keepout, viaHole: mils(hole, '0.4mm'), viaRing: mils(ring, '0.3mm'), cycles: Number(settings.autorouteCycles) || ROUTE_DEFAULTS.cycles, fillKeepout: mils(settings.GPG_Keepout, '0.01in'), holeSize: `${hole},${ring}`, drc }
}
