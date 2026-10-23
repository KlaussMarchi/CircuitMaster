import type { Sexpr } from '../Sexpr'
import type { Box, Point } from '../Geometry'

export const MIL = 1000 / 25.4    // MIL POR mm

export const num = (node: Sexpr | undefined) => Number(typeof node === 'string' ? node : NaN)

export const at = (node: Sexpr[] | undefined): Point => [num(node?.[1]), num(node?.[2])]

export const boxOf = (points: Point[], pad = 0): Box => [Math.min(...points.map(p => p[0])) - pad, Math.min(...points.map(p => p[1])) - pad, Math.max(...points.map(p => p[0])) + pad, Math.max(...points.map(p => p[1])) + pad]

export const corners = (box: Box): Point[] => [[box[0], box[1]], [box[2], box[3]]]

// ARCO DE TRÊS PONTOS (start, mid, end) EM ARCO DO SVG: RAIO PELO CÍRCULO QUE PASSA PELOS TRÊS, SENTIDO PELO LADO DO MEIO
export const arcPath = (a: Point, m: Point, b: Point) => {
    const d  = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]))
    const cx = ((a[0] ** 2 + a[1] ** 2) * (m[1] - b[1]) + (m[0] ** 2 + m[1] ** 2) * (b[1] - a[1]) + (b[0] ** 2 + b[1] ** 2) * (a[1] - m[1])) / d
    const cy = ((a[0] ** 2 + a[1] ** 2) * (b[0] - m[0]) + (m[0] ** 2 + m[1] ** 2) * (a[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (m[0] - a[0])) / d
    const r  = Math.hypot(a[0] - cx, a[1] - cy)
    const cross = (m[0] - a[0]) * (b[1] - a[1]) - (m[1] - a[1]) * (b[0] - a[0])
    const large = Math.hypot(m[0] - (a[0] + b[0]) / 2, m[1] - (a[1] + b[1]) / 2) > r ? 1 : 0
    return Number.isFinite(r) ? `M${a[0]} ${a[1]}A${r} ${r} 0 ${large} ${cross < 0 ? 1 : 0} ${b[0]} ${b[1]}` : `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`
}

export const svgOf = (width: number, height: number, body: string) => `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="${width / 1000}in" height="${height / 1000}in" viewBox="0 0 ${width} ${height}">\n${body}\n</svg>\n`

export const escapeXml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
