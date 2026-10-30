import { distance, lerp, nearestOnSegment, type Box, type Point } from '../../core/Geometry'
import { keyOf, WIRE_FLAGS, type Doc } from '../../core/Document'
import type { Library } from '../../core/Library'
import { milsToPx } from '../../core/Units'
import { Scene, WIRE_STYLE } from '../Scene'
import { getChain, reshapeWire } from '../Edit'

// EMPURRAR TRILHAS (SPEC 03 §7.5) NUM MÓDULO PRÓPRIO: SÓ CARREGA QUANDO O MODO EMPURRAR É LIGADO, FORA DO JAVASCRIPT INICIAL

type Trace = { index: string, layer: string, a: Point, b: Point, width: number }

const pointGap = (p: Point, a: Point, b: Point) => distance(p, lerp(a, b, nearestOnSegment(a, b, p)))
const turn     = (a: Point, b: Point, c: Point) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
const crosses  = (a: Point, b: Point, c: Point, d: Point) => turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0
const segGap   = (a: Point, b: Point, c: Point, d: Point) => crosses(a, b, c, d) ? 0 : Math.min(pointGap(a, c, d), pointGap(b, c, d), pointGap(c, a, b), pointGap(d, a, b))
const boxGap   = ([x0, y0, x1, y1]: Box, a: Point, b: Point) => {
    const inside  = (p: Point) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1
    const corners: Point[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
    return inside(a) || inside(b) ? 0 : Math.min(...corners.map((corner, i) => segGap(a, b, corner, corners[(i + 1) % 4])))
}

// DESVIO DE UM TRECHO AB EM VOLTA DOS AGRESSORES QUE FICAM A MENOS DA FOLGA: TRECHO PARALELO AFASTADO PARA O OUTRO LADO, ENTRADA E SAÍDA A 45°, PONTAS NO LUGAR;
// NULO SE NINGUÉM ESTÁ PERTO, 'blocked' SE UM AGRESSOR CRUZA O TRECHO OU HÁ AGRESSORES DOS DOIS LADOS
const bumpOf = (victim: Trace, aggressors: Trace[], gap: number): Point[] | null | 'blocked' => {
    const { a, b } = victim
    const length   = distance(a, b)
    const u: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length]
    const n: Point = [-u[1], u[0]]
    const along    = (p: Point) => (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1]
    const across   = (p: Point) => (p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1]
    let [t0, t1, push, side] = [Infinity, -Infinity, 0, 0]

    if (length < 1e-6)
        return null

    for (const other of aggressors) {
        const reach        = (victim.width + other.width) / 2 + gap

        if (segGap(a, b, other.a, other.b) >= reach - 1e-6)
            continue

        const [hc, hd] = [across(other.a), across(other.b)]

        if (Math.sign(hc) !== Math.sign(hd) || hc === 0 || (side && Math.sign(hc) !== side))
            return 'blocked'

        side = Math.sign(hc)
        t0   = Math.min(t0, Math.min(along(other.a), along(other.b)) - reach)
        t1   = Math.max(t1, Math.max(along(other.a), along(other.b)) + reach)
        push = Math.max(push, reach - Math.min(Math.abs(hc), Math.abs(hd)))
    }

    if (!side)
        return null

    const at     = (t: number, offset: number): Point => [a[0] + u[0] * t - side * n[0] * offset, a[1] + u[1] * t - side * n[1] * offset]
    const [s, e] = [Math.max(0, t0), Math.min(length, t1)]
    return [a, at(Math.max(0, s - push), 0), at(s, push), at(e, push), at(Math.min(length, e + push), 0), b]
}

// EMPURRAR (PUSH-AND-SHOVE DO KICAD E DO ALTIUM): CADA TRILHA DE OUTRA NET NA MESMA FACE QUE FICA A MENOS DA FOLGA DOS TRECHOS MOVIDOS GANHA UM DESVIO EM VOLTA DELES;
// O DESVIO QUE CHEGARIA A MENOS DA FOLGA DE UM PAD OU DE OUTRA TRILHA DE OUTRA NET NÃO É FEITO (A TRILHA FICA E O DRC ACUSA). netOf DÁ A NET LÓGICA DE UM CONECTOR
// ponytail: UMA PASSADA (A TRILHA EMPURRADA NÃO EMPURRA AS VIZINHAS), SÓ TRECHOS RETOS, SEM VIAS COMO AGRESSORAS. MELHORIA: REPETIR COM OS DESVIOS COMO NOVOS AGRESSORES
export const shoveTraces = (doc: Doc, library: Library, movers: string[], clearance: number, netOf: (key: string) => number | undefined) => {
    const scene   = new Scene(doc, library, 'pcbView')
    const gap     = milsToPx(clearance)
    const traces  = Object.values(doc.instances).flatMap((instance): Trace[] => {
        const state = instance.views.pcbView
        const ends  = scene.isWire(instance.modelIndex) && state && state.geometry.wireFlags & WIRE_FLAGS.pcbView && !state.wire?.bezier ? scene.getWireEnds(instance.modelIndex) : null
        return ends && state ? [{ index: instance.modelIndex, layer: state.layer, a: ends[0], b: ends[1], width: milsToPx(state.wire?.mils ?? WIRE_STYLE.pcbView.mils) }] : []
    })
    const nets    = new Map<string, number | undefined>()
    const netOfWire = (index: string) => {
        if (!nets.has(index)) {
            const chain = getChain(scene, index)
            const keys  = chain.flatMap(wire => ['connector0', 'connector1'].flatMap(end => [keyOf(wire, end), ...scene.getPartners(keyOf(wire, end))]))
            const net   = keys.map(netOf).find(value => value !== undefined)
            chain.forEach(wire => nets.set(wire, net))
        }

        return nets.get(index)
    }
    const apart   = (x: number | undefined, y: number | undefined) => x === undefined || y === undefined || x !== y
    const moving  = new Set(movers.flatMap(index => getChain(scene, index)))
    const pads    = Object.values(doc.instances).filter(instance => !scene.isWire(instance.modelIndex) && scene.isShown(instance)).flatMap(instance => scene.getKeys(instance.modelIndex).flatMap(key => {
        const box = scene.getConnectorBox(key)
        return box ? [{ box, net: netOf(key) }] : []
    }))
    let [current, shoved, blocked] = [doc, 0, 0]

    for (const victim of traces.filter(trace => !moving.has(trace.index) && !scene.getView(trace.index)?.locked)) {
        const net  = netOfWire(victim.index)
        const near = traces.filter(trace => movers.includes(trace.index) && trace.layer === victim.layer && apart(netOfWire(trace.index), net))
        const path = near.length ? bumpOf(victim, near, gap) : null

        if (!path)
            continue

        const others = traces.filter(trace => trace.index !== victim.index && trace.layer === victim.layer && apart(netOfWire(trace.index), net))
        const clear  = path !== 'blocked' && path.slice(1).every((point, i) => others.every(trace => segGap(path[i], point, trace.a, trace.b) >= (victim.width + trace.width) / 2 + gap - 0.01) && pads.every(pad => !apart(pad.net, net) || boxGap(pad.box, path[i], point) >= victim.width / 2 + gap - 0.01))

        if (clear) {
            current = reshapeWire(current, 'pcbView', victim.index, path)
            shoved += 1
        } else {
            blocked += 1
        }
    }

    return { doc: current, shoved, blocked }
}
