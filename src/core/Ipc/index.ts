import { apply, multiply } from '../Geometry'
import { keyOf, splitKey, WIRE_FLAGS, type Doc } from '../Document'
import type { Library } from '../Library'
import type { Artwork, Placement } from '../Cam'
import { tagOf } from '../Xml'
import { MIL_PER_INCH, PX_PER_INCH } from '../Units'

type Pad = { title: string, name: string, id: string, x: number, y: number, width: number, height: number, drill: number, plated: boolean, circular: boolean, rotation: number, middle: boolean, local: number }

const UM_PER_MIL = 25.4
const MIL_PER_PX = MIL_PER_INCH / PX_PER_INCH
const THROUGH    = 317
const CONTINUED  = 17
const SURFACE    = 327
const ACCESS: Record<string, number> = { copper1: 1, copper0: 16 }
const SKIPPED    = ['wire', 'copperFill', 'board', 'resizableBoard', 'breadboard', 'logo', 'note', 'ruler']

const um = (mils: number) => Math.round(mils * UM_PER_MIL)

const signed = (value: number) => `${value < 0 ? '-' : '+'}${String(Math.abs(value)).padStart(6, '0')}`

// PINO DO REGISTRO: O connectorId CURTO, SENÃO SEU PRIMEIRO NÚMERO, SENÃO 4 LETRAS; ANODO/CATODO E +/- PELO NOME (SPEC 03 §5.4)
const pinOf = (id: string, name: string) => {
    const digits = id.match(/\d+/)?.[0]
    const base   = id.length <= 4 ? id : digits ? digits.slice(0, 4) : id.slice(0, 4)
    const lower  = name.toLowerCase()

    return lower.includes('anode') ? 'A' :
           lower.includes('catho') ? 'C' :
           name === '-' || name === '+' ? name : base
}

const record = (code: number, net: string, pad: Pad, layer: string) => `${String(code).padStart(3, '0')}${net.slice(0, 14).padEnd(14)}   ${pad.title.slice(0, 6).padEnd(6)}-${pinOf(pad.id, pad.name).slice(0, 4).padStart(4)}${pad.middle ? 'M' : ' '}${pad.drill > 0 || code !== SURFACE ? 'D' : ' '}${String(Math.max(0, pad.drill)).padStart(4, '0')}${pad.plated ? 'P' : 'U'}A${String(ACCESS[layer] ?? 0).padStart(2, '0')}X${signed(pad.x)}Y${signed(pad.y)}X${String(pad.width).padStart(4, '0')}Y${String(pad.height).padStart(4, '0')}R${String(((pad.rotation % 360) + 360) % 360).padStart(3, '0')} S0     `

// NETLIST DE TESTE ELÉTRICO: NETS SÓ POR TRILHAS DA PCB (SEM BARRAMENTOS NEM FIOS DE OUTRAS VISTAS), THT EM 317/017 E SMD EM 327, mm/1000 A PARTIR DO CANTO INFERIOR ESQUERDO (SPEC 03 §5.4)
export const exportIpc = (doc: Doc, library: Library, artwork: Artwork, placement: Placement, title: string) => {
    const { board } = artwork
    const shown     = Object.values(doc.instances).filter(instance => placement.isShown(instance))
    const traces    = shown.filter(instance => instance.moduleIdRef === 'WireModuleID' && (instance.views.pcbView?.geometry.wireFlags ?? 0) & WIRE_FLAGS.pcbView)
    const parts     = shown.filter(instance => !SKIPPED.includes(library.getPart(instance.moduleIdRef)?.kind ?? 'wire'))
    const present   = new Set([...traces, ...parts].map(instance => instance.modelIndex))
    const parent    = new Map<string, string>()
    const find      = (key: string): string => parent.get(key) === key || !parent.has(key) ? key : find(parent.get(key) ?? key)
    const join      = (a: string, b: string) => parent.set(find(a), find(b))
    const linked    = (key: string) => doc.edges.filter(edge => edge.includes(key) && present.has(splitKey(edge[0] === key ? edge[1] : edge[0])[0])).length

    doc.edges.filter(([a, b]) => present.has(splitKey(a)[0]) && present.has(splitKey(b)[0])).forEach(([a, b]) => join(a, b))
    traces.forEach(trace => join(keyOf(trace.modelIndex, 'connector0'), keyOf(trace.modelIndex, 'connector1')))

    const pads = parts.flatMap(instance => {
        const part  = library.getPart(instance.moduleIdRef)
        const m     = placement.getMatrix(instance.modelIndex)
        const svg   = library.getInstanceSvg(instance, 'pcbView')
        const state = instance.views.pcbView

        if (!part || !m || !svg || !state)
            return []

        const variant  = library.getVariant(instance, 'pcbView')
        const scoped   = (part.views.pcbView?.layers.length ?? 0) > 1
        const rotation = Math.round(Math.atan2(m[1], m[0]) * 180 / Math.PI)
        const face     = state.bottom ? 'copper0' : 'copper1'

        return part.connectors.flatMap(connector => (['copper1', 'copper0'] as const).flatMap(layer => {
            const pin     = connector.views.pcbView?.find(candidate => candidate.layer === layer)
            const shape   = pin ? library.getLayerPins(part.moduleId, 'pcbView', layer, variant).get(connector.id) : undefined
            const element = pin ? svg.find(pin.svgId, scoped ? layer : null) : undefined

            if (!pin || !shape)
                return []

            const circle  = element && tagOf(element) === 'circle'
            const r       = circle ? svg.length(element, 'r') * svg.sx : 0
            const w       = circle ? svg.getStroke(element) * svg.sx : 0
            const [cx, cy] = apply(multiply(board.frame, m), (shape.rect[0] + shape.rect[2]) / 2, (shape.rect[1] + shape.rect[3]) / 2)
            const drill   = um((2 * r - w) * MIL_PER_PX)
            const key     = keyOf(instance.modelIndex, connector.id)
            const pad: Pad = { title: instance.title, name: connector.name, id: connector.id, x: um(cx), y: um(board.height - cy), width: um((drill > 0 ? 2 * r + w : shape.rect[2] - shape.rect[0]) * MIL_PER_PX), height: circle ? 0 : um((shape.rect[3] - shape.rect[1]) * MIL_PER_PX), drill, plated: w > 0, circular: !!circle, rotation, middle: linked(key) > 1, local: (shape.rect[0] + shape.rect[2] + shape.rect[1] + shape.rect[3]) / 2 }
            return [{ key, layer, face, pad, tht: !part.flippedSMD && (connector.views.pcbView ?? []).some(other => other.layer !== layer && other.layer.startsWith('copper')) }]
        }))
    })

    const groups = new Map<string, typeof pads>()
    pads.forEach(entry => groups.set(find(entry.key), [...groups.get(find(entry.key)) ?? [], entry]))

    const nets = [...groups.values()].map(entries => entries.sort((a, b) => b.pad.local - a.pad.local)).sort((a, b) => b[0].pad.title.localeCompare(a[0].pad.title) || b[0].pad.local - a[0].pad.local)
    const body = nets.flatMap((entries, i) => {
        const ground = entries.some(entry => entry.pad.name.toLowerCase().includes('gnd'))
        const net    = ground ? `NET${i + 1}-GND` : `NET${i + 1}${entries[0].pad.title}${entries[entries.length - 1].pad.title}`

        return entries.flatMap(entry => {
            if (!entry.tht)
                return entry.layer === entry.face ? [record(SURFACE, net, entry.pad, entry.layer)] : []

            const other = entries.find(candidate => candidate.key === entry.key && candidate.layer !== entry.layer)
            return entry.layer === entry.face ? [] : [record(THROUGH, net, other?.pad ?? entry.pad, entry.face), record(CONTINUED, net, entry.pad, entry.layer)]
        })
    })

    const header = ['C  CircuitMaster', 'C  0.1', 'P  CODE  00', 'P  UNITS CUST 1', `P  TITLE ${title.slice(0, 62)}`, 'P  VER   IPC-D-356A']
    return [...header, ...body, '999', ''].join('\n')
}
