export type Matrix = [number, number, number, number, number, number]
export type Point  = [number, number]
export type Box    = [number, number, number, number]

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

export const multiply = (m: Matrix, n: Matrix): Matrix => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]

export const apply = (m: Matrix, x: number, y: number): Point => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

export const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y]

export const invert = (m: Matrix): Matrix => {
    const det = m[0] * m[3] - m[1] * m[2]
    return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det]
}

export const rotation = (degrees: number, cx = 0, cy = 0): Matrix => {
    const angle = degrees * Math.PI / 180
    const turn: Matrix = [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0]
    return multiply(multiply(translate(cx, cy), turn), translate(-cx, -cy))
}

const TRANSFORMS: Record<string, (v: number[]) => Matrix> = {
    matrix: v => [v[0], v[1], v[2], v[3], v[4], v[5]],
    translate: v => translate(v[0], v[1] ?? 0),
    scale: v => [v[0], 0, 0, v[1] ?? v[0], 0, 0],
    rotate: v => rotation(v[0], v[1], v[2]),
    skewX: v => [1, 0, Math.tan(v[0] * Math.PI / 180), 1, 0, 0],
    skewY: v => [1, Math.tan(v[0] * Math.PI / 180), 0, 1, 0, 0]
}

// ATRIBUTO transform DO SVG; NÚMERO INVÁLIDO OU RESULTADO NÃO FINITO INVALIDA O ATRIBUTO INTEIRO, QUE ENTÃO NÃO TRANSFORMA (COMO NO SVG)
export const parseTransform = (text: string | null | undefined) => {
    let m = IDENTITY

    for (const [, name, args] of (text ?? '').matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
        const build  = TRANSFORMS[name]
        const values = args.trim().split(/[\s,]+/).filter(Boolean).map(Number)

        if (!build)
            continue

        if (!values.every(Number.isFinite))
            return IDENTITY

        m = multiply(m, build(values))
    }

    return m.every(Number.isFinite) ? m : IDENTITY
}

export const boxOf = (points: Point[]): Box | null => {
    if (points.length === 0)
        return null

    const xs = points.map(([x]) => x)
    const ys = points.map(([, y]) => y)
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

export const unionBoxes = (boxes: (Box | null)[]) => {
    const valid = boxes.filter((box): box is Box => box !== null)
    return boxOf(valid.flatMap(([x0, y0, x1, y1]): Point[] => [[x0, y0], [x1, y1]]))
}

export const mapBox = (m: Matrix, [x0, y0, x1, y1]: Box) => boxOf([apply(m, x0, y0), apply(m, x1, y0), apply(m, x0, y1), apply(m, x1, y1)]) as Box

export const boxesTouch = (a: Box, b: Box) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]

// PONTO DENTRO DO POLÍGONO PELA PARIDADE DOS CRUZAMENTOS DE UM RAIO HORIZONTAL
export const insidePolygon = ([x, y]: Point, polygon: Point[]) => polygon.reduce((inside, [x1, y1], i) => {
    const [x0, y0] = polygon[(i + polygon.length - 1) % polygon.length]
    return (y1 > y) !== (y0 > y) && x < (x0 - x1) * (y - y1) / (y0 - y1) + x1 ? !inside : inside
}, false)

export const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

export const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1])

export const cubicAt = (p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point => {
    const u = 1 - t
    return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]
}

// DIVISÃO DE DE CASTELJAU: AS DUAS METADES DA CÚBICA NO PARÂMETRO t
export const splitCubic = (p0: Point, p1: Point, p2: Point, p3: Point, t: number): [Point[], Point[]] => {
    const a = lerp(p0, p1, t)
    const b = lerp(p1, p2, t)
    const c = lerp(p2, p3, t)
    const d = lerp(a, b, t)
    const e = lerp(b, c, t)
    const m = lerp(d, e, t)
    return [[p0, a, d, m], [m, e, c, p3]]
}

export const nearestOnSegment = (a: Point, b: Point, p: Point) => {
    const length = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2
    return length === 0 ? 0 : Math.min(1, Math.max(0, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / length))
}

const NEAREST_SAMPLES = 64
const NEAREST_ROUNDS  = 4

// PARÂMETRO DO PONTO DA CÚBICA MAIS PRÓXIMO DE p: AMOSTRAGEM SEGUIDA DE REFINO EM JANELAS CADA VEZ MENORES
export const nearestOnCubic = (p0: Point, p1: Point, p2: Point, p3: Point, p: Point) => {
    let [low, high] = [0, 1]
    let best = 0

    for (let round = 0; round < NEAREST_ROUNDS; round++) {
        const step = (high - low) / NEAREST_SAMPLES
        best = Array.from({ length: NEAREST_SAMPLES + 1 }, (_, k) => low + k * step).reduce((found, t) => distance(cubicAt(p0, p1, p2, p3, t), p) < distance(cubicAt(p0, p1, p2, p3, found), p) ? t : found, low)
        low  = Math.max(0, best - step)
        high = Math.min(1, best + step)
    }

    return best
}

// PONTO NO POLÍGONO (x0 y0 x1 y1 …) PELA REGRA PAR-ÍMPAR
export const isInside = (polygon: number[], x: number, y: number) => {
    let hit = false

    for (let i = 0, j = polygon.length - 2; i < polygon.length; j = i, i += 2) {
        if ((polygon[i + 1] > y) !== (polygon[j + 1] > y) && x < (polygon[j] - polygon[i]) * (y - polygon[i + 1]) / (polygon[j + 1] - polygon[i + 1]) + polygon[i])
            hit = !hit
    }

    return hit
}

// PONTO NO FRAGMENTO DO PREENCHIMENTO: DENTRO DO CONTORNO EXTERNO E FORA DOS FUROS
export const contains = (polygons: number[][], x: number, y: number) => polygons.filter(polygon => isInside(polygon, x, y)).length % 2 === 1
