import type { Point } from '../../core/Geometry'
import { milsToPx } from '../../core/Units'
import { WIRE_STYLE } from '../../engine/Scene'

type Kind  = 'resistor' | 'capacitor' | 'electrolytic' | 'inductor' | 'potentiometer' | 'dc' | 'battery' | 'sine' | 'pulse' | 'ground' | 'diode' | 'led' | 'npn' | 'pnp' | 'nmos' | 'spdt' | 'button' | 'button4'
type Art   = { strokes: string[], fills: string[] }
type Frame = (x: number, y: number) => Point

const G    = 9                                            // PX DE CENA: 0,1 in, O PASSO DA GRADE DO ESQUEMÁTICO
const INK  = WIRE_STYLE.schematicView.color               // MESMA TINTA E ESPESSURA DOS FIOS DO ESQUEMÁTICO
const LINE = milsToPx(WIRE_STYLE.schematicView.mils)

// SÍMBOLO DE LIVRO POR PEÇA (A VARIANTE _pressed USA O MESMO) E OS CONECTORES NA ORDEM QUE O DESENHO ESPERA
const SYMBOLS: [string, Kind, string[]][] = [
    ['ResistorModuleID', 'resistor', ['connector0', 'connector1']],
    ['100milCeramicCapacitorModuleID', 'capacitor', ['connector0', 'connector1']],
    ['SmallElectrolyticCapacitorModuleID', 'electrolytic', ['connector0', 'connector1']],
    ['56bed03878064b8286b71d5240035138InductorModuleID', 'inductor', ['connector0', 'connector1']],
    ['potentiometer_rotary_9mm_6_PotentiometerModuleID', 'potentiometer', ['connector0', 'connector2', 'connector1']],
    ['5_DCPowerSupplyModuleID', 'dc', ['connector0', 'connector1']],
    ['1000AFDF10011leg', 'battery', ['connector0', 'connector1']],
    ['1_SinePowerSupplyModuleID', 'sine', ['connector1', 'connector0']],
    ['DCPulseSourceModuleID', 'pulse', ['connector1', 'connector0']],
    ['GroundModuleID', 'ground', ['connector0']],
    ['3254CBFC44diode', 'diode', ['connector1', 'connector0']],
    ['LED-genedb611bf8177f41ac9c325217070f0c62ColorLEDModuleID', 'led', ['connector1', 'connector0']],
    ['NPN-to92-ebc', 'npn', ['connector1', 'connector2', 'connector0']],
    ['2244EBEC21e', 'pnp', ['connector1', 'connector2', 'connector0']],
    ['1001ABDC04', 'nmos', ['connector0', 'connector1', 'connector2']],
    ['1238DBDC00-toggle-switch', 'spdt', ['connector1', 'connector0', 'connector2']],
    ['20A9BBEE34_ST-2leadbutton-horizon', 'button', ['connector0', 'connector1']],
    ['20A9BBEE34_ST', 'button4', ['connector0', 'connector1', 'connector2', 'connector3']]
]

export const symbolOf = (moduleId: string) => SYMBOLS.find(([id]) => moduleId === id || moduleId === `${id}_pressed`) ?? null

const sub   = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]]
const mid   = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
const size  = (v: Point) => Math.hypot(v[0], v[1])
const unit  = (v: Point): Point => size(v) > 0 ? [v[0] / size(v), v[1] / size(v)] : [1, 0]
const perp  = (u: Point): Point => [-u[1], u[0]]
const frame = (o: Point, u: Point, n: Point): Frame => (x, y) => [o[0] + u[0] * x + n[0] * y, o[1] + u[1] * x + n[1] * y]
const path  = (points: Point[]) => `M${points.map(point => `${+point[0].toFixed(2)} ${+point[1].toFixed(2)}`).join('L')}`
const ring  = (center: Point, r: number) => `M${center[0] - r} ${center[1]}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`
const head  = (tip: Point, along: Point, length: number) => {
    const side = perp(along)
    return `${path([tip, [tip[0] - along[0] * length + side[0] * length * 0.55, tip[1] - along[1] * length + side[1] * length * 0.55], [tip[0] - along[0] * length - side[0] * length * 0.55, tip[1] - along[1] * length - side[1] * length * 0.55]])}Z`
}
const plus  = (at: Point, u: Point, n: Point, arm: number) => [path([[at[0] - u[0] * arm, at[1] - u[1] * arm], [at[0] + u[0] * arm, at[1] + u[1] * arm]]), path([[at[0] - n[0] * arm, at[1] - n[1] * arm], [at[0] + n[0] * arm, at[1] + n[1] * arm]])]

// DOIS TERMINAIS: EIXO DE a PARA b, CORPO DE MEIO-COMPRIMENTO half NO MEIO (MENOR SE OS TERMINAIS ESTÃO PERTO) E OS FIOS DE LIGAÇÃO ATÉ ELE
const twoPin = (a: Point, b: Point, half: number) => {
    const u = unit(sub(b, a))
    const n = perp(u)
    const h = Math.min(half, size(sub(b, a)) * 0.42)
    const p = frame(mid(a, b), u, n)
    return { u, n, h, p, leads: [path([a, p(-h, 0)]), path([p(h, 0), b])] }
}

// FONTE REDONDA: CÍRCULO NO MEIO DOS TERMINAIS (MENOS → MAIS) COM O SINAL DE MAIS DO LADO POSITIVO
const roundSource = (a: Point, b: Point, inside: (p: Frame, r: number) => string[]): Art => {
    const { u, n, h, p, leads } = twoPin(a, b, 1.3 * G)
    return { strokes: [...leads, ring(p(0, 0), h), ...inside(p, h), ...plus(p(h + 0.55 * G, -0.7 * G), u, n, 0.22 * G)], fills: [] }
}

// TRÊS TERMINAIS COM O CORPO ENTRE O COMANDO (BASE, PORTA) E A LINHA DOS OUTROS DOIS: ORIGEM NO MEIO DELES, u NA DIREÇÃO DO COMANDO PARA O CORPO, n DO DE BAIXO PARA O DE CIMA
const threePin = (control: Point, top: Point, bottom: Point) => {
    const m = mid(top, bottom)
    const u = unit(sub(m, control))
    const v = sub(top, bottom)
    const n = unit([v[0] - u[0] * (v[0] * u[0] + v[1] * u[1]), v[1] - u[1] * (v[0] * u[0] + v[1] * u[1])])
    return { m, u, n, p: frame(m, u, n) }
}

const transistor = ([base, collector, emitter]: Point[], pnp: boolean): Art => {
    const { p }  = threePin(base, collector, emitter)
    const bar    = -0.9 * G
    const along  = unit(sub(p(0, -0.95 * G), p(bar, -0.35 * G)))
    const tip    = pnp ? p(bar + 0.3 * G, -0.48 * G) : p(-0.12 * G, -0.87 * G)
    return {
        strokes: [path([base, p(bar, 0)]), path([p(bar, -0.8 * G), p(bar, 0.8 * G)]), path([p(bar, 0.35 * G), p(0, 0.95 * G), collector]), path([p(bar, -0.35 * G), p(0, -0.95 * G), emitter]), ring(p(-0.3 * G, 0), 1.45 * G)],
        fills: [head(tip, pnp ? [-along[0], -along[1]] : along, 0.45 * G)]
    }
}

// DESENHO DO SÍMBOLO A PARTIR DOS TERMINAIS NA CENA (NA ORDEM DE SYMBOLS); center É O MEIO DA PEÇA (DIREÇÃO DO TERRA) E pressed A POSIÇÃO DA CHAVE
const draw = (kind: Kind, pins: Point[], center: Point, pressed: boolean): Art => {
    const [a, b] = pins

    if (kind === 'resistor' || kind === 'potentiometer') {
        const { n, h, p, leads } = twoPin(a, b, 1.5 * G)
        const zig   = path([p(-h, 0), ...Array.from({ length: 6 }, (_, i) => p(-h + (i + 0.5) * h / 3, i % 2 ? 0.45 * G : -0.45 * G)), p(h, 0)])
        const wiper = pins[2]
        const foot  = p(0, 0)
        const dir   = wiper ? unit(sub(foot, wiper)) : n
        const tip: Point = wiper ? [foot[0] - dir[0] * 0.65 * G, foot[1] - dir[1] * 0.65 * G] : foot
        return { strokes: [...leads, zig, ...wiper ? [path([wiper, tip])] : []], fills: wiper ? [head(tip, dir, 0.5 * G)] : [] }
    }

    if (kind === 'capacitor' || kind === 'electrolytic') {
        const { u, n, h, p, leads } = twoPin(a, b, 0.2 * G)
        const minus = kind === 'electrolytic' ? `M${p(-h - 0.3 * G, -0.75 * G).join(' ')}Q${p(-h + 0.3 * G, 0).join(' ')} ${p(-h - 0.3 * G, 0.75 * G).join(' ')}` : path([p(-h, -0.75 * G), p(-h, 0.75 * G)])
        return { strokes: [...leads, minus, path([p(h, -0.75 * G), p(h, 0.75 * G)]), ...kind === 'electrolytic' ? plus(p(h + 0.55 * G, -0.75 * G), u, n, 0.2 * G) : []], fills: [] }
    }

    if (kind === 'inductor') {
        const { h, p, leads } = twoPin(a, b, 1.6 * G)
        const r = h / 4
        return { strokes: [...leads, `M${p(-h, 0).join(' ')}${[1, 2, 3, 4].map(i => `A${r} ${r} 0 0 1 ${p(-h + 2 * r * i, 0).join(' ')}`).join('')}`], fills: [] }
    }

    if (kind === 'dc')
        return roundSource(a, b, (p, r) => [path([p(-0.45 * r, -0.22 * G), p(-0.45 * r, 0.22 * G)]), path([p(0.45 * r - 0.22 * G, 0), p(0.45 * r + 0.22 * G, 0)]), path([p(0.45 * r, -0.22 * G), p(0.45 * r, 0.22 * G)])])

    if (kind === 'sine')
        return roundSource(a, b, (p, r) => [path(Array.from({ length: 17 }, (_, i) => p(0.32 * r * Math.sin(Math.PI * 2 * i / 16), (i / 16 - 0.5) * 1.3 * r)))])

    if (kind === 'pulse')
        return roundSource(a, b, (p, r) => [path([p(-0.3 * r, -0.65 * r), p(-0.3 * r, -0.25 * r), p(0.3 * r, -0.25 * r), p(0.3 * r, 0.25 * r), p(-0.3 * r, 0.25 * r), p(-0.3 * r, 0.65 * r)])])

    if (kind === 'battery') {
        const { u, n, h, p, leads } = twoPin(a, b, 0.25 * G)
        return { strokes: [...leads, path([p(h, -0.95 * G), p(h, 0.95 * G)]), ...plus(p(h + 0.55 * G, -0.95 * G), u, n, 0.2 * G)], fills: [`${path([p(-h - 0.12 * G, -0.45 * G), p(-h + 0.12 * G, -0.45 * G), p(-h + 0.12 * G, 0.45 * G), p(-h - 0.12 * G, 0.45 * G)])}Z`] }
    }

    if (kind === 'ground') {
        const u = unit(sub(center, a))
        const p = frame(a, u, perp(u))
        const d = Math.min(0.9 * G, size(sub(center, a)))
        return { strokes: [path([a, p(d, 0)]), path([p(d, -0.75 * G), p(d, 0.75 * G)]), path([p(d + 0.32 * G, -0.48 * G), p(d + 0.32 * G, 0.48 * G)]), path([p(d + 0.64 * G, -0.2 * G), p(d + 0.64 * G, 0.2 * G)])], fills: [] }
    }

    if (kind === 'diode' || kind === 'led') {
        const { h, p, leads } = twoPin(a, b, 0.6 * G)
        const rays = kind === 'led' ? [0, 0.55 * G].map(shift => [p(-0.15 * G + shift, -0.85 * G), p(0.35 * G + shift, -1.5 * G)] as const) : []
        const out  = (from: Point, to: Point) => unit(sub(to, from))
        return { strokes: [...leads, path([p(h, -0.65 * G), p(h, 0.65 * G)]), ...rays.map(([from, to]) => path([from, to]))], fills: [`${path([p(-h, -0.65 * G), p(-h, 0.65 * G), p(h, 0)])}Z`, ...rays.map(([from, to]) => head(to, out(from, to), 0.35 * G))] }
    }

    if (kind === 'npn' || kind === 'pnp')
        return transistor(pins, kind === 'pnp')

    if (kind === 'nmos') {
        const [gate, drain, source] = pins
        const { p } = threePin(gate, drain, source)
        const channel = -0.55 * G
        return {
            strokes: [path([gate, p(-1.05 * G, 0)]), path([p(-1.05 * G, -0.75 * G), p(-1.05 * G, 0.75 * G)]), ...[-0.8, -0.1, 0.5].map(y => path([p(channel, y * G), p(channel, (y + 0.3) * G)])), path([p(channel, -0.65 * G), p(0, -0.65 * G), drain]), path([p(channel, 0.65 * G), p(0, 0.65 * G), source]), path([p(channel, 0), p(0, 0), p(0, 0.65 * G)])],
            fills: [head(p(channel + 0.05 * G, 0), unit(sub(p(channel, 0), p(0, 0))), 0.4 * G)]
        }
    }

    if (kind === 'spdt') {
        const [common, first, second] = pins
        const { m, u } = threePin(common, first, second)
        const pivot: Point = [m[0] - u[0] * 1.3 * G, m[1] - u[1] * 1.3 * G]
        const contact = (pin: Point): Point => [m[0] + unit(sub(pin, m))[0] * 0.8 * G, m[1] + unit(sub(pin, m))[1] * 0.8 * G]
        const target  = contact(pressed ? second : first)
        return { strokes: [path([common, pivot]), path([contact(first), first]), path([contact(second), second]), path([pivot, target]), ring(contact(first), 0.2 * G), ring(contact(second), 0.2 * G)], fills: [ring(pivot, 0.2 * G)] }
    }

    if (kind === 'button4') {
        const [one, two, three, four] = pins
        const buses = [path([one, two]), path([three, four])]
        const art   = draw('button', [mid(one, two), mid(three, four)], center, pressed)
        return { strokes: [...buses, ...art.strokes], fills: art.fills }
    }

    const { n, h, p, leads } = twoPin(a, b, 0.85 * G)
    const lift = (pressed ? 0.3 * G : 0.85 * G) * (n[1] > 1e-6 || (Math.abs(n[1]) <= 1e-6 && n[0] > 0) ? 1 : -1)
    const cap  = lift + Math.sign(lift) * 0.6 * G
    return { strokes: [...leads, ring(p(-h, 0), 0.2 * G), ring(p(h, 0), 0.2 * G), path([p(-h - 0.1 * G, -lift), p(h + 0.1 * G, -lift)]), path([p(0, -lift), p(0, -cap)]), path([p(-0.35 * G, -cap), p(0.35 * G, -cap)])], fills: [] }
}

// SÍMBOLO DE LIVRO NO LUGAR DA ARTE DO FRITZING NO ESQUEMÁTICO, LIGADO EXATAMENTE AOS TERMINAIS DA PEÇA
export const SymbolArt = ({ kind, pins, center, pressed }: { kind: Kind, pins: Point[], center: Point, pressed: boolean }) => {
    const art = draw(kind, pins, center, pressed)
    return (
        <g pointerEvents="none">
            {art.strokes.map((d, i) => <path key={`s${i}`} d={d} fill="none" stroke={INK} strokeWidth={LINE} strokeLinecap="round" strokeLinejoin="round" />)}
            {art.fills.map((d, i) => <path key={`f${i}`} d={d} fill={INK} stroke={INK} strokeWidth={LINE / 2} strokeLinejoin="round" />)}
        </g>
    )
}
