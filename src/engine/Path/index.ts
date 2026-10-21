import type { Box, Point } from '../../core/Geometry'

export type Heading = Point | null
export type Route   = { start: Heading, end: Heading, axis: Heading, boxes: Box[], wires: [Point, Point][], pins: Point[], grid: number, diagonal: boolean }

const EPSILON  = 1e-3    // PX: DIFERENÇA INVISÍVEL MESMO NO ZOOM MÁXIMO (ARREDONDAMENTO DOS SVG DAS PEÇAS)
const SIDEWAYS = 3       // SAIR OU CHEGAR DE LADO NO PINO
const AGAINST  = 8       // SAIR OU CHEGAR POR DENTRO DA PEÇA
const CORNER   = 1
const CROSSING = 6       // CADA TRECHO QUE ATRAVESSA O CORPO DE UMA PEÇA
const OVERLAP  = 12      // TRECHO SOBRE OUTRO FIO OU PASSANDO POR UM TERMINAL: PARECE LIGAÇÃO QUE NÃO EXISTE
const ACROSS   = 2       // CADA CRUZAMENTO COM OUTRO FIO: PERMITIDO, MAS POLUI O DESENHO
const TURN     = 0.5     // DEPOIS DE UMA DOBRA, PREFERE VIRAR A SEGUIR RETO
const MINOR    = 0.1     // EMPATE: PRIMEIRO TRECHO NO EIXO DE MAIOR DESLOCAMENTO
const GAP      = 2       // PASSOS DE GRADE ENTRE O PINO E O TRECHO QUE CONTORNA
const FREE_GAP = 20      // PX QUANDO NÃO HÁ GRADE
const SHIFTS   = [0, 1, -1, 2, -2, 3, -3]    // DESLOCAMENTOS DO TRECHO DO MEIO DO Z, EM PASSOS DE GRADE

export const FREE_ROUTE: Route = { start: null, end: null, axis: null, boxes: [], wires: [], pins: [], grid: 0, diagonal: false }

const sign = (value: number) => Math.abs(value) < EPSILON ? 0 : Math.sign(value)

const directionOf = (a: Point, b: Point): Point => [sign(b[0] - a[0]), sign(b[1] - a[1])]

const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1]

const snapTo = (value: number, grid: number) => grid > 0 ? Math.round(value / grid) * grid : value

const same = (a: Point, b: Point) => Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON

const gapOf = (grid: number) => grid > 0 ? GAP * grid : FREE_GAP

// TRECHO pq PASSA PELO INTERIOR ABERTO DA CAIXA (RECORTE DE LIANG–BARSKY)
export const crosses = (p: Point, q: Point, [x0, y0, x1, y1]: Box) => {
    let [low, high] = [0, 1]

    for (const [delta, from, min, max] of [[q[0] - p[0], p[0], x0, x1], [q[1] - p[1], p[1], y0, y1]]) {
        if (Math.abs(delta) < EPSILON && (from <= min + EPSILON || from >= max - EPSILON))
            return false

        if (Math.abs(delta) < EPSILON)
            continue

        const [t0, t1] = [(min - from) / delta, (max - from) / delta]
        low  = Math.max(low, Math.min(t0, t1))
        high = Math.min(high, Math.max(t0, t1))
    }

    return high - low > EPSILON
}

// DOIS TRECHOS HORIZONTAIS (OU VERTICAIS) NA MESMA LINHA COM COMPRIMENTO EM COMUM
const overlaps = (p: Point, q: Point, [r, s]: [Point, Point]) => [0, 1].some(axis => {
    const other = 1 - axis
    const level = [p[other], q[other], r[other], s[other]]

    if (Math.max(...level) - Math.min(...level) > EPSILON)
        return false

    return Math.min(Math.max(p[axis], q[axis]), Math.max(r[axis], s[axis])) - Math.max(Math.min(p[axis], q[axis]), Math.min(r[axis], s[axis])) > EPSILON
})

// TRECHOS QUE SE CORTAM NUM PONTO INTERIOR AOS DOIS (CRUZAMENTO, NÃO ENCONTRO DE PONTAS)
const intersects = (p: Point, q: Point, [r, s]: [Point, Point]) => {
    const d1    = [q[0] - p[0], q[1] - p[1]]
    const d2    = [s[0] - r[0], s[1] - r[1]]
    const denom = d1[0] * d2[1] - d1[1] * d2[0]

    if (Math.abs(denom) < EPSILON)
        return false

    const t = ((r[0] - p[0]) * d2[1] - (r[1] - p[1]) * d2[0]) / denom
    const u = ((r[0] - p[0]) * d1[1] - (r[1] - p[1]) * d1[0]) / denom
    const margin = EPSILON / Math.max(EPSILON, Math.hypot(d1[0], d1[1]), Math.hypot(d2[0], d2[1]))
    return t > margin && t < 1 - margin && u > margin && u < 1 - margin
}

// PONTO NO TRECHO pq, NAS PONTAS INCLUSIVE
const touches = (p: Point, q: Point, point: Point) => {
    const length = Math.hypot(q[0] - p[0], q[1] - p[1])
    const cross  = (q[0] - p[0]) * (point[1] - p[1]) - (q[1] - p[1]) * (point[0] - p[0])
    const along  = (point[0] - p[0]) * (q[0] - p[0]) + (point[1] - p[1]) * (q[1] - p[1])
    return Math.abs(cross) <= EPSILON * Math.max(1, length) && along >= -EPSILON && along <= length * length + EPSILON
}

// PENALIDADE DE UM TRECHO CONTRA A DIREÇÃO PEDIDA: A FAVOR, DE LADO OU CONTRA
const against = (direction: Point, heading: Heading) => {
    const product = heading ? dot(direction, heading) : 1
    return product > 0 ? 0 : product < 0 ? AGAINST : SIDEWAYS
}

// COORDENADA DO TRECHO DO MEIO DE UM Z: NO MEIO DAS PONTAS, OU ALÉM DELAS QUANDO A SAÍDA OU A CHEGADA PEDEM
const middle = (from: number, to: number, leave: number, out: number, grid: number) => {
    const gap  = gapOf(grid)
    const low  = Math.max(leave > 0 ? from + gap : -Infinity, out > 0 ? to + gap : -Infinity)
    const high = Math.min(leave < 0 ? from - gap : Infinity, out < 0 ? to - gap : Infinity)
    return Math.min(Math.max(snapTo((from + to) / 2, grid), low), high)
}

const isStraight = (a: Point, b: Point, diagonal: boolean) => {
    const [dx, dy] = [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])]
    return dx < EPSILON || dy < EPSILON || (diagonal && Math.abs(dx - dy) < EPSILON)
}

// CANTOS ENTRE a E b: RETO, OS DOIS L E OS DOIS Z (O TRECHO DO MEIO EM ALGUMAS POSIÇÕES); NA PCB, RETO-DIAGONAL E DIAGONAL-RETO
const getCorners = (a: Point, b: Point, start: Heading, end: Heading, { grid, diagonal }: Route): Point[][] => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
    const d        = Math.min(Math.abs(dx), Math.abs(dy))
    const [sx, sy] = [sign(dx), sign(dy)]
    const step     = grid > 0 ? grid : FREE_GAP / GAP

    if (diagonal)
        return [[], [[b[0] - sx * d, b[1] - sy * d]], [[a[0] + sx * d, a[1] + sy * d]]]

    const mx = middle(a[0], b[0], start?.[0] ?? 0, end?.[0] ?? 0, grid)
    const my = middle(a[1], b[1], start?.[1] ?? 0, end?.[1] ?? 0, grid)
    return [[], [[b[0], a[1]]], [[a[0], b[1]]], ...SHIFTS.flatMap(k => [[[mx + k * step, a[1]], [mx + k * step, b[1]]], [[a[0], my + k * step], [b[0], my + k * step]]] as Point[][])]
}

const getCandidates = (a: Point, b: Point, route: Route): Point[][] => {
    const { start, end } = route
    const gap   = gapOf(route.grid)
    const lead  = start && [a[0] + start[0] * gap, a[1] + start[1] * gap] as Point
    const trail = end && [b[0] + end[0] * gap, b[1] + end[1] * gap] as Point
    const plain = getCorners(a, b, start, end, route).map(corners => [a, ...corners, b])
    const stubs = lead || trail ? getCorners(lead ?? a, trail ?? b, start, end, route).map(corners => [a, ...lead ? [lead] : [], ...corners, ...trail ? [trail] : [], b]) : []
    return [...plain, ...stubs]
}

const getScore = (points: Point[], a: Point, b: Point, { start, end, axis, boxes, wires, pins }: Route) => {
    const segments = points.slice(1).map((point, i) => [points[i], point] as const)
    const first    = directionOf(...segments[0])
    const last     = directionOf(...segments[segments.length - 1])
    const crossed  = segments.reduce((sum, [p, q]) => sum + boxes.filter(box => crosses(p, q, box)).length, 0)
    const covered  = segments.reduce((sum, [p, q], i) => sum + wires.filter(wire => overlaps(p, q, wire)).length + segments.slice(i + 1).filter(other => overlaps(p, q, [other[0], other[1]])).length, 0)
    const touched  = pins.filter(pin => !same(pin, a) && !same(pin, b) && segments.some(([p, q]) => touches(p, q, pin))).length
    const crossing = segments.reduce((sum, [p, q]) => sum + wires.filter(wire => intersects(p, q, wire)).length, 0)
    const turn     = axis && dot(first, axis) === 0 ? TURN : 0
    const minor    = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? first[0] === 0 : first[1] === 0
    return against(first, start) + against(last, end && [-end[0], -end[1]]) + (segments.length - 1) * CORNER + crossed * CROSSING + (covered + touched) * OVERLAP + crossing * ACROSS + turn + (minor ? MINOR : 0)
}

// CANTOS DO CAMINHO DE a ATÉ b EM TRECHOS ORTOGONAIS (OU A 0°/45°/90° NA PCB): SAI DE a NA DIREÇÃO start, CHEGA EM b PELO LADO end DO PINO, EVITA CORPOS DE PEÇAS, FIOS E TERMINAIS E USA POUCAS DOBRAS
export const getPath = (a: Point, b: Point, route: Route): Point[] => {
    if (same(a, b))
        return []

    const options = getCandidates(a, b, route).map(simplifyPath)
    const valid   = options.filter(points => points.length >= 2 && points.slice(1).every((point, i) => isStraight(points[i], point, route.diagonal)))
    const scored  = valid.map(points => [getScore(points, a, b, route), points] as const).sort((x, y) => x[0] - y[0] || x[1].length - y[1].length)
    return scored[0]?.[1].slice(1, -1) ?? []
}

const isCollinear = (a: Point, b: Point, c: Point) => {
    const before: Point = [b[0] - a[0], b[1] - a[1]]
    const after: Point  = [c[0] - b[0], c[1] - b[1]]
    return Math.abs(before[0] * after[1] - before[1] * after[0]) <= EPSILON * Math.hypot(...before) * Math.hypot(...after)
}

// PONTOS INTERNOS REPETIDOS, COLINEARES OU DE IDA E VOLTA SAEM: CADA DOBRA QUE FICA MUDA A DIREÇÃO SEM O FIO VOLTAR SOBRE SI
export const simplifyPath = (points: Point[]) => {
    const kept: Point[] = []

    for (const point of points) {
        while (kept.length >= 2 && isCollinear(kept[kept.length - 2], kept[kept.length - 1], point))
            kept.pop()

        if (!kept.length || !same(kept[kept.length - 1], point))
            kept.push(point)
    }

    return kept
}

// DIREÇÃO DO EIXO DOMINANTE DE UM VETOR, COMO HEADING; NULO SE O VETOR É NULO
export const toHeading = ([x, y]: Point): Heading => Math.abs(x) < EPSILON && Math.abs(y) < EPSILON ? null : Math.abs(x) >= Math.abs(y) ? [Math.sign(x), 0] : [0, Math.sign(y)]

export const isAxisAligned = (a: Point, b: Point) => Math.abs(a[0] - b[0]) < EPSILON || Math.abs(a[1] - b[1]) < EPSILON
