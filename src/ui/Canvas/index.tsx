import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { keyOf, removeEdges, splitKey, type Doc, type Probe, type ProbeKind } from '../../core/Document'
import { apply, boxesTouch, distance, invert, lerp, nearestOnCubic, nearestOnSegment, unionBoxes, type Box, type Point } from '../../core/Geometry'
import { milsToPx } from '../../core/Units'
import { formatReading } from '../../core/Properties'
import type { Library } from '../../core/Library'
import { Scene, WIRE_STYLE, owner } from '../../engine/Scene'
import { bendWire, connectEnd, dragSegment, getAnchor, getCarried, getChangedWires, getObstacles, insertLegPoint, joinWires, moveInstances, moveLabel, removeLegPoint, setLegEnd, setNoteSize, setNoteText, setWireEnds, snapConnections, splitWire, squareWires, tidyWires, type WireEnd } from '../../engine/Edit'
import { getPath, isAxisAligned, simplifyPath, toHeading, type Heading } from '../../engine/Path'
import { getDrawing, getImageText, type PartItem, type WireItem } from '../../engine/Drawing'
import type { Effect, Reading } from '../../engine/Simulation'
import { Glow, Overlay } from '../Effects'
import { ContextMenu, type MenuEntry } from '../ContextMenu'
import { getMenu, type Target } from '../Menus'
import { useStore, type View, type Viewport } from '../Store'
import { PART_MIME } from '../Library'
import { NoteShape } from '../Note'
import { QuickValue } from '../QuickValue'
import { SymbolArt, symbolOf } from '../Symbol'
import { ProbeShape, getProbeOffset, getProbeSize, probeColor } from '../Probe'
import { FEATURED } from '../../core/Featured'
import { getSwitching, isPressedAt, switchOf } from '../../core/Spice'
import { switchText } from '../Inspector'

type Drag =
    { type: 'pan', client: Point, viewport: Viewport, moved: boolean, clear: boolean } |
    { type: 'press', client: Point, first: boolean, moved: boolean } |
    { type: 'marquee', start: Point, end: Point, base: string[], count: number, crossing: boolean } |
    { type: 'move', origin: Doc, start: Point, moved: string[], dx: number, dy: number, stretch: boolean, anchor: Point | null } |
    { type: 'end', origin: Doc, detached: Doc, keys: string[], bend: boolean, anchor: Point | null, moved: boolean, client: Point } |
    { type: 'body', origin: Doc, wire: string, start: Point, curve: boolean, moved: boolean, bend: string[] | null, base: Doc | null } |
    { type: 'segment', origin: Doc, wire: string, start: Point, horizontal: boolean, level: number, moved: boolean } |
    { type: 'leg', origin: Doc, detached: Doc, key: string, moved: boolean, client: Point } |
    { type: 'label', origin: Doc, modelIndex: string, start: Point, moved: boolean } |
    { type: 'grip', origin: Doc, modelIndex: string, start: Point, size: Point } |
    { type: 'probe', origin: Doc, id: string, start: Point, offset: Point, moved: boolean }

type Mode    = 'path' | 'line' | 'shift' | 'free'
type Pointed = { index: string, end: string | null }
type Aim    = { end: WireEnd, heading: Heading }
type Wiring = { from: string[], points: Point[], start: Heading, first: Heading, axis: Heading, cursor: Point, aim: Aim | null, mode: Mode }

const ZOOM_STEP   = 1.0015    // POR PX DE ROLAGEM
const LINE_PX     = 33        // PX POR LINHA QUANDO deltaMode = 1
const ZOOM_MIN    = 0.05
const ZOOM_MAX    = 64
const FIT_MARGIN  = 0.9
const HIT_PX      = 8         // LARGURA DE CLIQUE DE FIOS E RATSNEST NA TELA
const HANDLE_PX   = 6         // RAIO DE CLIQUE NA PONTA DE FIO OU DE PERNA NA TELA
const SNAP_PX     = 16        // O FIO EM DESENHO ENCAIXA NO TERMINAL A ATÉ ISSO NA TELA
const START_PX    = 7         // CLIQUE A ATÉ ISSO DE UM TERMINAL NA TELA COMEÇA UM FIO
const HALO_PX     = 8         // LARGURA EXTRA DO REALCE DE FIO NA TELA
const TEXT_PX     = 11        // TEXTO DE TELA SOBRE O QUADRO
const DRAG_PX     = 3         // DESLOCAMENTO MÍNIMO PARA VIRAR ARRASTE
const ALIGN_PX    = 6         // DURANTE O FIO, O CURSOR A ISSO DA LINHA DO ÚLTIMO PONTO ENCAIXA NELA
const PIN_PX      = 14        // PONTA DE PROVA NO CORPO DA PEÇA VAI PARA O TERMINAL A ATÉ ISSO NA TELA
const CORNER_PX   = 12        // ENCAIXE DA DOBRA NO CANTO COM SHIFT (SPEC 02 §4.3)
const MARK_PX     = 4
const RAT_PX      = 1.5
const RAT_DASH    = '4 3'     // PX DE TELA
const MIN_GRID_PX = 6         // GRADE MAIS FINA QUE ISSO NA TELA NÃO É DESENHADA
const SETTLE_MS   = 150       // FIM DO GESTO DE ZOOM/PAN: SEM EVENTO NESSE INTERVALO O viewBox É REFEITO
const OVERSCAN    = 0.25      // MARGEM DESENHADA FORA DA TELA EM CADA LADO, PARA O PAN NÃO MOSTRAR BORDA VAZIA
const MAX_STRETCH = 2         // AMPLIAÇÃO DO BITMAP NO GESTO ANTES DE REDESENHAR NÍTIDO
const NOTE_MIN    = 30        // PX, MENOR LADO DE UMA NOTA REDIMENSIONADA
const EDITABLE    = '[contenteditable="true"]'
const SELECTED    = 'var(--accent)'
const AIMED       = 'var(--accent)'
const CONNECTED_MARK = '#00ff00'    // NO ESQUEMÁTICO E NA PCB SÓ O TERMINAL SOLTO (VERMELHO) FICA MARCADO
// PCB COM AS CORES DO ALTIUM, SÓ NA TELA (O ARQUIVO E AS EXPORTAÇÕES GUARDAM AS DO FRITZING): COBRE DE CIMA VERMELHO, DE BAIXO AZUL, PAD PASSANTE PRATA, SERIGRAFIA AMARELA, PLACA PRETA
const ALTIUM: Record<string, string> = { copper1: '#ff3030', copper0: '#3d5cff', silkscreen: '#ffff00', silkscreen0: '#9a9a00', groundplane1: '#a81c1c', groundplane: '#25349e', board: '#000000' }
const ALTIUM_TRACE: Record<string, string> = { copper1trace: '#ff3030', copper0trace: '#3d5cff' }
const MULTI_LAYER = '#c8c8c8'
const PCB_GROUND  = '#262626'    // ÁREA DE TRABALHO FORA DA PLACA
const PCB_DOTS    = '#4a4a4a'
const BOTTOM_SIDE = ['copper0', 'copper0trace', 'silkscreen0', 'groundplane']
const TOP_SIDE    = ['copper1', 'copper1trace', 'silkscreen', 'groundplane1']
const DIMMED      = 0.18          // FACE INATIVA (DESIGN.md §3)
const INVERTED    = 'invert(1) hue-rotate(180deg)'    // ESQUEMÁTICO NO TEMA ESCURO: TRAÇOS PRETOS DO FRITZING VIRAM CLAROS, AS CORES MANTÊM O MATIZ

const BACKGROUND: Record<View, string> = { breadboardView: '#ffffff', schematicView: '#ffffff', pcbView: '#333333' }    // FUNDO DO FRITZING, USADO NA EXPORTAÇÃO DA VISTA
const DOT_PX = 1.1     // RAIO DO PONTO DA GRADE NA TELA
const KIND_LINES: Record<ProbeKind, ('V' | 'I')[]> = { voltage: ['V'], current: ['I'], both: ['V', 'I'] }

const images = new Map<string, string>()

const getImage = (library: Library, item: PartItem, view: View, paint: [string, string][]) => {
    const key     = `${item.moduleId}|${item.variant}|${view}|${item.layer}|${item.hidden.join(',')}|${paint.join(';')}|${item.texts.join(';')}|${item.upright}`
    const part    = library.getPart(item.moduleId)
    const options = { hidden: item.hidden, paint, texts: item.texts, fonts: library.fonts, upright: item.upright, layer: item.layer, recolor: item.recolor }

    if (!images.has(key) && part)
        images.set(key, URL.createObjectURL(new Blob([getImageText(part, item.svg, view, options)], { type: 'image/svg+xml' })))

    return images.get(key)
}

const clamp = (zoom: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))

const fit = (bounds: Box | null, [w, h]: Point): Viewport => {
    if (!bounds)
        return { x: -w / 2, y: -h / 2, zoom: 1 }

    const zoom = clamp(Math.min(w / Math.max(1, bounds[2] - bounds[0]), h / Math.max(1, bounds[3] - bounds[1])) * FIT_MARGIN)
    return { x: (bounds[0] + bounds[2]) / 2 - w / zoom / 2, y: (bounds[1] + bounds[3]) / 2 - h / zoom / 2, zoom }
}

// SHIFT: PROJEÇÃO MAIS PRÓXIMA ENTRE HORIZONTAL, VERTICAL E ±45° A PARTIR DA OUTRA PONTA (SPEC 02 §4.3)
const constrain = (anchor: Point, point: Point): Point => {
    const [dx, dy]         = [point[0] - anchor[0], point[1] - anchor[1]]
    const options: Point[] = [[point[0], anchor[1]], [anchor[0], point[1]], [anchor[0] + (dx + dy) / 2, anchor[1] + (dx + dy) / 2], [anchor[0] + (dx - dy) / 2, anchor[1] - (dx - dy) / 2]]
    return options.sort((a, b) => distance(a, point) - distance(b, point))[0]
}

const tiles = new Map<string, string>()

// LADRILHO DA GRADE EM BITMAP (UM PONTO NO CANTO), REPETIDO COMO FUNDO: O PAN SÓ DESLOCA O FUNDO
const gridTile = (cell: number, color: string) => {
    const size = Math.max(1, Math.round(cell))
    const key  = `${size}|${color}`

    if (!tiles.has(key)) {
        const canvas  = Object.assign(document.createElement('canvas'), { width: size, height: size })
        const context = canvas.getContext('2d')

        if (context) {
            context.fillStyle = color
            context.beginPath()
            context.arc(DOT_PX, DOT_PX, DOT_PX, 0, 2 * Math.PI)
            context.fill()
        }

        tiles.set(key, canvas.toDataURL())
    }

    return tiles.get(key)
}

// DESLOCAMENTO E ESCALA QUE LEVAM O QUADRO DESENHADO EM shown AO QUE O GESTO PEDE
const getShift = (shown: Viewport, next: Viewport) => [(shown.x - next.x) * next.zoom, (shown.y - next.y) * next.zoom, next.zoom / shown.zoom]

const covers = ([tx, ty, scale]: number[], [w, h]: Point) => scale <= MAX_STRETCH && tx <= scale * w * OVERSCAN && ty <= scale * h * OVERSCAN && tx + scale * w * (1 + OVERSCAN) >= w && ty + scale * h * (1 + OVERSCAN) >= h

// VALOR DE RÓTULO COMO NO LIVRO: ESPAÇO ENTRE O NÚMERO E A UNIDADE (220Ω → 220 Ω, 4.7kΩ → 4.7 kΩ)
const unitSpace = (text: string) => text.replace(/^(-?[\d.,]+)\s*([pnuµmkMG]?(?:Ω|F|H|V|A|Hz|W|s))$/, '$1 $2')

const toggle = (selection: string[], index: string) => selection.includes(index) ? selection.filter(other => other !== index) : [...selection, index]

const SwitchChip = ({ modelIndex, at, pressed, spdt, timed, zoom }: { modelIndex: string, at: Point, pressed: boolean, spdt: boolean, timed: boolean, zoom: number }) => {
    const text  = switchText(pressed, spdt)
    const width = 30 + text.length * 6.4 + (timed ? 16 : 0)
    return (
        <g data-switch={modelIndex} data-overlay className="switch-chip" transform={`translate(${at[0]} ${at[1]}) scale(${1 / zoom})`}>
            <title>{spdt ? 'Clique para trocar a posição' : pressed ? 'Clique para abrir' : 'Clique para fechar'}{timed ? ' · tem comutação programada no transitório' : ''}</title>
            <rect x={-width / 2} y={-28} width={width} height={20} rx={10} fill="var(--surface)" stroke={pressed ? SELECTED : 'var(--control)'} />
            <path d={pressed ? `M${-width / 2 + 9} -18h10` : `M${-width / 2 + 9} -18l9 -5`} stroke={pressed ? SELECTED : 'var(--muted)'} strokeWidth={1.6} strokeLinecap="round" />
            <circle cx={-width / 2 + 9} cy={-18} r={1.6} fill={pressed ? SELECTED : 'var(--muted)'} />
            <text x={-width / 2 + 24} y={-14} fontSize={TEXT_PX} fontWeight={500} fill={pressed ? 'var(--text)' : 'var(--soft)'} fontFamily="var(--font)">{text}</text>
            {timed && <g transform={`translate(${width / 2 - 13} -18)`} fill="none" stroke="var(--muted)" strokeWidth={1.2} strokeLinecap="round"><circle r={4.5} /><path d="M0 -2.4V0l1.8 1.2" /></g>}
        </g>
    )
}

const modeOf = (event: { shiftKey: boolean, altKey: boolean }, routed: boolean): Mode => event.altKey ? 'free' : event.shiftKey ? 'shift' : routed ? 'path' : 'line'

const GREYED = 'grayscale(1) brightness(0.8)'    // PEÇA FORA DA SIMULAÇÃO (SPEC 04 §8.1)

const PartShape = ({ item, image, effect, greyed, view, lab, art }: { item: PartItem, image: string | undefined, effect: Effect | null, greyed: boolean, view: View, lab: boolean, art: ReactNode }) => (
    <g data-index={item.modelIndex}>
        {effect && view === 'breadboardView' && <Glow item={item} effect={effect} />}
        {art ? <rect width={item.width} height={item.height} transform={`matrix(${item.matrix.join(' ')})`} fill="transparent" /> : <image href={image} width={item.width} height={item.height} preserveAspectRatio="none" transform={`matrix(${item.matrix.join(' ')})`} style={greyed ? { filter: GREYED } : undefined} />}
        {art && <g opacity={greyed ? 0.45 : 1}>{art}</g>}
        {item.legs.map(leg => (
            <g key={leg.key} data-leg={leg.key}>
                <polyline points={leg.points.join(' ')} fill="none" stroke={leg.color} strokeWidth={leg.width} strokeLinecap="round" strokeLinejoin="round" />
                {leg.points.slice(1, -1).map((point, i) => <circle key={i} cx={point[0]} cy={point[1]} r={leg.width / 2} fill={leg.color} />)}
            </g>
        ))}
        {effect && view !== 'pcbView' && <Overlay item={item} effect={effect} view={view} lab={lab} />}
    </g>
)

const WireShape = ({ item }: { item: WireItem }) => (
    <g data-index={item.modelIndex}>
        <path d={item.d} fill="none" stroke="transparent" strokeWidth={item.width + 2} strokeLinecap="round" />
        <path d={item.d} fill="none" stroke="transparent" strokeWidth={HIT_PX} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {item.shadow && <path d={item.d} fill="none" stroke={item.shadow} strokeOpacity={item.opacity} strokeWidth={item.width + 2} strokeLinecap="round" pointerEvents="none" />}
        <path d={item.d} fill="none" stroke={item.color} strokeOpacity={item.opacity} strokeWidth={item.width} strokeLinecap="round" pointerEvents="none" />
    </g>
)

// FIO EM DESENHO: TRECHOS JÁ FIXADOS, PERNA ATÉ O CURSOR, DOBRAS MARCADAS E O ALVO REALÇADO
const WiringShape = ({ points, color, width, zoom, aimed }: { points: Point[], color: string, width: number, zoom: number, aimed: boolean }) => {
    const end = points[points.length - 1]
    return (
        <g pointerEvents="none">
            <polyline points={points.join(' ')} fill="none" stroke={color} strokeOpacity={0.85} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
            {points.slice(1, -1).map((point, i) => <circle key={i} cx={point[0]} cy={point[1]} r={width * 0.9} fill={color} />)}
            <circle cx={end[0]} cy={end[1]} r={(aimed ? 7 : 4) / zoom} fill={aimed ? AIMED : 'none'} fillOpacity={0.25} stroke={aimed ? AIMED : color} strokeWidth={1.5 / zoom} />
        </g>
    )
}

export const Canvas = () => {
    const doc       = useStore(state => state.doc)
    const view      = useStore(state => state.view)
    const library   = useStore(state => state.library)
    const netlist   = useStore(state => state.netlist)
    const selection = useStore(state => state.selection)
    const hover     = useStore(state => state.hover)
    const viewport  = useStore(state => state.viewports[state.view])
    const size      = useStore(state => state.size)
    const simulated = useStore(state => state.simulation)
    const drc       = useStore(state => state.drc)
    const tool      = useStore(state => state.tool)
    const focused   = useStore(state => state.probe)
    const theme     = useStore(state => state.theme)
    const side      = useStore(state => state.side)
    const placing   = useStore(state => state.placing)
    const values    = useStore(state => state.show.values)
    const { preview, commit, select, setHover, setViewport, setSize, connect, addPart, getGrid, drawWire, tidy, isOrthogonal, setTool, addProbe, updateProbe, removeProbes, selectProbe, setPlacing } = useStore.getState()

    const svgRef              = useRef<SVGSVGElement>(null)
    const liveRef             = useRef<Viewport | null>(null)
    const shownRef            = useRef<Viewport>({ x: 0, y: 0, zoom: 1 })
    const settleRef           = useRef<ReturnType<typeof setTimeout>>(undefined)
    const spaceRef            = useRef(false)
    const wiringRef           = useRef<Wiring | null>(null)
    const [drag, setDrag]     = useState<Drag | null>(null)
    const [wiring, setWiring] = useState<Wiring | null>(null)
    const [menu, setMenu]     = useState<{ x: number, y: number, items: MenuEntry[] } | null>(null)
    const [editing, setEditing] = useState<string | null>(null)
    const [pointed, setPointed] = useState<Pointed | null>(null)
    const [focus, setFocus]     = useState(0)
    const closeMenu           = useCallback(() => setMenu(null), [])
    const scene               = useMemo(() => new Scene(doc, library, view), [doc, library, view])
    const drawing             = useMemo(() => getDrawing(scene, netlist), [scene, netlist])
    const obstacles           = useMemo(() => getObstacles(scene), [scene])
    const result              = simulated.enabled && view !== 'pcbView' ? simulated.result : null
    const effects             = useMemo(() => result?.getEffects(simulated.step) ?? null, [result, simulated.step])
    const running             = useMemo(() => new Set(result?.circuit.simulated), [result])
    const readings            = useMemo(() => new Map(result ? doc.probes.map(probe => [probe.id, result.getProbe(probe.id)] as const) : []), [result, doc.probes])
    const flagged             = useMemo(() => {
        const back = drc ? invert(drc.frame) : null
        return drc && back && view === 'pcbView' ? drc.violations.map(violation => violation.polygons.map(polygon => `M${Array.from({ length: polygon.length / 2 }, (_, k) => apply(back, polygon[2 * k], polygon[2 * k + 1]).join(' ')).join('L')}Z`).join('')) : []
    }, [drc, view])
    const wireItems  = useMemo(() => new Map(drawing.items.flatMap(item => item.type === 'wire' ? [[item.modelIndex, item] as const] : [])), [drawing])
    const plans      = useMemo(() => getSwitching(doc), [doc])
    const probing    = tool !== 'select' && tool !== 'area'
    const settings   = doc.settings[view] ?? {}
    const dotColor   = useMemo(() => view === 'pcbView' ? PCB_DOTS : theme && getComputedStyle(document.documentElement).getPropertyValue('--grid-dot').trim(), [theme, view]) || '#2a292e'
    const grid       = getGrid()
    const align      = settings.alignToGrid !== '0'
    const orthogonal = isOrthogonal(view)
    const routed     = orthogonal || view === 'pcbView'
    const vp         = viewport ?? { x: 0, y: 0, zoom: 1 }

    wiringRef.current = wiring

    useEffect(() => {
        const element  = svgRef.current?.parentElement
        const observer = new ResizeObserver(([entry]) => setSize([entry.contentRect.width, entry.contentRect.height]))

        if (element)
            observer.observe(element)

        return () => observer.disconnect()
    }, [setSize])

    useEffect(() => {
        if (!viewport && size[0] && size[1])
            setViewport(view, fit(unionBoxes([drawing.bounds, ...doc.probes.filter(probe => probe.view === view).map(probeBox)]), size))
    }, [viewport, size, drawing.bounds, view, setViewport])

    useEffect(() => setWiring(null), [view, tool])

    const transformTo = useCallback((next: Viewport | null) => {
        const [tx, ty, scale] = next ? getShift(shownRef.current, next) : []

        if (svgRef.current)
            svgRef.current.style.transform = next ? `translate(${tx}px, ${ty}px) scale(${scale})` : ''
    }, [])

    useLayoutEffect(() => {
        shownRef.current = vp
        transformTo(liveRef.current)
    }, [vp, transformTo])

    const settle = useCallback(() => {
        const next = liveRef.current
        clearTimeout(settleRef.current)
        liveRef.current = null

        if (next)
            setViewport(view, next)
    }, [view, setViewport])

    useLayoutEffect(() => settle, [settle])    // TROCA DE VISTA OU DESMONTAGEM NO MEIO DO GESTO FIXA O QUE JÁ FOI MOSTRADO

    // DURANTE O GESTO SÓ O TRANSFORM CSS MUDA (COMPOSITOR); O viewBox É REFEITO QUANDO O GESTO PARA OU O QUADRO JÁ NÃO COBRE A TELA
    const showLive = useCallback((next: Viewport) => {
        liveRef.current = next
        clearTimeout(settleRef.current)

        if (!covers(getShift(shownRef.current, next), size))
            return settle()

        transformTo(next)
        settleRef.current = setTimeout(settle, SETTLE_MS)
    }, [transformTo, settle, size])

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.code === 'Space' && !(event.target as HTMLElement).closest(`input, select, textarea, ${EDITABLE}`))
                spaceRef.current = event.type === 'keydown'
        }

        // DURANTE O FIO: Esc CANCELA E Backspace/Delete DESFAZ A ÚLTIMA DOBRA, SEM CHEGAR AOS ATALHOS GERAIS
        const onWiringKey = (event: KeyboardEvent) => {
            const current = wiringRef.current

            if (!current || !['Escape', 'Backspace', 'Delete'].includes(event.key))
                return

            event.preventDefault()
            event.stopImmediatePropagation()

            if (event.key === 'Escape' || current.points.length < 2)
                return setWiring(null)

            const points = current.points.slice(0, -1)
            setWiring({ ...current, points, start: points.length === 1 ? current.first : null, axis: null })
        }

        window.addEventListener('keydown', onWiringKey, true)
        window.addEventListener('keydown', onKey)
        window.addEventListener('keyup', onKey)
        return () => {
            window.removeEventListener('keydown', onWiringKey, true)
            window.removeEventListener('keydown', onKey)
            window.removeEventListener('keyup', onKey)
        }
    }, [])

    useEffect(() => {
        const element = svgRef.current

        // RODA (E PINÇA) DÁ ZOOM EM TORNO DO CURSOR; SHIFT+RODA MOVE A VISTA
        const onWheel = (event: WheelEvent) => {
            const rect     = element?.parentElement?.getBoundingClientRect()
            const base     = liveRef.current ?? shownRef.current
            const [sx, sy] = [event.clientX - (rect?.left ?? 0), event.clientY - (rect?.top ?? 0)]
            const scale    = event.deltaMode === 1 ? LINE_PX : 1
            const zoom     = clamp(base.zoom * ZOOM_STEP ** -(event.deltaY * scale))
            event.preventDefault()

            if (event.shiftKey)
                return showLive({ ...base, x: base.x + (event.deltaX || event.deltaY) * scale / base.zoom, y: base.y + (event.deltaX ? event.deltaY * scale : 0) / base.zoom })

            showLive({ x: base.x + sx / base.zoom - sx / zoom, y: base.y + sy / base.zoom - sy / zoom, zoom })
        }

        element?.addEventListener('wheel', onWheel, { passive: false })
        return () => element?.removeEventListener('wheel', onWheel)
    }, [showLive])

    const toScene = (clientX: number, clientY: number): Point => {
        const rect = svgRef.current?.parentElement?.getBoundingClientRect()
        const seen = liveRef.current ?? vp
        return [seen.x + (clientX - (rect?.left ?? 0)) / seen.zoom, seen.y + (clientY - (rect?.top ?? 0)) / seen.zoom]
    }

    const snap      = (value: number) => align ? Math.round(value / grid) * grid : value
    const snapPoint = (point: Point): Point => [snap(point[0]), snap(point[1])]
    const handle    = (width: number) => Math.max(HANDLE_PX / vp.zoom, width / 2 + 1)
    const far       = (from: Point, to: Point) => distance(from, to) > DRAG_PX
    const isBoard   = (modelIndex: string) => library.getPart(doc.instances[modelIndex]?.moduleIdRef ?? '')?.kind === 'breadboard'
    const startKey  = (point: Point) => scene.getConnectorNear(point, START_PX / vp.zoom, modelIndex => !scene.isWire(modelIndex) && !isBoard(modelIndex))
    const pinName   = (key: string) => `${doc.instances[owner(key)]?.title ?? ''}.${scene.getConnector(key)?.name ?? ''}`

    // TRECHOS DE FIO LIGADOS POR DOBRAS: O FIO INTEIRO DE UM TERMINAL A OUTRO
    const chainOf = (wires: string[]): string[] => {
        const next = [...new Set(wires.flatMap(wire => scene.getKeys(wire).flatMap(key => scene.getPartners(key)).map(owner)))].filter(other => scene.isWire(other) && !wires.includes(other))
        return next.length ? chainOf([...wires, ...next]) : wires
    }

    const hitEnd = (wire: string, point: Point) => {
        const ends  = scene.getWireEnds(wire)
        const width = milsToPx(scene.getView(wire)?.wire?.mils ?? 0)
        const near  = ends?.map((end, i) => [i, distance(end, point)] as const).filter(([, d]) => d <= handle(width)).sort((a, b) => a[1] - b[1])[0]
        return near ? `${wire}/connector${near[0]}` : null
    }

    const nearLegEnd = (key: string, point: Point) => {
        const points = scene.getLegPoints(key)
        const width  = scene.getPins(owner(key)).get(splitKey(key)[1])?.leg?.width ?? 0
        return points ? distance(points[points.length - 1], point) <= handle(width) : false
    }

    const pick = (index: string, additive: boolean) => {
        const chosen = additive                  ? toggle(selection, index) :
                       selection.includes(index) ? selection : [index]
        select(chosen)
        return chosen
    }

    const carried = (chosen: string[]) => [...new Set(chosen.filter(modelIndex => !scene.isWire(modelIndex) && !scene.getView(modelIndex)?.locked).flatMap(modelIndex => getCarried(doc, library, view, modelIndex)))]

    const placeEnd = (current: Extract<Drag, { type: 'end' }>, point: Point, shift: boolean): Point => {
        const snapped = snapPoint(point)

        if (!shift || !current.anchor)
            return snapped

        const neighbors = current.keys.map(key => scene.getWireEnds(owner(key))?.[key.endsWith('connector0') ? 1 : 0]).filter((end): end is Point => end !== undefined)
        const corners   = neighbors.flatMap(a => neighbors.filter(b => b !== a).map((b): Point => [a[0], b[1]]))
        const corner    = corners.find(candidate => distance(candidate, point) <= CORNER_PX)
        return corner ?? constrain(current.anchor, point)
    }

    // ONDE O FIO EM DESENHO TERMINA SE O CLIQUE FOR AQUI: PINO DE PEÇA, PONTA OU DOBRA DE FIO (PREFERINDO O PINO EM QUE ELA ESTÁ) OU O MEIO DE UM FIO (JUNÇÃO EM T)
    const aimAt = (point: Point, element: Element | null, from: string[]): Aim | null => {
        const skip  = new Set(from.map(owner).filter(index => scene.isWire(index)))
        const key   = scene.getConnectorNear(point, SNAP_PX / vp.zoom, modelIndex => !skip.has(modelIndex))
        const index = element?.closest('[data-index]')?.getAttribute('data-index') ?? ''
        const ends  = index && !skip.has(index) && scene.isWire(index) && !scene.getWireCurve(index) ? scene.getWireEnds(index) : null

        if (key && from.includes(key))
            return null

        if (key && !scene.isWire(owner(key)))
            return { end: { keys: [key], wire: null, point: scene.getTerminal(key) ?? point }, heading: scene.getHeading(key) }

        if (key) {
            const pin  = scene.getPartners(key).find(partner => !scene.isWire(owner(partner)))
            const bend = scene.getBendpoint(key)
            return { end: { keys: pin ? [pin] : bend ?? [key], wire: null, point: scene.getTerminal(key) ?? point }, heading: pin ? scene.getHeading(pin) : null }
        }

        if (!ends)
            return null

        const along   = lerp(ends[0], ends[1], nearestOnSegment(ends[0], ends[1], point))
        const [x0, x1] = [Math.min(ends[0][0], ends[1][0]), Math.max(ends[0][0], ends[1][0])]
        const [y0, y1] = [Math.min(ends[0][1], ends[1][1]), Math.max(ends[0][1], ends[1][1])]
        const spot: Point = isAxisAligned(...ends) ? [Math.min(x1, Math.max(x0, snap(along[0]))), Math.min(y1, Math.max(y0, snap(along[1])))] : along
        return { end: { keys: [], wire: index, point: spot }, heading: null }
    }

    // CURSOR LIVRE DO FIO: NA GRADE, ENCAIXADO NA LINHA DO ÚLTIMO PONTO QUANDO PERTO DELA; COM SHIFT A 0°/45°/90° DELE; COM ALT SEM GRADE
    const freePoint = (current: Wiring, point: Point, mode: Mode): Point => {
        const last    = current.points[current.points.length - 1]
        const snapped = snapPoint(point)
        const near    = (a: number, b: number) => Math.abs(a - b) * vp.zoom < ALIGN_PX

        if (mode === 'free')
            return point

        if (mode === 'shift')
            return constrain(last, snapped)

        return [near(snapped[0], last[0]) ? last[0] : snapped[0], near(snapped[1], last[1]) ? last[1] : snapped[1]]
    }

    const legOf = (current: Wiring): Point[] => {
        const last = current.points[current.points.length - 1]
        const end  = current.aim?.end.point ?? current.cursor
        const path = current.mode === 'path' ? getPath(last, end, { ...obstacles, start: current.start, end: current.aim?.heading ?? null, axis: current.axis, grid: align ? grid : 0, diagonal: view === 'pcbView' }) : []
        return [...path, end]
    }

    const startWiring = (from: string[], point: Point, heading: Heading, event: { shiftKey: boolean, altKey: boolean }) => {
        setWiring({ from, points: [point], start: heading, first: heading, axis: null, cursor: point, aim: null, mode: modeOf(event, routed) })
        setHover(null)
        setPointed(null)
    }

    // CLIQUE (SEM ARRASTE) NUMA PONTA DE FIO COMEÇA UM FIO NOVO: DO PINO EM QUE ELA ESTÁ, DA DOBRA INTEIRA OU CONTINUANDO A PONTA SOLTA; NA PONTA DE PERNA DOBRÁVEL, DO CONECTOR DELA
    const resume = (keys: string[], point: Point, bend: boolean, event: { shiftKey: boolean, altKey: boolean }) => {
        const pin = bend ? undefined : scene.getPartners(keys[0]).find(partner => !scene.isWire(owner(partner)))
        startWiring(pin ? [pin] : keys, scene.getTerminal(keys[0]) ?? point, pin ? scene.getHeading(pin) : bend ? null : scene.getHeading(keys[0]), event)
    }

    const addBend = (current: Wiring) => {
        const points = [...current.points, ...legOf(current)]
        const [p, q] = points.slice(-2)
        const along  = p && q ? toHeading([q[0] - p[0], q[1] - p[1]]) : null
        setWiring({ ...current, points, start: null, axis: along && [Math.abs(along[1]), Math.abs(along[0])], aim: null })
    }

    const finishWiring = (current: Wiring, aim: Aim | null) => {
        const points = [...current.points, ...legOf({ ...current, aim })]
        setWiring(null)
        setHover(null)

        if (simplifyPath(points).length >= 2)
            void drawWire(current.from, aim?.end ?? null, points)
    }

    const follow = (current: Wiring, point: Point, clientX: number, clientY: number, event: { shiftKey: boolean, altKey: boolean }): Wiring => {
        const mode = modeOf(event, routed)
        const aim  = aimAt(point, document.elementFromPoint(clientX, clientY), current.from)
        return { ...current, cursor: freePoint(current, point, mode), aim, mode }
    }

    // PONTA DE PROVA NO FIO (NO PONTO MAIS PRÓXIMO DO CLIQUE) OU NO TERMINAL DA PEÇA SOB O CURSOR (OU A ATÉ PIN_PX DELE)
    const placeProbe = (point: Point, target: Element, keep: boolean) => {
        const index = target.closest('[data-index]')?.getAttribute('data-index') ?? ''
        const ends  = scene.isWire(index) ? scene.getWireEnds(index) : null
        const curve = scene.getWireCurve(index)
        const t     = ends ? curve ? nearestOnCubic(ends[0], curve[0], curve[1], ends[1], point) : nearestOnSegment(ends[0], ends[1], point) : 0
        const near  = index && !ends ? scene.getKeys(index).map(key => [key, distance(scene.getTerminal(key) ?? [Infinity, Infinity], point)] as const).filter(([, d]) => d * vp.zoom <= PIN_PX).sort((a, b) => a[1] - b[1])[0]?.[0] : null
        const key   = ends ? keyOf(index, 'connector0') : index ? scene.getConnectorAt(point, modelIndex => modelIndex === index) ?? near : null

        if (!key || tool === 'select' || tool === 'area')
            return useStore.setState({ message: 'clique num fio ou no terminal de uma peça para medir' })

        const spot   = ends ? scene.getPointOn(index, Math.min(0.9, Math.max(0.1, t))) : scene.getTerminal(key)
        const taken  = [...obstacles.boxes, ...drawing.labels.flatMap(label => label.box ? [label.box] : []), ...doc.probes.filter(probe => probe.view === view).map(probeBox).filter((box): box is Box => box !== null)]
        addProbe({ kind: tool, view, key, t: Math.min(0.9, Math.max(0.1, t)), offset: spot ? getProbeOffset(spot, `P${doc.probes.length + 1}`, tool === 'both' ? 2 : 1, taken) : [8, -14], flip: false })

        if (!keep)
            setTool('select')
    }

    const probeAnchor = (probe: Probe) => scene.isWire(owner(probe.key)) ? scene.getPointOn(owner(probe.key), probe.t) : scene.getTerminal(probe.key)

    const probeAlong = (probe: Probe): Point | null => {
        const ends    = scene.isWire(owner(probe.key)) ? scene.getWireEnds(owner(probe.key)) : null
        const length  = ends ? distance(...ends) : 0
        const heading = ends ? null : scene.getHeading(probe.key)
        const sign    = probe.flip ? -1 : 1
        const along   = ends && length > 0 ? [(ends[1][0] - ends[0][0]) / length, (ends[1][1] - ends[0][1]) / length] : heading ? [-heading[0], -heading[1]] : null
        return probe.kind === 'voltage' || !along ? null : [along[0] * sign, along[1] * sign]
    }

    const probeLines = (probe: Probe) => {
        const reading = readings.get(probe.id)
        const at      = simulated.step
        const value   = (series: Reading['voltage'] | undefined, unit: string) => series ? formatReading(series[Math.min(at, series.length - 1)] ?? 0, unit) : `— ${unit}`
        return values ? KIND_LINES[probe.kind].map(kind => kind === 'V' ? value(reading?.voltage, 'V') : value(reading?.current, 'A')) : []
    }

    const probeBox = (probe: Probe): Box | null => {
        const anchor = probeAnchor(probe)
        const [w, h] = getProbeSize(probe.id, probeLines(probe))
        return anchor && [anchor[0] + probe.offset[0], anchor[1] + probe.offset[1], anchor[0] + probe.offset[0] + w, anchor[1] + probe.offset[1] + h]
    }

    const probeMenu = (probe: Probe): MenuEntry[] => [
        { label: 'Medir tensão', checked: probe.kind === 'voltage', apply: () => updateProbe(probe.id, { kind: 'voltage' }) },
        { label: 'Medir corrente', checked: probe.kind === 'current', apply: () => updateProbe(probe.id, { kind: 'current' }) },
        { label: 'Medir tensão e corrente', checked: probe.kind === 'both', apply: () => updateProbe(probe.id, { kind: 'both' }) },
        null,
        { label: 'Inverter sentido da corrente', disabled: probe.kind === 'voltage', apply: () => updateProbe(probe.id, { flip: !probe.flip }) },
        null,
        { label: 'Remover ponta de prova', shortcut: 'Delete', apply: () => removeProbes([probe.id]) }
    ]

    const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
        const point   = toScene(event.clientX, event.clientY)
        const target  = event.target as Element
        const client: Point = [event.clientX, event.clientY]
        const element = target.closest('[data-switch], [data-probe], [data-rat], [data-label], [data-leg], [data-grip], [data-index]')
        const flipped = element?.getAttribute('data-switch')
        const probeId = element?.getAttribute('data-probe')
        const rat     = element?.getAttribute('data-rat')
        const label   = element?.getAttribute('data-label')
        const leg     = element?.getAttribute('data-leg') ?? null
        const grip    = element?.getAttribute('data-grip')
        const index   = element?.getAttribute('data-index') ?? grip ?? (leg ? owner(leg) : '')
        const found   = doc.probes.find(probe => probe.id === probeId)

        if (event.button === 2 || target.closest(EDITABLE))
            return

        event.currentTarget.setPointerCapture(event.pointerId)
        setMenu(null)

        if (event.button === 1 || spaceRef.current)
            return setDrag({ type: 'pan', client, viewport: liveRef.current ?? vp, moved: false, clear: false })

        if (wiring)
            return setDrag({ type: 'press', client, first: false, moved: false })

        if (placing) {
            void addPart(placing, point)
            return event.shiftKey ? undefined : setPlacing(null)
        }

        if (flipped)
            return void useStore.getState().toggleSwitch(flipped)

        if (probing)
            return placeProbe(point, target, event.shiftKey)

        if (found) {
            selectProbe(found.id)
            return setDrag({ type: 'probe', origin: doc, id: found.id, start: point, offset: found.offset, moved: false })
        }

        const near = element ? null : startKey(point)

        if (near && !scene.getLegPoints(near)) {
            startWiring([near], scene.getTerminal(near) ?? point, scene.getHeading(near), event)
            return setDrag({ type: 'press', client, first: true, moved: false })
        }

        if (!element && (event.shiftKey || event.ctrlKey || event.metaKey || tool === 'area'))
            return setDrag({ type: 'marquee', start: point, end: point, base: event.shiftKey ? selection : [], count: 0, crossing: false })

        if (!element)
            return setDrag({ type: 'pan', client, viewport: liveRef.current ?? vp, moved: false, clear: true })

        if (rat)
            return void connect(drawing.ratsnest[Number(rat)].from, drawing.ratsnest[Number(rat)].to)

        if (grip) {
            const bounds = scene.getBounds(grip)
            pick(grip, false)
            return setDrag({ type: 'grip', origin: doc, modelIndex: grip, start: point, size: bounds ? [bounds[2] - bounds[0], bounds[3] - bounds[1]] : [NOTE_MIN, NOTE_MIN] })
        }

        if (label) {
            pick(label, event.shiftKey)
            return setDrag({ type: 'label', origin: doc, modelIndex: label, start: point, moved: false })
        }

        if (leg && nearLegEnd(leg, point)) {
            pick(index, false)
            return setDrag({ type: 'leg', origin: doc, detached: removeEdges(doc, edge => edge.includes(leg)), key: leg, moved: false, client })
        }

        if (scene.isWire(index)) {
            const end  = hitEnd(index, point)
            const ends = scene.getWireEnds(index)
            pick(index, event.shiftKey)

            if (end && event.altKey) {
                startWiring(scene.getBendpoint(end) ?? [end], scene.getTerminal(end) ?? point, scene.getBendpoint(end) ? null : scene.getHeading(end), event)
                return setDrag({ type: 'press', client, first: true, moved: false })
            }

            if (end) {
                const bend   = scene.getBendpoint(end)
                const anchor = ends?.[end.endsWith('connector0') ? 1 : 0] ?? null
                return setDrag({ type: 'end', origin: doc, detached: bend ? doc : removeEdges(doc, edge => edge.includes(end)), keys: bend ?? [end], bend: bend !== null, anchor, moved: false, client })
            }

            if (!scene.getKeys(index).some(key => scene.getPartners(key).length))
                return setDrag({ type: 'move', origin: doc, start: point, moved: [index], dx: 0, dy: 0, stretch: false, anchor: null })

            if (orthogonal && ends && isAxisAligned(...ends) && !scene.getWireCurve(index) && !event.ctrlKey && !event.metaKey && !event.altKey) {
                const horizontal = Math.abs(ends[0][1] - ends[1][1]) < Math.abs(ends[0][0] - ends[1][0])
                return setDrag({ type: 'segment', origin: doc, wire: index, start: point, horizontal, level: horizontal ? ends[0][1] : ends[0][0], moved: false })
            }

            return setDrag({ type: 'body', origin: doc, wire: index, start: point, curve: event.ctrlKey || event.metaKey, moved: false, bend: null, base: null })
        }

        const key = scene.getConnectorAt(point, modelIndex => modelIndex === index) ?? (isBoard(index) ? null : startKey(point))

        if (key && !scene.getLegPoints(key)) {
            startWiring([key], scene.getTerminal(key) ?? point, scene.getHeading(key), event)
            return setDrag({ type: 'press', client, first: true, moved: false })
        }

        const moved = carried(pick(index, event.shiftKey))

        if (moved.length)
            setDrag({ type: 'move', origin: doc, start: point, moved, dx: 0, dy: 0, stretch: event.altKey, anchor: getAnchor(scene, index) })
    }

    const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
        const point  = toScene(event.clientX, event.clientY)
        const client: Point = [event.clientX, event.clientY]
        const index  = (event.target as Element).closest('[data-index]')?.getAttribute('data-index')
        const moving = (start: Point) => distance(start, point) * vp.zoom > DRAG_PX

        const next   = wiring && drag?.type !== 'pan' ? follow(wiring, point, event.clientX, event.clientY, event) : null

        if (next)
            setWiring(next)

        if (next && !drag)
            return setHover(next.aim?.end.keys[0] ?? null)

        if (!drag) {
            const end = index && scene.isWire(index) ? hitEnd(index, point) : null

            if (index !== pointed?.index || end !== pointed?.end)
                setPointed(index ? { index, end } : null)

            return setHover(probing ? null : (index && !scene.isWire(index) ? scene.getConnectorAt(point, modelIndex => modelIndex === index) : null) ?? startKey(point))
        }

        if (drag.type === 'press' && far(drag.client, client) && drag.first && !drag.moved)
            return setDrag({ ...drag, moved: true })

        if (drag.type === 'press' && far(drag.client, client) && !drag.first)
            return setDrag({ type: 'pan', client: drag.client, viewport: liveRef.current ?? vp, moved: true, clear: false })

        if (drag.type === 'pan') {
            if (!drag.moved && far(drag.client, client))
                setDrag({ ...drag, moved: true })

            return showLive({ ...drag.viewport, x: drag.viewport.x - (event.clientX - drag.client[0]) / drag.viewport.zoom, y: drag.viewport.y - (event.clientY - drag.client[1]) / drag.viewport.zoom })
        }

        if (drag.type === 'marquee') {
            const box: Box = [Math.min(drag.start[0], point[0]), Math.min(drag.start[1], point[1]), Math.max(drag.start[0], point[0]), Math.max(drag.start[1], point[1])]
            const crossing = point[0] < drag.start[0]
            const inside   = Object.values(doc.instances).filter(instance => scene.isShown(instance) && !scene.getView(instance.modelIndex)?.locked).map(instance => instance.modelIndex).filter(modelIndex => {
                const bounds = scene.getBounds(modelIndex)
                return bounds && (crossing ? boxesTouch(bounds, box) : bounds[0] >= box[0] && bounds[1] >= box[1] && bounds[2] <= box[2] && bounds[3] <= box[3])
            })
            select([...new Set([...drag.base, ...inside])])
            return setDrag({ ...drag, end: point, count: inside.length, crossing })
        }

        if ((drag.type === 'end' || drag.type === 'leg') && !drag.moved && !far(drag.client, client))
            return

        if (drag.type === 'end') {
            const moved = setWireEnds(drag.detached, view, drag.keys.map(key => [key, placeEnd(drag, point, event.shiftKey)]))
            preview(orthogonal ? squareWires(drag.origin, moved, library, view, grid) : moved)
            setHover(drag.bend ? null : scene.getConnectorAt(point, modelIndex => modelIndex !== owner(drag.keys[0])))
            return setDrag({ ...drag, moved: true })
        }

        if (drag.type === 'body' && drag.curve) {
            preview(bendWire(drag.origin, view, drag.wire, drag.start, point))
            return setDrag({ ...drag, moved: true })
        }

        if (drag.type === 'body') {
            const split = drag.base && drag.bend ? { doc: drag.base, bend: drag.bend } : moving(drag.start) ? splitWire(drag.origin, view, drag.wire, drag.start) : null

            if (!split?.bend)
                return

            preview(setWireEnds(split.doc, view, split.bend.map(key => [key, snapPoint(point)])))
            return setDrag({ ...drag, moved: true, bend: split.bend, base: split.doc })
        }

        if (drag.type === 'segment') {
            const raw   = drag.horizontal ? point[1] - drag.start[1] : point[0] - drag.start[0]
            const shift = snap(drag.level + raw) - drag.level

            if (!drag.moved && !moving(drag.start))
                return

            preview(dragSegment(drag.origin, library, view, drag.wire, drag.horizontal ? [0, shift] : [shift, 0]))
            return setDrag({ ...drag, moved: true })
        }

        if (drag.type === 'leg') {
            preview(setLegEnd(drag.detached, library, view, drag.key, point))
            setHover(scene.getConnectorAt(point, modelIndex => modelIndex !== owner(drag.key)))
            return setDrag({ ...drag, moved: true })
        }

        if (drag.type === 'label') {
            preview(moveLabel(drag.origin, view, drag.modelIndex, point[0] - drag.start[0], point[1] - drag.start[1]))
            return setDrag({ ...drag, moved: true })
        }

        if (drag.type === 'grip')
            return preview(setNoteSize(drag.origin, view, drag.modelIndex, [Math.max(NOTE_MIN, drag.size[0] + point[0] - drag.start[0]), Math.max(NOTE_MIN, drag.size[1] + point[1] - drag.start[1])]))

        if (drag.type === 'probe') {
            const offset: Point = [drag.offset[0] + point[0] - drag.start[0], drag.offset[1] + point[1] - drag.start[1]]
            preview({ ...drag.origin, probes: drag.origin.probes.map(probe => probe.id === drag.id ? { ...probe, offset } : probe) })
            return setDrag({ ...drag, moved: true })
        }

        if (drag.type !== 'move')
            return

        const raw      = [point[0] - drag.start[0], point[1] - drag.start[1]]
        const [dx, dy] = drag.anchor && align ? [snap(drag.anchor[0] + raw[0]) - drag.anchor[0], snap(drag.anchor[1] + raw[1]) - drag.anchor[1]] : [snap(raw[0]), snap(raw[1])]

        if (dx === drag.dx && dy === drag.dy)
            return

        const moved = moveInstances(drag.origin, library, view, drag.moved, dx, dy, drag.stretch)
        preview(orthogonal ? squareWires(drag.origin, moved, library, view, grid) : moved)
        setDrag({ ...drag, dx, dy })
    }

    const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
        const point = toScene(event.clientX, event.clientY)

        if (drag?.type === 'press' && wiring) {
            const current = follow(wiring, point, event.clientX, event.clientY, event)
            const clicked = !drag.first || drag.moved

            if (clicked && current.aim)
                finishWiring(current, current.aim)

            if (clicked && !current.aim)
                addBend(current)
        }

        if (drag?.type === 'pan')
            settle()

        if (drag?.type === 'marquee' && distance(drag.start, drag.end) * vp.zoom <= DRAG_PX && !drag.base.length) {
            select([])
            selectProbe(null)
        }

        if (drag?.type === 'pan' && !drag.moved && drag.clear) {
            select([])
            selectProbe(null)
        }

        if (drag?.type === 'move' && (drag.dx || drag.dy))
            commit(view === 'breadboardView' ? snapConnections(tidy(drag.origin, doc), library, drag.moved) : tidy(drag.origin, doc), drag.origin)

        if (drag?.type === 'end' && drag.moved)
            commit(tidy(drag.origin, drag.bend ? doc : connectEnd(doc, library, view, drag.keys[0])), drag.origin)

        if (drag?.type === 'end' && !drag.moved)
            resume(drag.keys, point, drag.bend, event)

        if (drag?.type === 'body' && drag.moved)
            commit(doc, drag.origin)

        if (drag?.type === 'segment' && drag.moved)
            commit(tidyWires(doc, library, view, getChangedWires(drag.origin, doc, view)), drag.origin)

        if (drag?.type === 'leg' && drag.moved)
            commit(connectEnd(doc, library, view, drag.key), drag.origin)

        if (drag?.type === 'leg' && !drag.moved)
            startWiring([drag.key], scene.getTerminal(drag.key) ?? point, scene.getHeading(drag.key), event)

        if ((drag?.type === 'label' || drag?.type === 'probe') && drag.moved)
            commit(doc, drag.origin)

        if (drag?.type === 'grip')
            commit(doc, drag.origin)

        setDrag(null)
    }

    const onPointerCancel = () => {
        if (drag && 'origin' in drag)
            preview(drag.origin)

        setDrag(null)
    }

    const onDoubleClick = (event: MouseEvent<SVGSVGElement>) => {
        const point   = toScene(event.clientX, event.clientY)
        const element = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-leg], [data-index]')
        const leg     = element?.getAttribute('data-leg')
        const index   = element?.getAttribute('data-index') ?? ''

        if (wiring || probing)
            return

        if (leg) {
            const inner = (scene.getLegPoints(leg) ?? []).slice(1, -1).some(vertex => distance(vertex, point) <= handle(0))
            return commit(inner ? removeLegPoint(doc, library, view, leg, point) : insertLegPoint(doc, library, view, leg, point))
        }

        if (library.getPart(doc.instances[index]?.moduleIdRef ?? '')?.kind === 'note')
            return setEditing(index)

        if (!scene.isWire(index)) {
            if (index && switchOf(library.getPart(doc.instances[index]?.moduleIdRef ?? '')))
                return void useStore.getState().toggleSwitch(index)

            if (index)
                setFocus(focus + 1)

            return
        }

        const end  = hitEnd(index, point)
        const bend = end ? scene.getBendpoint(end) : null

        if (end && bend?.length === 2)
            return commit(joinWires(doc, library, view, end))

        if (!end)
            commit(splitWire(doc, view, index, point).doc)
    }

    const pressedAt = (modelIndex: string, pressed: boolean) => plans[modelIndex] && result?.circuit.analysis.type === 'tran' ? isPressedAt(plans[modelIndex], pressed, result.getTime(simulated.step)) : pressed

    // CHAVE PROGRAMADA DURANTE O TRANSITÓRIO: NO INSTANTE MOSTRADO, A IMAGEM DA OUTRA POSIÇÃO QUANDO A PROGRAMAÇÃO JÁ A TROCOU
    const timedItem = (item: PartItem): PartItem => {
        const known = plans[item.modelIndex] ? switchOf(library.getPart(item.moduleId)) : null
        const other = known && pressedAt(item.modelIndex, known.pressed) !== known.pressed ? known.pressed ? plans[item.modelIndex].released : plans[item.modelIndex].pressed : null
        const svg   = other ? library.getSvg(other, view) : undefined
        return other && svg ? { ...item, moduleId: other, svg } : item
    }

    const dimmed = (layer: string) => (side === 'top' && BOTTOM_SIDE.includes(layer)) || (side === 'bottom' && TOP_SIDE.includes(layer))

    // CAMADA DA PEÇA NA PALETA ALTIUM: PAD DE PEÇA PASSANTE (COBRE NAS DUAS FACES) EM PRATA, O RESTO NA COR DA FACE; A PLACA EM PRETO
    const altium = (item: PartItem): PartItem => {
        const part    = library.getPart(item.moduleId)
        const layers  = part?.views.pcbView?.layers ?? []
        const through = layers.includes('copper0') && layers.includes('copper1')
        const board   = part?.kind === 'board' || part?.kind === 'resizableBoard'
        const paint   = (layer: string, color: string): [string, string] => [layer, through && layer.startsWith('copper') ? MULTI_LAYER : ALTIUM[layer] ?? color]
        return { ...item, recolor: [...item.recolor.map(([layer, color]) => paint(layer, color)), ...board ? [['board', ALTIUM.board] as [string, string], ['silkscreen', ALTIUM.silkscreen] as [string, string]] : []] }
    }

    // NO ESQUEMÁTICO, AS PEÇAS BÁSICAS COM O SÍMBOLO DE LIVRO DESENHADO SOBRE OS TERMINAIS; A CHAVE NA POSIÇÃO DO INSTANTE MOSTRADO
    const symbolArt = (item: PartItem) => {
        const symbol = view === 'schematicView' ? symbolOf(item.moduleId) : null
        const pins   = symbol ? symbol[2].map(id => scene.getTerminal(keyOf(item.modelIndex, id))) : []
        const bounds = symbol ? scene.getBounds(item.modelIndex) : null
        const known  = switchOf(library.getPart(item.moduleId))
        return symbol && bounds && pins.every(pin => pin !== null) ? <SymbolArt kind={symbol[1]} pins={pins as Point[]} center={[(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2]} pressed={known ? pressedAt(item.modelIndex, known.pressed) : false} /> : null
    }

    const finishNote = useCallback((modelIndex: string, html: string) => {
        setEditing(null)

        if (html !== (doc.instances[modelIndex]?.text ?? ''))
            commit(setNoteText(doc, modelIndex, html))
    }, [doc, commit])

    const content = useMemo(() => drawing.items.map(item => {
        if (item.type === 'wire' && view === 'pcbView') {
            const layer = scene.getView(item.modelIndex)?.layer ?? ''
            return <g key={item.modelIndex} opacity={dimmed(layer) ? DIMMED : 1}><WireShape item={{ ...item, color: ALTIUM_TRACE[layer] ?? item.color }} /></g>
        }

        if (item.type === 'wire')
            return <WireShape key={item.modelIndex} item={item} />

        if (item.type === 'note')
            return <NoteShape key={item.modelIndex} item={item} editing={editing === item.modelIndex} finish={html => finishNote(item.modelIndex, html)} />

        const part   = library.getPart(item.moduleId)
        const effect = effects?.get(item.modelIndex) ?? null
        const greyed = effects !== null && !running.has(item.modelIndex) && part?.kind === 'part' && (part.properties.family ?? '').toLowerCase() !== 'breadboard'
        const shown  = view === 'pcbView' ? altium(item) : timedItem(item)
        const art    = symbolArt(item)

        if (view === 'pcbView')
            return <g key={`${item.modelIndex}|${item.layer}`} opacity={dimmed(item.layer) ? DIMMED : 1}><PartShape item={shown} image={getImage(library, shown, view, item.paint)} effect={null} greyed={false} view={view} lab={false} art={null} /></g>

        return <PartShape key={`${item.modelIndex}|${item.layer}`} item={shown} image={art ? undefined : getImage(library, shown, view, effect?.color ? [['color_', effect.color]] : item.paint)} effect={effect} greyed={greyed} view={view} lab={item.moduleId.includes('LabDCPowerSupply')} art={art} />
    }), [drawing, effects, running, library, view, editing, finishNote, plans, result, simulated.step, side])

    const ratsnest = useMemo(() => drawing.ratsnest.map((rat, i) => (
        <g key={`${rat.from}|${rat.to}`} data-rat={i} data-overlay>
            <line x1={rat.a[0]} y1={rat.a[1]} x2={rat.b[0]} y2={rat.b[1]} stroke="transparent" strokeWidth={HIT_PX} vectorEffect="non-scaling-stroke" />
            <line x1={rat.a[0]} y1={rat.a[1]} x2={rat.b[0]} y2={rat.b[1]} stroke={rat.color} strokeWidth={RAT_PX} strokeDasharray={RAT_DASH} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        </g>
    )), [drawing])

    const onContextMenu = (event: MouseEvent<SVGSVGElement>) => {
        const point   = toScene(event.clientX, event.clientY)
        const element = (event.target as Element).closest('[data-probe], [data-rat], [data-label], [data-leg], [data-index]')
        const probe   = doc.probes.find(item => item.id === element?.getAttribute('data-probe'))
        const rat     = element?.getAttribute('data-rat')
        const index   = element?.getAttribute('data-index') ?? element?.getAttribute('data-label') ?? owner(element?.getAttribute('data-leg') ?? '')
        event.preventDefault()

        if (wiring)
            return finishWiring(follow(wiring, point, event.clientX, event.clientY, event), null)

        if (placing)
            return setPlacing(null)

        if (probing)
            return setTool('select')

        if (probe) {
            selectProbe(probe.id)
            return setMenu({ x: event.clientX, y: event.clientY, items: probeMenu(probe) })
        }

        if (!element)
            return setMenu(null)

        if (rat) {
            const line = drawing.ratsnest[Number(rat)]
            return setMenu({ x: event.clientX, y: event.clientY, items: getMenu({ kind: 'ratsnest', modelIndex: '', key: null, point, rat: [line.from, line.to] }) })
        }

        if (!selection.includes(index))
            select([index])

        const wire           = scene.isWire(index)
        const target: Target = { kind: wire ? 'wire' : 'part', modelIndex: index, key: wire ? hitEnd(index, point) : scene.getConnectorAt(point, modelIndex => modelIndex === index), point, rat: null }
        setMenu({ x: event.clientX, y: event.clientY, items: getMenu(target) })
    }

    const onDragOver = (event: DragEvent<SVGSVGElement>) => {
        if (event.dataTransfer.types.includes(PART_MIME))
            event.preventDefault()
    }

    const onDrop = (event: DragEvent<SVGSVGElement>) => {
        const moduleId = event.dataTransfer.getData(PART_MIME)
        event.preventDefault()

        if (moduleId)
            void addPart(moduleId, toScene(event.clientX, event.clientY))
    }

    const [mx, my]  = [size[0] * OVERSCAN, size[1] * OVERSCAN]
    const [w, h]    = [(size[0] + 2 * mx) / vp.zoom || 1, (size[1] + 2 * my) / vp.zoom || 1]
    const frame     = { left: -mx, top: -my, width: size[0] + 2 * mx, height: size[1] + 2 * my, transformOrigin: `${mx}px ${my}px` }
    const cell      = grid * vp.zoom
    const gridStyle = settings.showGrid !== '0' && cell >= MIN_GRID_PX ? { backgroundImage: `url(${gridTile(cell, dotColor)})`, backgroundSize: `${cell}px ${cell}px`, backgroundPosition: `${-vp.x * vp.zoom + mx}px ${-vp.y * vp.zoom + my}px` } : {}

    const style    = WIRE_STYLE[view]
    const marks    = (hover && netlist ? netlist.getNet(view, hover) : []).map(key => scene.getTerminal(key)).filter((point): point is Point => point !== null)
    const idle     = !drag && !wiring && !placing
    const boxes    = selection.filter(modelIndex => !wireItems.has(modelIndex)).map(modelIndex => scene.getBounds(modelIndex)).filter((box): box is Box => box !== null)
    const lit      = idle && pointed && !selection.includes(pointed.index) && !wireItems.has(pointed.index) ? scene.getBounds(pointed.index) : null
    const chain    = idle && pointed && wireItems.has(pointed.index) ? chainOf([pointed.index]) : []
    const zoomed   = (px: number) => px / vp.zoom
    const halo     = (modelIndex: string, opacity: number) => {
        const item = wireItems.get(modelIndex)
        return item && <path key={`halo${modelIndex}`} d={item.d} fill="none" stroke={SELECTED} strokeOpacity={opacity} strokeWidth={item.width + zoomed(HALO_PX)} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" data-overlay />
    }
    const handles  = (modelIndex: string) => wireItems.get(modelIndex)?.ends.map((point, i) => <circle key={`end${modelIndex}${i}`} cx={point[0]} cy={point[1]} r={zoomed(3.5)} fill="var(--surface)" stroke={SELECTED} strokeWidth={zoomed(1.5)} pointerEvents="none" data-overlay />) ?? []
    const switches = view === 'pcbView' ? [] : drawing.items.flatMap(item => {
        const known  = item.type === 'part' ? switchOf(library.getPart(item.moduleId)) : null
        const bounds = known ? scene.getBounds(item.modelIndex) : null
        return known && bounds ? [<SwitchChip key={`sw${item.modelIndex}`} modelIndex={item.modelIndex} at={[(bounds[0] + bounds[2]) / 2, bounds[1]]} pressed={pressedAt(item.modelIndex, known.pressed)} spdt={known.spdt} timed={plans[item.modelIndex] !== undefined} zoom={vp.zoom} />] : []
    })
    const single   = idle && selection.length === 1 && !wireItems.has(selection[0]) ? scene.getBounds(selection[0]) : null
    const below    = single && (single[3] - vp.y) * vp.zoom + 90 < size[1]
    const quick    = single ? { index: selection[0], at: [Math.min(size[0] - 150, Math.max(150, ((single[0] + single[2]) / 2 - vp.x) * vp.zoom)), below ? (single[3] - vp.y) * vp.zoom + 14 : Math.max(8, (single[1] - vp.y) * vp.zoom - 78)] as Point } : null
    const aimed    = wiring?.aim ?? null
    const aimText  = aimed ? aimed.end.keys[0] ? pinName(scene.isWire(owner(aimed.end.keys[0])) ? scene.getPartners(aimed.end.keys[0]).find(partner => !scene.isWire(owner(partner))) ?? aimed.end.keys[0] : aimed.end.keys[0]) : 'junção no fio' : ''
    const handlers = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onDoubleClick, onContextMenu, onDragOver, onDrop }
    const dash     = `${4 / vp.zoom} ${3 / vp.zoom}`
    const ends     = pointed && wireItems.has(pointed.index) ? scene.getWireEnds(pointed.index) : null
    const flat     = ends && orthogonal && isAxisAligned(...ends) && !scene.getWireCurve(pointed?.index ?? '') ? Math.abs(ends[0][1] - ends[1][1]) < Math.abs(ends[0][0] - ends[1][0]) ? 'ns-resize' : 'ew-resize' : 'move'
    const cursor   = drag?.type === 'pan' || drag?.type === 'move' ? 'grabbing' : wiring || placing || probing || hover || pointed?.end ? 'crosshair' : pointed && wireItems.has(pointed.index) ? flat : pointed ? 'move' : tool === 'area' ? 'default' : 'grab'
    const inverted = theme === 'dark' && view === 'schematicView'
    const ink      = (color: string) => view === 'pcbView' ? color === '#000000' ? ALTIUM.silkscreen : ALTIUM.silkscreen0 : /^#0{3,6}$/.test(color) ? 'var(--text)' : color
    const hint     = wiring ? 'Clique para dobrar · clique num terminal termina · botão direito deixa a ponta solta · Backspace desfaz · Esc cancela' :
                     placing ? `Clique no quadro para posicionar ${FEATURED.find(item => item.moduleId === placing)?.name ?? library.getPart(placing)?.title ?? 'a peça'} · Shift mantém · Esc cancela` :
                     probing ? 'Clique num fio ou terminal para medir · Shift mantém a ferramenta · Esc sai' :
                     drag?.type === 'marquee' ? (drag.crossing ? 'Da direita para a esquerda: seleciona tudo que o retângulo tocar' : 'Da esquerda para a direita: seleciona o que ficar inteiro dentro do retângulo') :
                     drag ? '' :
                     hover ? `Terminal ${pinName(hover)} · clique ou arraste até outro terminal para ligar` :
                     pointed?.end ? 'Ponta do fio · arraste para mover · clique para continuar o fio' :
                     pointed && wireItems.has(pointed.index) ? (flat === 'move' ? 'Fio · arraste para dobrar · duplo clique cria uma dobra' : 'Fio · arraste para deslocar o trecho · duplo clique cria uma dobra · Ctrl+arrastar faz curva') :
                     pointed && switchOf(library.getPart(doc.instances[pointed.index]?.moduleIdRef ?? '')) ? 'Chave · clique no selo acima dela para abrir ou fechar' :
                     pointed && !selection.includes(pointed.index) ? 'Clique para selecionar e editar o valor · arraste para mover' :
                     tool === 'area' ? 'Seletor · arraste no quadro para selecionar várias peças · Esc volta' : ''
    const marquee  = drag?.type === 'marquee' ? [Math.min(drag.start[0], drag.end[0]), Math.min(drag.start[1], drag.end[1]), Math.abs(drag.end[0] - drag.start[0]), Math.abs(drag.end[1] - drag.start[1])] : null
    const probes   = doc.probes.flatMap((probe, i) => {
        const anchor = probe.view === view ? probeAnchor(probe) : null
        return anchor ? [<ProbeShape key={probe.id} probe={probe} anchor={anchor} along={probeAlong(probe)} color={probeColor(i)} lines={probeLines(probe)} selected={focused === probe.id} />] : []
    })

    return (
        <>
            <svg ref={svgRef} id="canvas" className="absolute block touch-none select-none will-change-transform" viewBox={`${vp.x - mx / vp.zoom} ${vp.y - my / vp.zoom} ${w} ${h}`} style={{ ...frame, backgroundColor: view === 'pcbView' ? PCB_GROUND : 'var(--well)', ...gridStyle, cursor }} data-background={settings.backgroundColor ?? BACKGROUND[view]} {...handlers}>
                <g style={inverted ? { filter: INVERTED } : undefined}>
                    {content}
                    {drawing.junctions.map((junction, i) => <circle key={i} cx={junction.point[0]} cy={junction.point[1]} r={junction.radius} fill="#404040" pointerEvents="none" />)}
                    {drawing.marks.filter(mark => view === 'breadboardView' || mark.color !== CONNECTED_MARK).map(mark => mark.box ? <rect key={mark.key} x={mark.box[0]} y={mark.box[1]} width={mark.box[2] - mark.box[0]} height={mark.box[3] - mark.box[1]} fill={mark.color} fillOpacity={mark.opacity} pointerEvents="none" data-overlay /> : <circle key={mark.key} cx={mark.point?.[0]} cy={mark.point?.[1]} r={mark.radius} fill={mark.color} fillOpacity={mark.opacity * 2} pointerEvents="none" data-overlay />)}
                    {ratsnest}
                </g>
                {drawing.labels.map(label => (
                    <g key={label.modelIndex} data-label={label.modelIndex} fontSize={label.size} fontFamily={view === 'pcbView' ? label.font : 'var(--font)'} fill={ink(label.color)}>
                        {label.box && <rect x={label.box[0]} y={label.box[1]} width={label.box[2] - label.box[0]} height={label.box[3] - label.box[1]} fill="transparent" />}
                        {label.lines.map((line, i) => view === 'pcbView' ? <text key={i} x={label.x} y={label.y + label.size * (i + 1)}>{line}</text> : <text key={i} x={label.x} y={label.y + label.size * (i + 1)} fontWeight={i === 0 ? 600 : 400} fill={i === 0 ? undefined : 'var(--soft)'}>{i === 0 ? line : unitSpace(line)}</text>)}
                    </g>
                ))}
                {flagged.map((d, i) => <path key={`drc${i}`} d={d} fill="#ff0000" fillOpacity={0.45} stroke="#ff0000" strokeWidth={1 / vp.zoom} pointerEvents="none" data-overlay />)}
                {chain.map(modelIndex => halo(modelIndex, modelIndex === pointed?.index ? 0.4 : 0.18))}
                {selection.filter(modelIndex => wireItems.has(modelIndex)).map(modelIndex => halo(modelIndex, 0.45))}
                {selection.filter(modelIndex => wireItems.has(modelIndex)).flatMap(handles)}
                {idle && pointed?.end && wireItems.get(pointed.index)?.ends.map((point, i) => pointed.end?.endsWith(`connector${i}`) && <circle key={`tip${i}`} cx={point[0]} cy={point[1]} r={zoomed(6)} fill={SELECTED} fillOpacity={0.25} stroke={SELECTED} strokeWidth={zoomed(1.5)} pointerEvents="none" data-overlay />)}
                {boxes.map((box, i) => <rect key={i} x={box[0] - zoomed(3)} y={box[1] - zoomed(3)} width={box[2] - box[0] + zoomed(6)} height={box[3] - box[1] + zoomed(6)} rx={zoomed(4)} fill={SELECTED} fillOpacity={0.06} stroke={SELECTED} strokeWidth={zoomed(1.2)} pointerEvents="none" data-overlay />)}
                {lit && <rect x={lit[0] - zoomed(3)} y={lit[1] - zoomed(3)} width={lit[2] - lit[0] + zoomed(6)} height={lit[3] - lit[1] + zoomed(6)} rx={zoomed(4)} fill="none" stroke={SELECTED} strokeOpacity={0.5} strokeWidth={zoomed(1)} strokeDasharray={dash} pointerEvents="none" data-overlay />}
                {marks.map((point, i) => <circle key={i} cx={point[0]} cy={point[1]} r={MARK_PX / vp.zoom} fill={SELECTED} fillOpacity={0.35} stroke={SELECTED} strokeWidth={1 / vp.zoom} pointerEvents="none" data-overlay />)}
                {probes}
                {switches}
                {wiring && <WiringShape points={simplifyPath([...wiring.points, ...legOf(wiring)])} color={inverted ? 'var(--wire)' : style.color} width={milsToPx(style.mils)} zoom={vp.zoom} aimed={wiring.aim !== null} />}
                {aimed && (
                    <g key={aimText} className="snap" transform={`translate(${aimed.end.point[0]} ${aimed.end.point[1]}) scale(${1 / vp.zoom})`} pointerEvents="none">
                        <circle r={11} fill={SELECTED} fillOpacity={0.18} stroke={SELECTED} strokeWidth={2} />
                        <rect x={14} y={-27} width={aimText.length * 6.6 + 16} height={20} rx={10} fill="var(--surface)" stroke={SELECTED} />
                        <text x={22} y={-13} fontSize={TEXT_PX} fontWeight={500} fill="var(--text)" fontFamily="var(--font)">{aimText}</text>
                    </g>
                )}
                {marquee && drag?.type === 'marquee' && (
                    <g pointerEvents="none">
                        <rect x={marquee[0]} y={marquee[1]} width={marquee[2]} height={marquee[3]} rx={zoomed(2)} fill={SELECTED} fillOpacity={drag.crossing ? 0.05 : 0.1} stroke={SELECTED} strokeWidth={zoomed(1)} strokeDasharray={drag.crossing ? dash : undefined} />
                        <g transform={`translate(${drag.end[0]} ${drag.end[1]}) scale(${1 / vp.zoom})`}>
                            <rect x={12} y={12} width={`${drag.count} ${drag.count === 1 ? 'item' : 'itens'}`.length * 6.6 + 18} height={22} rx={11} fill="var(--surface)" stroke="var(--border)" />
                            <text x={21} y={27} fontSize={TEXT_PX} fontWeight={500} fill="var(--text)" fontFamily="var(--font)">{drag.count} {drag.count === 1 ? 'item' : 'itens'}</text>
                        </g>
                    </g>
                )}
            </svg>
            {quick && <QuickValue key={quick.index} modelIndex={quick.index} at={quick.at} focus={focus} />}
            <p className="hint" role="status">{hint}</p>
            {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} close={closeMenu} />}
        </>
    )
}
