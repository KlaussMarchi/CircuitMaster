import { childOf, childrenOf, headOf, isList, readSexpr, unquote, type Sexpr } from '../Sexpr'
import type { Box, Point } from '../Geometry'
import { MIL, arcPath, at, boxOf, corners, escapeXml, num, svgOf } from '../KicadDraw'

export type KicadPin    = { number: string, name: string, type: string, at: Point, angle: number, length: number, hidden: boolean, unit: number }
export type KicadSymbol = { name: string, properties: Record<string, string>, pins: KicadPin[], shapes: [number, Sexpr[][]][], units: number, power: boolean, namesInside: number, hideNames: boolean, hideNumbers: boolean }

const LINE        = 6              // MIL, LARGURA PADRÃO DO TRAÇO (0,1524 mm, A DO EESCHEMA)
const UNIT_GAP    = 200            // MIL ENTRE AS UNIDADES DESENHADAS LADO A LADO
const MARGIN      = 50             // MIL EM VOLTA DO DESENHO
const PIN_COLOR   = '#787878'
const BODY_FILL   = '#ffffe0'      // FUNDO "background" DO CORPO, O AMARELO-CLARO DO EESCHEMA
const NAME_INSET  = 0.508          // mm, O pin_names offset PADRÃO

// "NOME_U_E": A UNIDADE U (0 = TODAS) E O ESTILO DE CORPO E (0 = TODOS, 1 = NORMAL, 2 = DE MORGAN) DE UM SUBSÍMBOLO
const unitOf = (name: string): [number, number] => {
    const match = name.match(/_(\d+)_(\d+)$/)
    return match ? [Number(match[1]), Number(match[2])] : [0, 1]
}

const readPin = (node: Sexpr[], unit: number): KicadPin => ({
    number: unquote(childOf(node, 'number')?.[1]),
    name: unquote(childOf(node, 'name')?.[1]),
    type: typeof node[1] === 'string' ? node[1] : 'passive',
    at: at(childOf(node, 'at')),
    angle: num(childOf(node, 'at')?.[3]) || 0,
    length: num(childOf(node, 'length')?.[1]) || 0,
    hidden: node.includes('hide') || unquote(childOf(node, 'hide')?.[1]) === 'yes',
    unit
})

const yes = (node: Sexpr[] | undefined) => node !== undefined && (node.includes('hide') || unquote(childOf(node, 'hide')?.[1]) === 'yes')

// SÍMBOLO DE UM .kicad_sym (O PRIMEIRO DO ARQUIVO; NAS PASTAS .kicad_symdir DO KICAD 10 HÁ UM POR ARQUIVO); O DERIVADO (extends) HERDA DESENHO E PINOS DO PAI
export const readSymbol = (text: string, parent: KicadSymbol | null = null): KicadSymbol | null => {
    const [root] = readSexpr(text) ?? []
    const node   = childOf(root, 'symbol')

    if (!node)
        return null

    const name       = unquote(node[1])
    const properties = Object.fromEntries(childrenOf(node, 'property').map(property => [unquote(property[1]), unquote(property[2])]))
    const children   = childrenOf(node, 'symbol').map(child => [unitOf(unquote(child[1])), child] as const).filter(([[, style]]) => style <= 1)    // ESTILO 0 VALE PARA TODOS; O 2 É O DE MORGAN
    const shapes     = children.map(([[unit], child]): [number, Sexpr[][]] => [unit, child.filter((item): item is Sexpr[] => isList(item) && headOf(item) !== 'pin')])
    const pins       = children.flatMap(([[unit], child]) => childrenOf(child, 'pin').map(pin => readPin(pin, unit)))
    const names      = childOf(node, 'pin_names')
    const own        = { name, properties, pins, shapes, units: Math.max(1, ...pins.map(pin => pin.unit), ...shapes.map(([unit]) => unit)), power: childOf(node, 'power') !== undefined, namesInside: names ? num(childOf(names, 'offset')?.[1]) || 0 : NAME_INSET, hideNames: yes(names), hideNumbers: yes(childOf(node, 'pin_numbers')) }

    return childOf(node, 'extends') && parent ? { ...parent, name, properties: { ...parent.properties, ...properties } } : own
}

export const parentOf = (text: string) => unquote(childOf(childOf(readSexpr(text)?.[0], 'symbol'), 'extends')?.[1])

// PINOS ÚNICOS PELO NÚMERO, NA ORDEM DO SÍMBOLO: CADA UM VIRA O connectorN DA PEÇA (PINOS EMPILHADOS COM O MESMO NÚMERO SÃO UM CONECTOR SÓ)
export const pinsOf = (symbol: KicadSymbol) => [...new Map(symbol.pins.map(pin => [pin.number || pin.name, pin])).values()]

// PONTA DO PINO (ONDE O FIO LIGA) E FIM NO CORPO, EM mm COM y PARA CIMA
export const pinEnds = (pin: KicadPin): [Point, Point] => {
    const angle = pin.angle * Math.PI / 180
    return [pin.at, [pin.at[0] + pin.length * Math.round(Math.cos(angle)), pin.at[1] + pin.length * Math.round(Math.sin(angle))]]
}

type Draw = { box: Box, svg: string }

const stroke = (node: Sexpr[]) => Math.max(LINE, num(childOf(childOf(node, 'stroke'), 'width')?.[1]) * MIL || 0)

const fillOf = (node: Sexpr[]) => {
    const type = unquote(childOf(childOf(node, 'fill'), 'type')?.[1])
    return type === 'outline' ? '#000000' : type === 'background' ? BODY_FILL : 'none'
}

const mil = ([x, y]: Point): Point => [x * MIL, -y * MIL]

const MARKUP: Record<string, string> = { '~': 'text-decoration="overline"', '_': 'baseline-shift="sub" font-size="70%"', '^': 'baseline-shift="super" font-size="70%"' }

// MARKUP DO KICAD NO TEXTO: ~{barra em cima}, _{índice}, ^{expoente} (O RESTO VAI ESCAPADO)
const markup = (content: string) => escapeXml(content).replace(/([~_^])\{([^}]*)\}/g, (_, mark: string, inner: string) => `<tspan ${MARKUP[mark]}>${inner}</tspan>`)

const text = (content: string, [x, y]: Point, size: number, anchor: string, rotate = 0, color = '#000000') => `<text x="${x}" y="${y}" font-family="Droid Sans" font-size="${size}" fill="${color}" text-anchor="${anchor}" dominant-baseline="central"${rotate ? ` transform="rotate(${rotate} ${x} ${y})"` : ''}>${markup(content)}</text>`

// UM DESENHO DO CORPO EM SVG (mil, y PARA BAIXO): RETÂNGULO, CÍRCULO, ARCO, POLILINHA, BÉZIER E TEXTO
const drawShape = (node: Sexpr[]): Draw | null => {
    const kind  = headOf(node)
    const width = stroke(node)
    const fill  = fillOf(node)
    const style = `fill="${fill}" stroke="#000000" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`

    if (kind === 'rectangle') {
        const [a, b] = [mil(at(childOf(node, 'start'))), mil(at(childOf(node, 'end')))]
        const box    = boxOf([a, b])
        return { box: boxOf([a, b], width / 2), svg: `<rect x="${box[0]}" y="${box[1]}" width="${box[2] - box[0]}" height="${box[3] - box[1]}" ${style}/>` }
    }

    if (kind === 'circle') {
        const c = mil(at(childOf(node, 'center')))
        const r = num(childOf(node, 'radius')?.[1]) * MIL
        return { box: [c[0] - r, c[1] - r, c[0] + r, c[1] + r], svg: `<circle cx="${c[0]}" cy="${c[1]}" r="${r}" ${style}/>` }
    }

    if (kind === 'arc') {
        const [a, m, b] = ['start', 'mid', 'end'].map(key => mil(at(childOf(node, key))))
        return { box: boxOf([a, m, b], width / 2), svg: `<path d="${arcPath(a, m, b)}" ${style}/>` }
    }

    if (kind === 'polyline' || kind === 'bezier') {
        const points = childrenOf(childOf(node, 'pts'), 'xy').map(point => mil(at(point)))
        const d      = kind === 'bezier' && points.length === 4 ? `M${points[0].join(' ')}C${points.slice(1).map(point => point.join(' ')).join(' ')}` : `M${points.map(point => point.join(' ')).join('L')}`
        return points.length ? { box: boxOf(points, width / 2), svg: `<path d="${d}" ${style}/>` } : null
    }

    if (kind === 'text') {
        const place = childOf(node, 'at')
        const p     = mil(at(place))
        const size  = num(childOf(childOf(childOf(node, 'effects'), 'font'), 'size')?.[1]) * MIL || 50
        return { box: [p[0] - size, p[1] - size / 2, p[0] + size, p[1] + size / 2], svg: text(unquote(node[1]), p, size, 'middle', -(num(place?.[3]) || 0) / 10) }
    }

    return null
}

// PINO: TRAÇO DO CORPO ATÉ A PONTA, O RETÂNGULO connectorNpin NO TRAÇO, O connectorNterminal NA PONTA E O NOME E O NÚMERO
const drawPin = (symbol: KicadSymbol, pin: KicadPin, id: number): Draw => {
    const [end, base] = pinEnds(pin).map(mil)
    const half        = LINE / 2
    const box         = boxOf([end, base], half)
    const size        = 50
    const along       = [Math.sign(base[0] - end[0]), Math.sign(base[1] - end[1])]
    const vertical    = along[0] === 0
    const inside: Point = [base[0] + along[0] * (symbol.namesInside * MIL + size / 2), base[1] + along[1] * (symbol.namesInside * MIL + size / 2)]
    const outside: Point = vertical ? [(end[0] + base[0]) / 2 - size * 0.6, (end[1] + base[1]) / 2] : [(end[0] + base[0]) / 2, (end[1] + base[1]) / 2 - size * 0.6]
    const name        = pin.name && pin.name !== '~' && !symbol.hideNames ? symbol.namesInside > 0 ? text(pin.name, inside, size, along[0] > 0 || along[1] < 0 ? 'start' : 'end', vertical ? -90 : 0) : '' : ''
    const number      = pin.number && !symbol.hideNumbers ? text(pin.number, outside, size * 0.8, 'middle', vertical ? -90 : 0, '#8c8c8c') : ''
    const line        = `<line x1="${end[0]}" y1="${end[1]}" x2="${base[0]}" y2="${base[1]}" stroke="${PIN_COLOR}" stroke-width="${LINE}" stroke-linecap="round"/>`
    const rect        = `<rect id="connector${id}pin" x="${box[0]}" y="${box[1]}" width="${box[2] - box[0]}" height="${box[3] - box[1]}" fill="none" stroke="none"/>`
    const terminal    = `<rect id="connector${id}terminal" x="${end[0] - half}" y="${end[1] - half}" width="${LINE}" height="${LINE}" fill="none" stroke="none"/>`
    return { box, svg: pin.hidden ? rect + terminal : line + rect + terminal + name + number }
}

// ESQUEMÁTICO DA PEÇA NO PADRÃO DO FRITZING (GRUPO schematic, mil): AS UNIDADES LADO A LADO, CADA PINO UM CONECTOR (SUBPEÇAS POR UNIDADE NA FASE 8)
export const symbolSvg = (symbol: KicadSymbol) => {
    const ids    = new Map(pinsOf(symbol).map((pin, i) => [pin.number || pin.name, i]))
    const units  = Array.from({ length: symbol.units }, (_, i) => i + 1)
    const drawn  = units.map(unit => [...symbol.shapes.filter(([owner]) => owner === 0 || owner === unit).flatMap(([, nodes]) => nodes.map(drawShape)), ...symbol.pins.filter(pin => pin.unit === unit || (pin.unit === 0 && unit === 1)).map(pin => drawPin(symbol, pin, ids.get(pin.number || pin.name) ?? 0))].filter((item): item is Draw => item !== null))
    const boxes  = drawn.map(items => items.length ? boxOf(items.flatMap(item => corners(item.box))) : [0, 0, 0, 0] as Box)
    const shifts = boxes.reduce<number[]>((list, box, i) => [...list, i ? list[i - 1] + boxes[i - 1][2] + UNIT_GAP - box[0] : 0], [])
    const all    = boxes.map((box, i): Box => [box[0] + shifts[i], box[1], box[2] + shifts[i], box[3]])
    const frame  = boxOf(all.flatMap(corners), MARGIN)
    const body   = drawn.map((items, i) => `<g transform="translate(${shifts[i] - frame[0]} ${-frame[1]})">${items.map(item => item.svg).join('')}</g>`).join('')
    const [w, h] = [frame[2] - frame[0], frame[3] - frame[1]]
    return svgOf(w, h, `<g id="schematic">${body}</g>`)
}
