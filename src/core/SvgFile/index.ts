import { childrenOf, parseXml, tagOf, walk, type XmlElement } from '../Xml'
import { PX_PER_INCH, toInches } from '../Units'
import { IDENTITY, apply, boxOf, cubicAt, multiply, parseTransform, unionBoxes, type Box, type Matrix, type Point } from '../Geometry'

type Subpath = { points: Point[], closed: boolean }

const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }
const CURVE_STEPS      = 16
const ARC_STEP         = Math.PI / 32
const ILLUSTRATOR      = 'generator: adobe illustrator'
const LEG_COLOR        = '#8C8C8C'
const LEG_STROKE       = 0.029
const UNIT_PATTERN     = /^\s*([-+\d.eE]+)\s*(px|mm|cm|in|pt|pc)\s*$/
const NUMBER_PATTERN   = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g
const UNSAFE_TAGS      = new Set(['script', 'foreignObject'])

// CONVERSÃO DO ARCO SVG DE EXTREMOS PARA CENTRO (SVG 1.1 F.6.5) E AMOSTRAGEM
const sampleArc = (p0: Point, [rx0, ry0, rotation, large, sweep, x, y]: number[]) => {
    const phi = rotation * Math.PI / 180
    const [cos, sin] = [Math.cos(phi), Math.sin(phi)]
    const dx = (p0[0] - x) / 2
    const dy = (p0[1] - y) / 2
    const x1 = cos * dx + sin * dy
    const y1 = -sin * dx + cos * dy
    const lambda = (x1 * x1) / (rx0 * rx0) + (y1 * y1) / (ry0 * ry0)
    const rx = Math.abs(rx0) * Math.max(1, Math.sqrt(lambda))
    const ry = Math.abs(ry0) * Math.max(1, Math.sqrt(lambda))

    if (rx === 0 || ry === 0)
        return [[x, y] as Point]

    const sign   = large === sweep ? -1 : 1
    const factor = sign * Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1) / (rx * rx * y1 * y1 + ry * ry * x1 * x1)))
    const cx1    = factor * rx * y1 / ry
    const cy1    = -factor * ry * x1 / rx
    const cx     = cos * cx1 - sin * cy1 + (p0[0] + x) / 2
    const cy     = sin * cx1 + cos * cy1 + (p0[1] + y) / 2
    const angle  = (ux: number, uy: number) => Math.atan2(uy, ux)
    const theta  = angle((x1 - cx1) / rx, (y1 - cy1) / ry)
    let delta    = angle((-x1 - cx1) / rx, (-y1 - cy1) / ry) - theta

    if (sweep && delta < 0)
        delta += 2 * Math.PI

    if (!sweep && delta > 0)
        delta -= 2 * Math.PI

    const steps = Math.max(1, Math.ceil(Math.abs(delta) / ARC_STEP))
    return Array.from({ length: steps }, (_, k): Point => {
        const t = theta + delta * (k + 1) / steps
        return [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos]
    })
}

// ACHATA UM PATH SVG EM POLILINHAS (CURVAS E ARCOS AMOSTRADOS)
export const flattenPath = (d: string) => {
    const tokens = d.match(NUMBER_PATTERN) ?? []
    const result: Subpath[] = []
    let current: Subpath = { points: [], closed: false }
    let cursor: Point = [0, 0]
    let start: Point = [0, 0]
    let control: Point | null = null
    let previous = ''
    let command = 'M'
    let i = 0

    const push = (point: Point) => { current.points.push(point); cursor = point }

    while (i < tokens.length) {
        if (/[a-zA-Z]/.test(tokens[i])) {
            command = tokens[i++]

            if (command.toUpperCase() !== 'Z')
                continue

            current.closed = true
            result.push(current)
            current = { points: [start], closed: false }
            cursor = start
            continue
        }

        const upper    = command.toUpperCase()
        const relative = command !== upper
        const values   = tokens.slice(i, i + ARITY[upper]).map(Number)
        const at = (k: number): Point => relative ? [cursor[0] + values[k], cursor[1] + values[k + 1]] : [values[k], values[k + 1]]
        i += Math.max(1, ARITY[upper])

        const last = previous
        previous   = upper

        if (upper === 'M') {
            if (current.points.length > 1)
                result.push(current)

            start   = at(0)
            current = { points: [], closed: false }
            push(start)
            command = relative ? 'l' : 'L'
            continue
        }

        if (upper === 'L' || upper === 'H' || upper === 'V') {
            const h = relative ? cursor[0] + values[0] : values[0]
            const v = relative ? cursor[1] + values[0] : values[0]
            push(upper === 'L' ? at(0) : upper === 'H' ? [h, cursor[1]] : [cursor[0], v])
            continue
        }

        if (upper === 'A') {
            const end = at(5)
            sampleArc(cursor, [values[0], values[1], values[2], values[3], values[4], end[0], end[1]]).forEach(push)
            continue
        }

        const quadratic = upper === 'Q' || upper === 'T'
        const smooth    = control && (quadratic ? 'QT' : 'CS').includes(last)
        const reflected: Point = smooth && control ? [2 * cursor[0] - control[0], 2 * cursor[1] - control[1]] : cursor
        const p0 = cursor

        const [c1, c2, end] =
            upper === 'C' ? [at(0), at(2), at(4)] :
            upper === 'S' ? [reflected, at(0), at(2)] :
            upper === 'Q' ? [at(0), at(0), at(2)] : [reflected, reflected, at(0)]

        const k1: Point = quadratic ? [p0[0] + 2 / 3 * (c1[0] - p0[0]), p0[1] + 2 / 3 * (c1[1] - p0[1])] : c1
        const k2: Point = quadratic ? [end[0] + 2 / 3 * (c1[0] - end[0]), end[1] + 2 / 3 * (c1[1] - end[1])] : c2

        for (let step = 1; step <= CURVE_STEPS; step++)
            push(cubicAt(p0, k1, k2, end, step / CURVE_STEPS))

        control = quadratic ? c1 : c2
    }

    if (current.points.length > 1)
        result.push(current)

    return result
}

// PONTOS EXTREMOS DO CONTORNO TRAÇADO: TERMINAÇÃO BUTT SÓ ALARGA NA NORMAL, SQUARE TAMBÉM AVANÇA, ROUND É UM DISCO
const strokePoints = ({ points, closed }: Subpath, r: number, cap: string) => points.flatMap((p, i): Point[] => {
    if (r === 0)
        return [p]

    const end = !closed && (i === 0 || i === points.length - 1)

    if (!end || cap === 'round')
        return [[p[0] - r, p[1] - r], [p[0] + r, p[1] + r]]

    const near = (i === 0 ? points : [...points].reverse()).find(q => q[0] !== p[0] || q[1] !== p[1])

    if (!near)
        return [p]

    const length = Math.hypot(p[0] - near[0], p[1] - near[1])
    const d: Point = [(p[0] - near[0]) / length * r, (p[1] - near[1]) / length * r]
    const e: Point = cap === 'square' ? d : [0, 0]
    return [[p[0] - d[1] + e[0], p[1] + d[0] + e[1]], [p[0] + d[1] + e[0], p[1] - d[0] + e[1]]]
})

export type Leg = { p1: Point, p2: Point, width: number, color: string }

// REGRAS CSS DOS <style> POR SELETOR SIMPLES (#id, .classe, tag); DECLARAÇÕES DE UM MESMO SELETOR SE ACUMULAM
const getRules = (root: XmlElement) => {
    const rules = new Map<string, Record<string, string>>()

    walk(root, element => {
        if (tagOf(element) !== 'style')
            return

        for (const [, selectors, body] of (element.textContent ?? '').replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            const declarations = Object.fromEntries(body.split(';').map(item => item.split(':')).filter(pair => pair.length >= 2).map(([key, ...value]) => [key.trim(), value.join(':').replace('!important', '').trim()]))
            selectors.split(',').map(selector => selector.trim()).filter(Boolean).forEach(selector => rules.set(selector, { ...rules.get(selector), ...declarations }))
        }
    })

    return rules
}

// DOCUMENTO SVG DE UMA VISTA DE PEÇA: TAMANHO FÍSICO, VIEWBOX E CAIXA DE CADA ELEMENTO EM PX (SPEC 01 §3)
export class SvgFile {
    text: string
    root: XmlElement | null = null
    width = 0
    height = 0
    viewBox: Box = [0, 0, 0, 0]
    sx = 1
    sy = 1
    inches = 0
    ids = new Map<string, Map<string, XmlElement>>()
    rules = new Map<string, Record<string, string>>()

    constructor(text: string) {
        this.text = text
    }

    update() {
        const root        = parseXml(this.text)
        const illustrator = this.text.toLowerCase().includes(ILLUSTRATOR)
        const wIn         = toInches(root?.getAttribute('width'), illustrator)
        const hIn         = toInches(root?.getAttribute('height'), illustrator)

        if (!root || tagOf(root) !== 'svg' || !wIn || !hIn)
            return

        const box = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)

        this.root    = root
        this.inches  = wIn
        this.width   = wIn * PX_PER_INCH
        this.height  = hIn * PX_PER_INCH
        this.viewBox = box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0 ? [box[0], box[1], box[2], box[3]] : [0, 0, this.width, this.height]
        this.sx      = this.width / this.viewBox[2]
        this.sy      = this.height / this.viewBox[3]
        this.rules   = getRules(root)
    }

    find(id: string, scope: string | null) {
        const key = scope ?? ''

        if (!this.ids.has(key))
            this.ids.set(key, this.index(scope))

        return this.ids.get(key)?.get(id)
    }

    index(scope: string | null) {
        const ids = new Map<string, XmlElement>()
        const top = scope ? this.findFirst(scope) ?? (scope === 'copper1' ? this.findFirst('copper0') : undefined) : this.root ?? undefined

        if (top)
            walk(top, element => {
                const id = element.getAttribute('id')

                if (id)
                    ids.set(id, element)
            })

        return ids
    }

    findFirst(id: string) {
        let found: XmlElement | undefined

        if (this.root)
            walk(this.root, element => found = found ?? (element.getAttribute('id') === id ? element : undefined))

        return found
    }

    // PRECEDÊNCIA DO SVG: style EM LINHA, REGRA CSS (#id, .classe, tag), ATRIBUTO DE APRESENTAÇÃO; SENÃO HERDA DO PAI
    getStyle(element: XmlElement, name: string) {
        for (let node: XmlElement | null = element; node && node.nodeType === 1; node = node.parentNode as XmlElement | null) {
            const css  = (node.getAttribute('style') ?? '').match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`))
            const rule = this.rules.size ? this.getRule(node, name) : undefined

            if (css)
                return css[1].trim()

            if (rule !== undefined)
                return rule

            if (node.hasAttribute(name))
                return node.getAttribute(name)
        }

        return null
    }

    getRule(node: XmlElement, name: string) {
        const classes = (node.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).map(name => `.${name}`)
        return [`#${node.getAttribute('id')}`, ...classes, tagOf(node)].map(selector => this.rules.get(selector)?.[name]).find(value => value !== undefined)
    }

    length(element: XmlElement, name: string, value = element.getAttribute(name)) {
        const unit = (value ?? '').match(UNIT_PATTERN)

        if (unit)
            return (toInches(value) ?? 0) * this.viewBox[2] / this.inches

        const number = parseFloat(value ?? '')
        return Number.isFinite(number) ? number : 0
    }

    getMatrix(element: XmlElement) {
        const chain: XmlElement[] = []

        for (let node: XmlElement | null = element; node && node !== this.root && node.nodeType === 1; node = node.parentNode as XmlElement | null)
            chain.unshift(node)

        return chain.reduce((m, node) => multiply(m, parseTransform(node.getAttribute('transform'))), IDENTITY)
    }

    getStroke(element: XmlElement) {
        const stroke = this.getStyle(element, 'stroke')

        if (!stroke || stroke === 'none')
            return 0

        const width = this.getStyle(element, 'stroke-width')
        return width === null ? 1 : this.length(element, 'stroke-width', width)
    }

    shapeBox(element: XmlElement, m: Matrix) {
        const tag   = tagOf(element)
        const r     = this.getStroke(element) / 2
        const cap   = this.getStyle(element, 'stroke-linecap') ?? 'butt'
        const value = (name: string) => this.length(element, name)

        if (tag === 'circle' || tag === 'ellipse') {
            const rx      = (tag === 'circle' ? value('r') : value('rx')) + r
            const ry      = (tag === 'circle' ? value('r') : value('ry')) + r
            const [cx, cy] = apply(m, value('cx'), value('cy'))
            const hx      = Math.hypot(m[0] * rx, m[2] * ry)
            const hy      = Math.hypot(m[1] * rx, m[3] * ry)
            return [cx - hx, cy - hy, cx + hx, cy + hy] as Box
        }

        const points = (element.getAttribute('points') ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number)
        const pairs  = Array.from({ length: Math.floor(points.length / 2) }, (_, k): Point => [points[2 * k], points[2 * k + 1]])
        const [x, y, w, h] = [value('x'), value('y'), value('width'), value('height')]

        const subpaths: Subpath[] =
            tag === 'rect' || tag === 'image' ? [{ points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true }] :
            tag === 'line'                     ? [{ points: [[value('x1'), value('y1')], [value('x2'), value('y2')]], closed: false }] :
            tag === 'polyline'                 ? [{ points: pairs, closed: false }] :
            tag === 'polygon'                  ? [{ points: pairs, closed: true }] :
            tag === 'path'                     ? flattenPath(element.getAttribute('d') ?? '') : []

        const stroked = tag === 'image' ? 0 : r
        return boxOf(subpaths.flatMap(subpath => strokePoints(subpath, stroked, cap)).map(([px, py]) => apply(m, px, py)))
    }

    elementBox(element: XmlElement, m: Matrix): Box | null {
        if (this.getStyle(element, 'display') === 'none' || UNSAFE_TAGS.has(tagOf(element)) || ['defs', 'symbol', 'clipPath', 'mask', 'pattern', 'marker'].includes(tagOf(element)))
            return null

        const own      = this.shapeBox(element, m)
        const children = childrenOf(element).map(child => this.elementBox(child, multiply(m, parseTransform(child.getAttribute('transform')))))
        return unionBoxes([own, ...children])
    }

    toPx([x, y]: Point): Point {
        return [(x - this.viewBox[0]) * this.sx, (y - this.viewBox[1]) * this.sy]
    }

    getBox(id: string, scope: string | null = null) {
        const element = this.find(id, scope)
        const box     = element ? this.elementBox(element, this.getMatrix(element)) : null

        if (!box)
            return null

        const [x0, y0] = this.toPx([box[0], box[1]])
        const [x1, y1] = this.toPx([box[2], box[3]])
        return x1 - x0 === 0 && y1 - y0 === 0 ? null : [x0, y0, x1, y1] as Box
    }

    getLeg(id: string, scope: string | null = null): Leg | null {
        const element = this.find(id, scope)

        if (!element || tagOf(element) !== 'line')
            return null

        const m      = this.getMatrix(element)
        const value  = (name: string) => this.length(element, name)
        const a      = this.toPx(apply(m, value('x1'), value('y1')))
        const b      = this.toPx(apply(m, value('x2'), value('y2')))
        const center = [this.width / 2, this.height / 2]
        const far    = (p: Point) => Math.hypot(p[0] - center[0], p[1] - center[1])
        const width  = this.getStyle(element, 'stroke-width')
        const stroke = width === null ? LEG_STROKE : this.length(element, 'stroke-width', width)
        const [p1, p2] = far(a) <= far(b) ? [a, b] : [b, a]
        return { p1, p2, width: stroke * this.sx, color: this.getStyle(element, 'stroke') ?? LEG_COLOR }
    }
}
