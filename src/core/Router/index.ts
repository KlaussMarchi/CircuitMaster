import { apply, invert, type Point } from '../Geometry'
import type { Clipper, Paths } from '../Clipper'
import { shapeBox, solidOf, toPolygons, type Artwork, type Face } from '../Cam'
import { MIL_PER_INCH } from '../Units'

type Exports = {
    memory: WebAssembly.Memory
    alloc: (bytes: number) => number
    release: (pointer: number, bytes: number) => void
    route: (width: number, height: number, layers: number, owner: number, pads: number, nets: number, length: number, params: number, size: number) => number
}

export type RouterWasm  = { route: (width: number, height: number, layers: number, owner: Int32Array, pads: Int32Array, nets: Int32Array, params: Float64Array) => Int32Array }
export type RouteConfig = { traceWidth: number, keepout: number, viaHole: number, viaRing: number, cycles: number }
export type Grid        = { width: number, height: number, layers: number, step: number, owner: Int32Array, pads: Int32Array, nets: Map<number, [number, number[]][]>, keys: Map<number, string>, order: number[], params: Float64Array }
export type Pass        = { connected: number, requested: number, vias: number, failed: number[], paths: { net: number, cells: number[] }[] }
export type End         = { wire: number, end: 0 | 1 } | { via: number } | { key: string }
export type Plan        = { wires: { layer: string, a: Point, b: Point, mils?: number }[], vias: Point[], holes?: string[], links: [End, End][] }

const FREE       = -1
const BLOCKED    = -2
const VIA_COST   = 2000    // CUSTO DE UMA TROCA DE CAMADA (SPEC 03 §8.2)
const AVOID_COST = 7       // CUSTO DE PASSAR NA VIZINHANÇA DE OUTRA NET
const TOP        = 'copper1trace'
const BOTTOM     = 'copper0trace'

export const ROUTE_DEFAULTS: RouteConfig = { traceWidth: 24, keepout: 10, viaHole: 0.4 / 25.4 * MIL_PER_INCH, viaRing: 0.3 / 25.4 * MIL_PER_INCH, cycles: 20 }

export const loadRouterWasm = async (bytes: BufferSource): Promise<RouterWasm> => {
    const { instance } = await WebAssembly.instantiate(bytes)
    const wasm         = instance.exports as unknown as Exports

    const write = <T extends Int32Array | Float64Array>(data: T) => {
        const pointer = wasm.alloc(Math.max(8, data.byteLength))
        new (data.constructor as new (buffer: ArrayBuffer, offset: number, length: number) => T)(wasm.memory.buffer, pointer, data.length).set(data)
        return pointer
    }

    const route = (width: number, height: number, layers: number, owner: Int32Array, pads: Int32Array, nets: Int32Array, params: Float64Array) => {
        const inputs = [owner, pads, nets, params].map(write)
        const size   = wasm.alloc(8)
        const output = wasm.route(width, height, layers, inputs[0], inputs[1], inputs[2], nets.length, inputs[3], size)
        const length = new Uint32Array(wasm.memory.buffer, size, 1)[0]
        const result = new Int32Array(wasm.memory.buffer, output, length).slice()
        ;[owner, pads, nets, params].forEach((data, i) => wasm.release(inputs[i], Math.max(8, data.byteLength)))
        wasm.release(output, length * 4)
        wasm.release(size, 8)
        return result
    }

    return { route }
}

// CÉLULAS CUJO CENTRO ESTÁ DENTRO DOS POLÍGONOS (REGRA NÃO ZERO), LINHA A LINHA PELOS CRUZAMENTOS DAS ARESTAS
export const rasterize = (paths: Paths, width: number, height: number, step: number, visit: (x: number, y: number) => void) => {
    const box = paths.flat().reduce((found, value, i) => i % 2 ? [found[0], Math.min(found[1], value), found[2], Math.max(found[3], value)] : [Math.min(found[0], value), found[1], Math.max(found[2], value), found[3]], [Infinity, Infinity, -Infinity, -Infinity])
    const y0  = Math.max(0, Math.floor(box[1] / step - 0.5))
    const y1  = Math.min(height - 1, Math.ceil(box[3] / step - 0.5))

    for (let y = y0; y <= y1; y++) {
        const cy      = (y + 0.5) * step
        const crosses: [number, number][] = []

        for (const path of paths) {
            for (let i = 0, j = path.length - 2; i < path.length; j = i, i += 2) {
                const [ax, ay, bx, by] = [path[j], path[j + 1], path[i], path[i + 1]]

                if ((ay <= cy) !== (by <= cy))
                    crosses.push([ax + (cy - ay) * (bx - ax) / (by - ay), by > ay ? 1 : -1])
            }
        }

        crosses.sort((a, b) => a[0] - b[0])
        let winding = 0

        crosses.forEach(([x, direction], i) => {
            winding += direction

            if (winding === 0 || i + 1 >= crosses.length)
                return

            for (let cx = Math.max(0, Math.ceil(x / step - 0.5)); cx < width && (cx + 0.5) * step < crosses[i + 1][0]; cx++)
                visit(cx, y)
        })
    }
}

// GRADE DO ROTEADOR: DONO DE CADA CÉLULA (A SUBNET) PELA ZONA k + w/2 DO COBRE, PADS POR SUBNET, SUBNETS A LIGAR POR NET E ORDEM DAS NETS (SPEC 03 §8.4)
export const buildGrid = (clipper: Clipper, artwork: Artwork, netOf: (key: string) => number | null, subnetOf: (key: string) => number | null, config: RouteConfig): Grid => {
    const { board } = artwork
    const step      = Math.max(config.traceWidth, config.keepout) / 2
    const width     = Math.ceil(board.width / step)
    const height    = Math.ceil(board.height / step)
    const layers    = board.layers > 1 ? 2 : 1
    const plane     = width * height
    const layerOf   = (face: Face) => face === 'top' || layers === 1 ? 0 : 1
    const owner     = new Int32Array(plane * layers).fill(BLOCKED)
    const pads      = new Int32Array(plane * layers).fill(FREE)
    const zone      = config.keepout + config.traceWidth / 2
    const reach     = Math.hypot(zone, step / Math.SQRT2)    // ZONA VISTA DOS CENTROS: O TRECHO (ATÉ g·√2, NA DIAGONAL) ENTRE DOIS CENTROS NÃO CHEGA MAIS PERTO QUE zone
    const subnets   = new Map<number, Map<number, Set<number>>>()
    const keys      = new Map<number, string>()
    const centers   = new Map<number, Point[]>()

    for (let layer = 0; layer < layers; layer++)
        rasterize(clipper.inflate(board.outline, -reach), width, height, step, (x, y) => owner[layer * plane + y * width + x] = FREE)

    const usable = artwork.conductors.filter(conductor => conductor.kind !== 'blocker' && (layers === 2 || conductor.face === 'bottom'))

    usable.forEach(conductor => {
        const net   = conductor.key && conductor.kind !== 'copper' ? subnetOf(conductor.key) ?? BLOCKED : BLOCKED
        const layer = layerOf(conductor.face)
        rasterize(clipper.inflate(toPolygons(clipper, conductor.shape), reach), width, height, step, (x, y) => {
            const index = layer * plane + y * width + x
            owner[index] = owner[index] === FREE || owner[index] === net ? net : BLOCKED
        })
    })

    usable.filter(conductor => conductor.kind === 'pad' && conductor.key).forEach(conductor => {
        const key    = conductor.key as string
        const net    = netOf(key)
        const subnet = subnetOf(key)
        const layer  = layerOf(conductor.face)
        const cells  = new Set<number>()

        if (net === null || subnet === null)
            return

        rasterize(toPolygons(clipper, solidOf(conductor.shape)), width, height, step, (x, y) => void cells.add(layer * plane + y * width + x))

        // SÓ AS CÉLULAS DO PAD FORA DA ZONA DE OUTRA NET: A TRILHA MAIS LARGA QUE O PAD NÃO INVADE A FOLGA DO VIZINHO; SEM NENHUMA, FICA O PAD TODO (O DRC APONTA)
        const clear = [...cells].filter(index => owner[index] === subnet)

        if (clear.length && clear.length < cells.size) {
            cells.clear()
            clear.forEach(index => cells.add(index))
        }

        if (!cells.size) {
            const box = shapeBox(conductor.shape)
            cells.add(layer * plane + Math.min(height - 1, Math.max(0, Math.floor((box[1] + box[3]) / 2 / step))) * width + Math.min(width - 1, Math.max(0, Math.floor((box[0] + box[2]) / 2 / step))))
        }

        const groups = subnets.get(net) ?? new Map<number, Set<number>>()
        const box    = shapeBox(conductor.shape)
        groups.set(subnet, new Set([...groups.get(subnet) ?? [], ...cells]))
        subnets.set(net, groups)
        centers.set(net, [...centers.get(net) ?? [], [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]])
        cells.forEach(index => {
            pads[index] = subnet
            keys.set(index, key)
        })
    })

    const nets    = new Map([...subnets].filter(([, groups]) => groups.size > 1).map(([net, groups]) => [net, [...groups].map(([subnet, cells]): [number, number[]] => [subnet, [...cells]])]))
    const crowd   = (net: number) => {
        const [x0, y0, x1, y1] = (centers.get(net) ?? []).reduce((box, [x, y]) => [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)], [Infinity, Infinity, -Infinity, -Infinity])
        return [...centers].filter(([other]) => other !== net).reduce((sum, [, points]) => sum + points.filter(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1).length, 0)
    }
    const order   = [...nets.keys()].sort((a, b) => crowd(a) - crowd(b))
    const radius  = config.viaHole / 2 + config.viaRing
    const fit     = (radius + config.keepout - reach + step * Math.SQRT2) / step    // TODA CÉLULA NESTE DISCO ACESSÍVEL GARANTE COBRE A radius + k DO CENTRO DA VIA
    const params  = Float64Array.from([VIA_COST, AVOID_COST, Math.hypot(config.traceWidth + config.keepout, step / Math.SQRT2) / step, Math.max(0, fit), Math.hypot(radius + zone, step / Math.SQRT2) / step, layers === 2 ? 1 : 0, 0, 1])
    return { width, height, layers, step, owner, pads, nets, keys, order, params }
}

export type Sheet = { boxes: number[][], pins: [string, Point][], wires: [string, Point[]][], headings: [string, Point][] }

const SHEET_MARGIN = 3       // CÉLULAS LIVRES EM VOLTA DO DESENHO DO ESQUEMÁTICO
const EPSILON      = 1e-6    // CÉLULA QUE SÓ ENCOSTA NA CAIXA DA PEÇA NÃO É BLOQUEADA

// GRADE DO ESQUEMÁTICO NA PRÓPRIA GRADE DA VISTA: TODA CÉLULA QUE TOCA O CORPO DE UMA PEÇA É BLOQUEADA, PONTA DE CADA PINO COMO PAD DA SUBNET COM UM CANAL DA SUBNET ATÉ SAIR DA CAIXA NA DIREÇÃO DO PINO, FIOS EXISTENTES DA SUBNET; UMA CAMADA, SEM VIAS (SPEC 03 §8.2)
export const buildSheetGrid = (sheet: Sheet, netOf: (key: string) => number | null, subnetOf: (key: string) => number | null, step: number) => {
    const points  = [...sheet.boxes.flatMap(box => [[box[0], box[1]], [box[2], box[3]]]), ...sheet.pins.map(([, point]) => point), ...sheet.wires.flatMap(([, line]) => line)]
    const x0      = (Math.floor(Math.min(...points.map(point => point[0])) / step) - SHEET_MARGIN) * step
    const y0      = (Math.floor(Math.min(...points.map(point => point[1])) / step) - SHEET_MARGIN) * step
    const width   = Math.ceil((Math.max(...points.map(point => point[0])) - x0) / step) + SHEET_MARGIN + 1
    const height  = Math.ceil((Math.max(...points.map(point => point[1])) - y0) / step) + SHEET_MARGIN + 1
    const frame: Artwork['board']['frame'] = [1, 0, 0, 1, step / 2 - x0, step / 2 - y0]
    const cellOf  = ([x, y]: Point) => Math.min(height - 1, Math.max(0, Math.round((y - y0) / step))) * width + Math.min(width - 1, Math.max(0, Math.round((x - x0) / step)))
    const owner   = new Int32Array(width * height).fill(FREE)
    const pads    = new Int32Array(width * height).fill(FREE)
    const keys    = new Map<number, string>()
    const subnets = new Map<number, Map<number, number[]>>()
    const centers = new Map<number, Point[]>()

    sheet.boxes.forEach(([bx0, by0, bx1, by1]) => {
        for (let y = Math.max(0, Math.ceil((by0 - y0) / step - 0.5 + EPSILON)); y <= Math.min(height - 1, Math.floor((by1 - y0) / step + 0.5 - EPSILON)); y++) {
            for (let x = Math.max(0, Math.ceil((bx0 - x0) / step - 0.5 + EPSILON)); x <= Math.min(width - 1, Math.floor((bx1 - x0) / step + 0.5 - EPSILON)); x++)
                owner[y * width + x] = BLOCKED
        }
    })

    sheet.wires.forEach(([key, line]) => line.slice(1).forEach((end, i) => {
        const [a, b] = [line[i], end]
        const count  = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (step / 2)))
        const net    = subnetOf(key) ?? BLOCKED

        for (let k = 0; k <= count; k++) {
            const cell = cellOf([a[0] + (b[0] - a[0]) * k / count, a[1] + (b[1] - a[1]) * k / count])
            owner[cell] = owner[cell] === FREE || owner[cell] === net ? net : BLOCKED
        }
    }))

    const headings = new Map(sheet.headings)

    sheet.pins.forEach(([key, point]) => {
        const [net, subnet] = [netOf(key), subnetOf(key)]
        const cell          = cellOf(point)
        const heading       = headings.get(key)

        if (net === null || subnet === null)
            return

        for (let [x, y] = [cell % width + (heading?.[0] ?? 0), Math.floor(cell / width) + (heading?.[1] ?? 0)]; heading && x >= 0 && y >= 0 && x < width && y < height && owner[y * width + x] === BLOCKED; x += heading[0], y += heading[1])
            owner[y * width + x] = subnet

        const groups = subnets.get(net) ?? new Map<number, number[]>()
        groups.set(subnet, [...groups.get(subnet) ?? [], cell])
        subnets.set(net, groups)
        centers.set(net, [...centers.get(net) ?? [], point])
        pads[cell] = subnet
        keys.set(cell, key)
    })

    const nets   = new Map([...subnets].filter(([, groups]) => groups.size > 1).map(([net, groups]) => [net, [...groups].map(([subnet, cells]): [number, number[]] => [subnet, cells])]))
    const params = Float64Array.from([VIA_COST, AVOID_COST, 0.5, 0, 0, 0, 1, 0])
    const grid: Grid = { width, height, layers: 1, step, owner, pads, nets, keys, order: [...nets.keys()].sort((a, b) => (centers.get(a)?.length ?? 0) - (centers.get(b)?.length ?? 0)), params }
    return { grid, frame }
}

const encode = (grid: Grid, order: number[]) => Int32Array.from([order.length, ...order.flatMap(net => {
    const groups = grid.nets.get(net) ?? []
    return [net, groups.length, ...groups.flatMap(([subnet, cells]) => [subnet, cells.length, ...cells])]
})])

const decode = (output: Int32Array): Pass => {
    const failed = Array.from(output.slice(4, 4 + output[3]))
    const paths: Pass['paths'] = []
    let at = 5 + output[3]

    for (let i = 0; i < output[4 + output[3]]; i++) {
        paths.push({ net: output[at], cells: Array.from(output.slice(at + 2, at + 2 + output[at + 1])) })
        at += 2 + output[at + 1]
    }

    return { connected: output[0], requested: output[1], vias: output[2], failed, paths }
}

// CICLOS DE ROTEAMENTO: NETS QUE FALHAM VÃO PARA A FRENTE DA ORDEM; O MELHOR É O QUE LIGA MAIS, DEPOIS O DE MENOS VIAS (SPEC 03 §8.2)
export const routeGrid = (wasm: RouterWasm, grid: Grid, cycles: number, progress: (cycle: number, best: Pass) => void = () => {}) => {
    const tried = new Set<string>()
    let order   = grid.order
    let best: Pass | null = null

    for (let cycle = 0; cycle < cycles && !tried.has(order.join(',')); cycle++) {
        tried.add(order.join(','))
        const pass = decode(wasm.route(grid.width, grid.height, grid.layers, grid.owner, grid.pads, encode(grid, order), grid.params))

        if (!best || pass.connected > best.connected || (pass.connected === best.connected && pass.vias < best.vias))
            best = pass

        progress(cycle, best)

        if (!pass.failed.length)
            break

        order = [...pass.failed, ...order.filter(net => !pass.failed.includes(net))]
    }

    return best ?? { connected: 0, requested: 0, vias: 0, failed: [], paths: [] }
}

// CAMINHOS EM TRILHAS: VÉRTICES NAS QUINAS, NAS JUNÇÕES EM T E NAS VIAS; PONTA EM PAD LIGA NO CONECTOR COM UM TRECHO ATÉ O TERMINAL (SPEC 03 §8.4)
export const getPlan = (grid: Grid, pass: Pass, frame: Artwork['board']['frame'], terminalOf: (key: string) => Point | null, [top, bottom]: [string, string] = [TOP, BOTTOM]): Plan => {
    const plane   = grid.width * grid.height
    const toScene = (index: number): Point => apply(invert(frame), ((index % plane) % grid.width + 0.5) * grid.step, (Math.floor((index % plane) / grid.width) + 0.5) * grid.step)
    const plan: Plan = { wires: [], vias: [], links: [] }
    const nodes   = new Map<string, End[]>()
    const attach  = (node: string, end: End) => nodes.set(node, [...nodes.get(node) ?? [], end])
    const layerOf = (index: number) => grid.layers === 2 && index >= plane ? bottom : top
    const splits  = new Map<number, Set<number>>()

    pass.paths.forEach(({ net, cells }, i) => [cells[0], cells[cells.length - 1]].filter(cell => !grid.keys.has(cell)).forEach(cell => {
        const host = pass.paths.findIndex((other, k) => k !== i && other.net === net && other.cells.indexOf(cell) > 0 && other.cells.indexOf(cell) < other.cells.length - 1)

        if (host >= 0)
            splits.set(host, new Set([...splits.get(host) ?? [], pass.paths[host].cells.indexOf(cell)]))
    }))

    pass.paths.forEach(({ cells }, i) => {
        const heading = (from: number, to: number) => `${Math.sign((to % plane) % grid.width - (from % plane) % grid.width)},${Math.sign(Math.floor((to % plane) / grid.width) - Math.floor((from % plane) / grid.width))},${Math.sign(to - from)}`
        const keep    = cells.map((cell, k) => {
            const [before, after] = [cells[k - 1], cells[k + 1]]
            const turn            = before !== undefined && after !== undefined && heading(cell, after) !== heading(before, cell)
            return k === 0 || k === cells.length - 1 || turn || splits.get(i)?.has(k) || (before !== undefined && Math.abs(cell - before) === plane) || (after !== undefined && Math.abs(after - cell) === plane)
        })
        const vertices = cells.filter((_, k) => keep[k])

        vertices.slice(1).forEach((cell, k) => {
            const previous = vertices[k]

            if (Math.abs(cell - previous) === plane) {
                plan.vias.push(toScene(cell))
                attach(`${cell % plane}`, { via: plan.vias.length - 1 })
                return
            }

            plan.wires.push({ layer: layerOf(cell), a: toScene(previous), b: toScene(cell) })
            attach(`${previous}`, { wire: plan.wires.length - 1, end: 0 })
            attach(`${cell}`, { wire: plan.wires.length - 1, end: 1 })
        })

        ;[cells[0], cells[cells.length - 1]].forEach(cell => {
            const key   = grid.keys.get(cell)
            const point = key ? terminalOf(key) : null

            if (!key || !point)
                return

            plan.wires.push({ layer: layerOf(cell), a: toScene(cell), b: point })
            attach(`${cell}`, { wire: plan.wires.length - 1, end: 0 })
            plan.links.push([{ wire: plan.wires.length - 1, end: 1 }, { key }])
        })
    })

    nodes.forEach((ends, node) => {
        const via    = ends.find((end): end is { via: number } => 'via' in end)
        const across = via ? [...nodes.get(`${Number(node)}`) ?? [], ...nodes.get(`${Number(node) + plane}`) ?? []] : ends
        const wires  = across.filter(end => 'wire' in end)

        if (via)
            return wires.forEach(end => plan.links.push([end, via]))

        wires.forEach((end, i) => wires.slice(i + 1).forEach(other => plan.links.push([end, other])))
    })

    return plan
}
