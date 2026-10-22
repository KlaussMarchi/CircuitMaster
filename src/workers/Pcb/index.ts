import createClipper from '../../core/Clipper/clipper2.js'
import { Clipper } from '../../core/Clipper'
import type { Artwork, Conductor, Face } from '../../core/Cam'
import type { Matrix, Point } from '../../core/Geometry'
import { checkRules } from '../../core/Drc'
import { getFill, type FillMode } from '../../core/Fill'
import { buildGrid, getPlan, loadRouterWasm, routeGrid, type Grid, type RouteConfig } from '../../core/Router'
import routerUrl from '../../core/Router/router.wasm?url'
import { serve } from '../Serve'

export type PcbRequest =
    { type: 'drc', artwork: Artwork, groups: string[], keepout: number } |
    { type: 'fill', artwork: Artwork, grounded: boolean[], faces: Face[], mode: FillMode, keepout: number } |
    { type: 'route', artwork: Artwork, keys: Record<string, [number, number]>, terminals: Record<string, Point>, config: RouteConfig } |
    { type: 'sheet', grid: Grid, frame: Matrix, terminals: Record<string, Point>, cycles: number }

const tools = Promise.all([createClipper().then(module => new Clipper(module)), fetch(routerUrl).then(response => response.arrayBuffer()).then(loadRouterWasm)])

tools.catch(() => {})    // A FALHA AO CARREGAR CHEGA A CADA PEDIDO PELO await, NÃO COMO REJEIÇÃO SEM DONO

// VALOR POR CONDUTOR: OS OBJETOS CHEGAM CLONADOS, ENTÃO A CHAVE É A POSIÇÃO NA LISTA
const byIndex = <T,>(artwork: Artwork, values: T[]) => {
    const position = new Map(artwork.conductors.map((conductor, i) => [conductor, i]))
    return (conductor: Conductor) => values[position.get(conductor) ?? -1]
}

// DRC, PREENCHIMENTO E AUTOROUTER FORA DA THREAD DA INTERFACE; O ROTEADOR AVISA O PROGRESSO A CADA CICLO (SPEC 03 §6–§8)
serve<PcbRequest>(async (request, progress) => {
    const [clipper, router] = await tools

    if (request.type === 'drc')
        return checkRules(clipper, request.artwork, byIndex(request.artwork, request.groups), request.keepout)

    if (request.type === 'fill')
        return request.faces.flatMap(face => getFill(clipper, request.artwork, face, request.mode, byIndex(request.artwork, request.grounded), request.keepout))

    const sheet  = request.type === 'sheet'
    const grid   = sheet ? request.grid : buildGrid(clipper, request.artwork, key => request.keys[key]?.[0] ?? null, key => request.keys[key]?.[1] ?? null, request.config)
    const cycles = sheet ? request.cycles : request.config.cycles
    const frame  = sheet ? request.frame : request.artwork.board.frame
    const layers = sheet ? ['schematicTrace', 'schematicTrace'] as [string, string] : undefined
    const pass   = routeGrid(router, grid, cycles, (cycle, best) => progress({ cycle: cycle + 1, cycles, connected: best.connected, requested: best.requested }))
    return { plan: getPlan(grid, pass, frame, key => request.terminals[key] ?? null, layers), connected: pass.connected, requested: pass.requested, vias: pass.vias }
})
