import { boardPart, boxOfPoints, footprintPart, fromArtwork, padPolygon, splitTees, type BoardData, type BoardPad, type Inner, type Side } from '../../core/Board'
import { addEdges, emptyDoc, keyOf, updateInstance, updateView, type Doc, type Edge } from '../../core/Document'
import type { Artwork } from '../../core/Cam'
import type { Point } from '../../core/Geometry'
import type { Library } from '../../core/Library'
import type { Netlist } from '../../core/Netlist'
import type { Plan } from '../../core/Router'
import type { BundleFile } from '../../core/Sketch'
import { MIL_PER_INCH, PX_PER_INCH } from '../../core/Units'
import { readAltium } from '../../core/Altium'
import { readKicad } from '../../core/Kicad'
import { readEagle } from '../../core/Eagle'
import { readFabrication, type GerberLayer } from '../../core/GerberReader'
import { applyPlan, createFills, createInstance, setPartSide } from '../Edit'
import type { Clipper } from '../../core/Clipper'
import { getZoneFill } from '../../core/Fill'

const PX       = PX_PER_INCH / MIL_PER_INCH
const MARGIN   = 50     // mil EM VOLTA DO DESENHO QUANDO O ARQUIVO NÃO TRAZ CONTORNO
const BUCKET   = 100    // mil DO LADO DE CADA CÉLULA DO ÍNDICE DE PADS
const SPACING  = 36     // PX ENTRE PEÇAS NO ESQUEMÁTICO E NA PROTOBOARD
const TRACE    = 24     // mil, SÓ SE UM TRECHO VIER SEM LARGURA
const JOIN     = 0.5    // mil ENTRE PONTAS DE TRILHA CONSIDERADAS A MESMA
const HOLE     = '0.4mm,0.3mm'

const mm = (mils: number) => Number((mils * 25.4 / 1000).toFixed(4))

// SEM CONTORNO NO ARQUIVO: RETÂNGULO EM VOLTA DE TUDO COM MARGEM
const withOutline = (board: BoardData): BoardData => {
    if (board.outline.length)
        return board

    const points = [...board.footprints.flatMap(footprint => footprint.pads.flatMap(pad => [pad.x, pad.y])), ...board.tracks.flatMap(track => [...track.a, ...track.b]), ...board.vias.flatMap(via => [via.x, via.y])]
    const [x0, y0, x1, y1] = points.length ? boxOfPoints(points) : [0, 0, 1000, 1000]
    return { ...board, outline: [[x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN, x0 - MARGIN, y1 + MARGIN]] }
}

// DISTÂNCIA DO PONTO AO CONTORNO (ZERO NÃO QUER DIZER DENTRO; PARA ISSO, inside)
const gap = (polygon: number[], x: number, y: number) => {
    let best = Infinity

    for (let i = 0, j = polygon.length - 2; i < polygon.length; j = i, i += 2) {
        const [ax, ay, bx, by] = [polygon[j], polygon[j + 1], polygon[i], polygon[i + 1]]
        const length = (bx - ax) ** 2 + (by - ay) ** 2
        const t      = length ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / length)) : 0
        best         = Math.min(best, Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)))
    }

    return best
}

const inside = (polygon: number[], x: number, y: number) => {
    let hit = false

    for (let i = 0, j = polygon.length - 2; i < polygon.length; j = i, i += 2) {
        if ((polygon[i + 1] > y) !== (polygon[j + 1] > y) && x < (polygon[j] - polygon[i]) * (y - polygon[i + 1]) / (polygon[j + 1] - polygon[i + 1]) + polygon[i])
            hit = !hit
    }

    return hit
}

type Located = { pad: BoardPad, key: string, polygon: number[] }

// ITENS POR CÉLULA DE 100 mil PARA ACHAR O QUE ESTÁ SOB A PONTA DE CADA TRILHA SEM VARRER TODOS
const bucketIndex = <T,>(items: T[], box: (item: T) => number[]) => {
    const cells = new Map<string, T[]>()

    items.forEach(item => {
        const [x0, y0, x1, y1] = box(item)

        for (let cx = Math.floor(x0 / BUCKET); cx <= Math.floor(x1 / BUCKET); cx++)
            for (let cy = Math.floor(y0 / BUCKET); cy <= Math.floor(y1 / BUCKET); cy++)
                cells.set(`${cx}|${cy}`, [...cells.get(`${cx}|${cy}`) ?? [], item])
    })

    return (x: number, y: number, r = 0) => {
        const found = new Set<T>()

        for (let cx = Math.floor((x - r) / BUCKET); cx <= Math.floor((x + r) / BUCKET); cx++)
            for (let cy = Math.floor((y - r) / BUCKET); cy <= Math.floor((y + r) / BUCKET); cy++)
                cells.get(`${cx}|${cy}`)?.forEach(item => found.add(item))

        return [...found]
    }
}

// PEÇA NA PCB COM O CANTO NO PONTO; O RÓTULO (POSIÇÃO ABSOLUTA) ACOMPANHA PELO SEU DESLOCAMENTO
const place = (doc: Doc, modelIndex: string, [x, y]: Point) => updateView(doc, 'pcbView', modelIndex, state => ({ ...state, geometry: { ...state.geometry, x, y }, label: state.label && { ...state.label, x: x + state.label.xOffset, y: y + state.label.yOffset } }))

export type Imported = { doc: Doc, files: BundleFile[], dropped: number, inner: number }

// CAMADAS INTERNAS GUARDADAS NA PROPRIEDADE inner DA PLACA: mil A PARTIR DO CANTO DA PLACA (O MESMO REFERENCIAL DA EXPORTAÇÃO) E, POR NET DO ARQUIVO, UM TERMINAL DELA
type Stored = Inner & { copper: number, nets: Record<string, string> }

// DOCUMENTO NOVO A PARTIR DA PLACA NEUTRA: PLACA COM O CONTORNO, UMA INSTÂNCIA POR FOOTPRINT (PEÇA GERADA), AS NETS COMO LIGAÇÕES DIRETAS ENTRE OS PINOS DE CADA NET
// (RATSNEST NO ESQUEMÁTICO E NA PCB) E AS TRILHAS E VIAS DO ARQUIVO LIGADAS AOS PADS PELA GEOMETRIA, FORA DO "APAGAR AUTOROTEADAS" (SPEC 09 §4)
export const importBoard = async (source: BoardData, library: Library, clipper: Clipper): Promise<Imported> => {
    const board  = withOutline(source)
    const files  = new Map<string, BundleFile>()
    const host   = boardPart(board, files)
    const parts  = board.footprints.map(footprint => footprintPart(footprint, files))
    const list   = [...files.values()]

    library.addBundle({ sketch: null, parts: list.filter(file => file.name.startsWith('part.')), svgs: list.filter(file => file.name.startsWith('svg.')), others: [], bin: null })
    await library.load([host.moduleId, ...parts.map(part => part.moduleId), 'ViaModuleID', 'WireModuleID', 'GroundPlaneModuleID'])

    const [ox, oy] = host.offset
    const scene    = (x: number, y: number): Point => [(x - ox) * PX, (y - oy) * PX]
    const sizes    = (view: 'schematicView' | 'breadboardView') => parts.map(part => library.getSvg(part.moduleId, view)).map(svg => [svg?.width ?? 0, svg?.height ?? 0])
    const grid     = (view: 'schematicView' | 'breadboardView', i: number): Point => {
        const all     = sizes(view)
        const columns = Math.max(1, Math.ceil(Math.sqrt(all.length)))
        const [w, h]  = [Math.max(0, ...all.map(size => size[0])) + SPACING, Math.max(0, ...all.map(size => size[1])) + SPACING]
        return [(i % columns) * w, Math.floor(i / columns) * h]
    }
    let doc        = createInstance(emptyDoc(), library, host.moduleId, { breadboardView: [0, 0], schematicView: [0, 0], pcbView: [0, 0] })
    const hostIndex = String(doc.nextIndex - 1)
    doc            = place(doc, hostIndex, [0, 0])
    const located: Located[] = []

    board.footprints.forEach((footprint, i) => {
        const part       = parts[i]
        const modelIndex = String(doc.nextIndex)
        doc              = createInstance(doc, library, part.moduleId, { breadboardView: grid('breadboardView', i), schematicView: grid('schematicView', i), pcbView: [0, 0] })
        doc              = place(doc, modelIndex, scene(footprint.x + part.offset[0], footprint.y + part.offset[1]))
        doc              = updateInstance(doc, modelIndex, instance => ({ ...instance, title: footprint.ref || instance.title, properties: footprint.value ? { ...instance.properties, 'part number': footprint.value } : instance.properties }))

        if (footprint.side === 'bottom')
            doc = setPartSide(doc, library, [modelIndex], true)

        footprint.pads.filter(pad => pad.name || pad.plated).forEach((pad, k) => located.push({ pad, key: keyOf(modelIndex, `connector${k}`), polygon: padPolygon(pad).map((value, n) => value + (n % 2 ? pad.y : pad.x)) }))
    })

    const nets = new Map<string, string[]>()
    located.filter(item => item.pad.net).forEach(item => nets.set(item.pad.net, [...nets.get(item.pad.net) ?? [], item.key]))
    doc = addEdges(doc, [...nets.values()].flatMap(keys => keys.slice(1).map((key, i): Edge => [keys[i], key])))

    const tracks = splitTees(board.tracks)
    const padsAt = bucketIndex(located, item => boxOfPoints(item.polygon))
    const viasAt = bucketIndex(board.vias.map((via, v) => ({ via, v })), ({ via }) => [via.x - via.diameter / 2, via.y - via.diameter / 2, via.x + via.diameter / 2, via.y + via.diameter / 2])
    // A PONTA TOCA O PAD QUANDO O COBRE SE ENCONTRA: DENTRO DO CONTORNO OU A ATÉ MEIA LARGURA DA TRILHA DELE (O FRITZING LIGA PELA TOPOLOGIA E A PONTA PODE PARAR NA BORDA)
    const find   = (x: number, y: number, side: Side, r = 0) => padsAt(x, y, r).filter(item => (item.pad.side === 'both' || item.pad.side === side) && (inside(item.polygon, x, y) || gap(item.polygon, x, y) <= r)).sort((a, b) => (inside(a.polygon, x, y) ? 0 : gap(a.polygon, x, y)) - (inside(b.polygon, x, y) ? 0 : gap(b.polygon, x, y)))
    const tips   = tracks.flatMap((track, i) => [track.a, track.b].map(([x, y], end) => ({ x, y, side: track.side, n: 2 * i + end, end: { wire: i, end: end as 0 | 1 } })))
    const tipsAt = bucketIndex(tips, tip => [tip.x - JOIN, tip.y - JOIN, tip.x + JOIN, tip.y + JOIN])
    const plan: Plan = { wires: [], vias: [], holes: [], links: [] }

    // PONTAS DA MESMA FACE A MENOS DE JOIN SE LIGAM (A CHAVE ARREDONDADA SEPARARIA PONTAS VIZINHAS NA FRONTEIRA DO ARREDONDAMENTO)
    tips.forEach(tip => tipsAt(tip.x, tip.y).filter(other => other.side === tip.side && other.n > tip.n && Math.hypot(other.x - tip.x, other.y - tip.y) <= JOIN).slice(0, 1).forEach(other => plan.links.push([tip.end, other.end])))

    tracks.forEach((track, i) => {
        plan.wires.push({ layer: track.side === 'top' ? 'copper1trace' : 'copper0trace', a: scene(...track.a), b: scene(...track.b), mils: track.width || TRACE })
        ;[track.a, track.b].forEach(([x, y], end) => {
            find(x, y, track.side, (track.width || TRACE) / 2).slice(0, 1).forEach(item => plan.links.push([{ wire: i, end: end as 0 | 1 }, { key: item.key }]))
            viasAt(x, y).filter(({ via }) => Math.hypot(via.x - x, via.y - y) <= via.diameter / 2).forEach(({ v }) => plan.links.push([{ wire: i, end: end as 0 | 1 }, { via: v }]))
        })
    })

    board.vias.forEach((via, v) => {
        plan.vias.push(scene(via.x, via.y))
        plan.holes?.push(`${mm(via.drill)}mm,${mm(Math.max(0, via.diameter - via.drill) / 2)}mm`)
        find(via.x, via.y, 'top').slice(0, 1).forEach(item => plan.links.push([{ via: v }, { key: item.key }]))
    })

    doc = applyPlan(doc, library, 'pcbView', plan, TRACE, HOLE, false)
    // ÁREAS DE COBRE COMO PREENCHIMENTOS DA FACE (O MESMO "COPPER FILL" DO PREENCHIMENTO DO FRITZING): A MOLDURA LEVA A CENA (px) AO REFERENCIAL DA PLACA NEUTRA (mil);
    // netKey GUARDA UM TERMINAL DA NET DA ÁREA, PARA A EXPORTAÇÃO DEVOLVER A NET
    doc = board.zones.reduce((current, zone) => {
        const netKey = zone.net ? located.find(item => item.pad.net === zone.net)?.key : undefined
        return createFills(current, getZoneFill(clipper, zone, board), [1 / PX, 0, 0, 1 / PX, ox, oy], 'plain', netKey ? { netKey } : {})
    }, doc)
    // O COBRE INTERNO NÃO ENTRA NA EDIÇÃO: FICA NA PLACA E VOLTA NA EXPORTAÇÃO; A NET DE CADA ITEM É A DE UM TERMINAL DELA, QUE SEGUE A NETLIST DO DOCUMENTO
    // ponytail: MOVER UMA PEÇA NÃO LEVA AS TRILHAS INTERNAS JUNTO, E O DRC NÃO AS VÊ. MELHORIA: CAMADAS INTERNAS EDITÁVEIS NO MODELO DO DOCUMENTO
    const { tracks: inTracks, zones: inZones, vias: inVias } = board.inner
    const kept     = inTracks.length + inZones.length + inVias.length
    const move     = (points: number[]) => points.map((value, i) => value - (i % 2 ? oy : ox))
    const innerNets = [...new Set([...inTracks, ...inZones, ...inVias].map(item => item.net).filter(Boolean))]
    const stored: Stored = {
        copper: board.copper,
        nets: Object.fromEntries(innerNets.flatMap(net => located.filter(item => item.pad.net === net).slice(0, 1).map(item => [net, item.key]))),
        tracks: inTracks.map(track => ({ ...track, a: [track.a[0] - ox, track.a[1] - oy], b: [track.b[0] - ox, track.b[1] - oy] })),
        zones: inZones.map(zone => ({ ...zone, fill: zone.fill.map(move), pour: zone.pour && { ...zone.pour, outline: move(zone.pour.outline) } })),
        vias: inVias.map(via => ({ ...via, x: via.x - ox, y: via.y - oy }))
    }

    if (kept)
        doc = updateInstance(doc, hostIndex, instance => ({ ...instance, properties: { ...instance.properties, inner: JSON.stringify(stored, (_, value) => typeof value === 'number' ? Number(value.toFixed(3)) : value) } }))

    return { doc, files: list, dropped: board.dropped, inner: kept }
}

// PLACA DE OUTRO PROGRAMA PELA EXTENSÃO: .PcbDoc BINÁRIO DO ALTIUM, .kicad_pcb (KICAD 4+), .brd XML DO EAGLE 6+; FORMATOS ANTIGOS SÃO RECUSADOS COM O MOTIVO
export const readBoardFile = (name: string, bytes: Uint8Array): { board: BoardData, source: string } | null => {
    const lower = name.toLowerCase()

    if (lower.endsWith('.pcbdoc')) {
        if (new TextDecoder().decode(bytes.subarray(0, 64)).includes('|RECORD='))
            throw new Error('PcbDoc em ASCII não é suportado; salve como binário no Altium')

        return { board: readAltium(bytes), source: 'Altium Designer' }
    }

    const text = lower.endsWith('.kicad_pcb') || lower.endsWith('.brd') ? new TextDecoder().decode(bytes) : ''

    if (lower.endsWith('.kicad_pcb'))
        return { board: readKicad(text), source: 'KiCad' }

    if (lower.endsWith('.brd') && text.trimStart().startsWith('PCBNEW-BOARD'))
        throw new Error('placa do KiCad anterior à versão 4 não é suportada; abra e salve no KiCad atual (.kicad_pcb)')

    if (lower.endsWith('.brd') && !text.includes('<eagle'))
        throw new Error('EAGLE binário (anterior à versão 6) não é suportado; salve em XML no EAGLE 6 ou posterior')

    return lower.endsWith('.brd') ? { board: readEagle(text), source: 'EAGLE' } : null
}

// ARQUIVO DE OUTRO PROGRAMA: GERBER/EXCELLON (.zip OU SOLTO) VAI PARA O VISUALIZADOR; PLACA VIRA DOCUMENTO NOVO; NULO SE É ARQUIVO DO PRÓPRIO FRITZING
export const openForeign = async (name: string, bytes: Uint8Array, library: Library, clipper: () => Promise<Clipper>): Promise<{ name: string, layers: GerberLayer[] } | (Imported & { source: string }) | null> => {
    const layers = readFabrication(name, bytes)

    if (layers)
        return { name, layers }

    const found = readBoardFile(name, bytes)
    return found ? { ...await importBoard(found.board, library, await clipper()), source: found.source } : null
}

// PLACA NEUTRA DO DOCUMENTO PARA EXPORTAR: NETS DA PCB COM DOIS OU MAIS MEMBROS VIRAM N1, N2… NA ORDEM DA NETLIST (SPEC 09 §3)
export const exportBoard = (artwork: Artwork, doc: Doc, library: Library, netlist: Netlist | null) => {
    const labels = netlist?.nets.pcbView
    const names  = new Map((netlist?.getGroups('pcbView') ?? []).map((nodes, i) => [labels?.[nodes[0]] ?? -1, `N${i + 1}`]))
    const netOf  = (key: string) => {
        const node = netlist?.index.get(key)
        return node === undefined || !labels ? '' : names.get(labels[node]) ?? ''
    }
    const board  = fromArtwork(artwork, doc, library, netOf)
    const stored = artwork.board.instance.properties.inner

    if (!stored)
        return board

    const { copper, nets, tracks, zones, vias } = JSON.parse(stored) as Stored
    const net    = (name: string) => (nets[name] && netOf(nets[name])) || name
    board.copper = Math.max(board.copper, copper)
    board.inner  = { tracks: tracks.map(track => ({ ...track, net: net(track.net) })), zones: zones.map(zone => ({ ...zone, net: net(zone.net) })), vias: vias.map(via => ({ ...via, net: net(via.net) })) }
    return board
}
