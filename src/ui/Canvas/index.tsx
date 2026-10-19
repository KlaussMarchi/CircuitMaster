import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent } from 'react'
import { removeEdges, splitKey, type Doc } from '../../core/Document'
import { distance, type Box, type Point } from '../../core/Geometry'
import { milsToPx } from '../../core/Units'
import type { Library } from '../../core/Library'
import { Scene, WIRE_STYLE, owner } from '../../engine/Scene'
import { bendWire, connectEnd, getCarried, insertLegPoint, joinWires, moveInstances, moveLabel, removeLegPoint, setLegEnd, setNoteSize, setNoteText, setWireEnds, snapConnections, splitWire } from '../../engine/Edit'
import { getDrawing, getImageText, type PartItem, type WireItem } from '../../engine/Drawing'
import type { Effect } from '../../engine/Simulation'
import { Glow, Overlay } from '../Effects'
import { ContextMenu, type MenuEntry } from '../ContextMenu'
import { getMenu, type Target } from '../Menus'
import { useStore, type View, type Viewport } from '../Store'
import { PART_MIME } from '../PartsBin'
import { NoteShape } from '../Note'

type Drag =
    { type: 'pan', client: Point, viewport: Viewport } |
    { type: 'marquee', start: Point, end: Point, base: string[] } |
    { type: 'move', origin: Doc, start: Point, moved: string[], dx: number, dy: number, stretch: boolean } |
    { type: 'wire', from: string, start: Point, end: Point } |
    { type: 'end', origin: Doc, detached: Doc, keys: string[], bend: boolean, anchor: Point | null, moved: boolean } |
    { type: 'body', origin: Doc, wire: string, start: Point, curve: boolean, moved: boolean, bend: string[] | null, base: Doc | null } |
    { type: 'leg', origin: Doc, detached: Doc, key: string, moved: boolean } |
    { type: 'label', origin: Doc, modelIndex: string, start: Point, moved: boolean } |
    { type: 'grip', origin: Doc, modelIndex: string, start: Point, size: Point }

const ZOOM_STEP   = 1.0015    // POR PX DE ROLAGEM
const LINE_PX     = 33        // PX POR LINHA QUANDO deltaMode = 1
const TOUCHPAD_PX = 50        // ROLAGEM MENOR QUE ISSO POR EVENTO É TOUCHPAD: PAN EM VEZ DE ZOOM
const ZOOM_MIN    = 0.05
const ZOOM_MAX    = 64
const FIT_MARGIN  = 0.9
const HIT_PX      = 8         // LARGURA DE CLIQUE DE FIOS E RATSNEST NA TELA
const HANDLE_PX   = 6         // RAIO DE CLIQUE NA PONTA DE FIO OU DE PERNA NA TELA
const DRAG_PX     = 3         // DESLOCAMENTO MÍNIMO PARA VIRAR ARRASTE
const CORNER_PX   = 12        // ENCAIXE DA DOBRA NO CANTO COM SHIFT (SPEC 02 §4.3)
const MARK_PX     = 4
const RAT_PX      = 1.5
const MIN_GRID_PX = 6         // GRADE MAIS FINA QUE ISSO NA TELA NÃO É DESENHADA
const NOTE_MIN    = 30        // PX, MENOR LADO DE UMA NOTA REDIMENSIONADA
const EDITABLE    = '[contenteditable="true"]'
const SELECTED    = '#2563eb'

const BACKGROUND: Record<View, string> = { breadboardView: '#ffffff', schematicView: '#ffffff', pcbView: '#333333' }
const GRID_COLOR: Record<View, string> = { breadboardView: '#ececec', schematicView: '#ececec', pcbView: '#404040' }

const images = new Map<string, string>()

const getImage = (library: Library, item: PartItem, view: View, paint: [string, string][]) => {
    const key     = `${item.moduleId}|${item.variant}|${view}|${item.layer}|${item.hidden.join(',')}|${paint.join(';')}|${item.texts.join(';')}`
    const part    = library.getPart(item.moduleId)
    const options = { hidden: item.hidden, paint, texts: item.texts, fonts: library.fonts, layer: item.layer, recolor: item.recolor }

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

const intersects = (a: Box, b: Box) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]

const toggle = (selection: string[], index: string) => selection.includes(index) ? selection.filter(other => other !== index) : [...selection, index]

const GREYED = 'grayscale(1) brightness(0.8)'    // PEÇA FORA DA SIMULAÇÃO (SPEC 04 §8.1)

const PartShape = ({ item, image, effect, greyed, view, lab }: { item: PartItem, image: string | undefined, effect: Effect | null, greyed: boolean, view: View, lab: boolean }) => (
    <g data-index={item.modelIndex}>
        {effect && view === 'breadboardView' && <Glow item={item} effect={effect} />}
        <image href={image} width={item.width} height={item.height} preserveAspectRatio="none" transform={`matrix(${item.matrix.join(' ')})`} style={greyed ? { filter: GREYED } : undefined} />
        {item.legs.map(leg => (
            <g key={leg.key} data-leg={leg.key}>
                <polyline points={leg.points.join(' ')} fill="none" stroke={leg.color} strokeWidth={leg.width} strokeLinecap="round" strokeLinejoin="round" />
                {leg.points.slice(1, -1).map((point, i) => <circle key={i} cx={point[0]} cy={point[1]} r={leg.width / 2} fill={leg.color} />)}
            </g>
        ))}
        {effect && view !== 'pcbView' && <Overlay item={item} effect={effect} view={view} lab={lab} />}
    </g>
)

const WireShape = ({ item, hit }: { item: WireItem, hit: number }) => (
    <g data-index={item.modelIndex}>
        <path d={item.d} fill="none" stroke="transparent" strokeWidth={Math.max(item.width + 2, hit)} strokeLinecap="round" />
        {item.shadow && <path d={item.d} fill="none" stroke={item.shadow} strokeOpacity={item.opacity} strokeWidth={item.width + 2} strokeLinecap="round" pointerEvents="none" />}
        <path d={item.d} fill="none" stroke={item.color} strokeOpacity={item.opacity} strokeWidth={item.width} strokeLinecap="round" pointerEvents="none" />
    </g>
)

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
    const { preview, commit, select, setHover, setViewport, setSize, connect, addPart, getGrid } = useStore.getState()

    const svgRef          = useRef<SVGSVGElement>(null)
    const spaceRef        = useRef(false)
    const [drag, setDrag] = useState<Drag | null>(null)
    const [menu, setMenu] = useState<{ x: number, y: number, items: MenuEntry[] } | null>(null)
    const [editing, setEditing] = useState<string | null>(null)
    const closeMenu       = useCallback(() => setMenu(null), [])
    const scene           = useMemo(() => new Scene(doc, library, view), [doc, library, view])
    const drawing         = useMemo(() => getDrawing(scene, netlist), [scene, netlist])
    const result          = simulated.enabled && view !== 'pcbView' ? simulated.result : null
    const effects         = useMemo(() => result?.getEffects(simulated.step) ?? null, [result, simulated.step])
    const running         = useMemo(() => new Set(result?.circuit.simulated), [result])
    const settings        = doc.settings[view] ?? {}
    const grid            = getGrid()
    const align           = settings.alignToGrid !== '0'
    const vp              = viewport ?? { x: 0, y: 0, zoom: 1 }

    useEffect(() => {
        const element  = svgRef.current
        const observer = new ResizeObserver(([entry]) => setSize([entry.contentRect.width, entry.contentRect.height]))

        if (element)
            observer.observe(element)

        return () => observer.disconnect()
    }, [setSize])

    useEffect(() => {
        if (!viewport && size[0] && size[1])
            setViewport(view, fit(drawing.bounds, size))
    }, [viewport, size, drawing.bounds, view, setViewport])

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.code === 'Space' && !(event.target as HTMLElement).closest(`input, select, textarea, ${EDITABLE}`))
                spaceRef.current = event.type === 'keydown'
        }

        window.addEventListener('keydown', onKey)
        window.addEventListener('keyup', onKey)
        return () => {
            window.removeEventListener('keydown', onKey)
            window.removeEventListener('keyup', onKey)
        }
    }, [])

    useEffect(() => {
        const element = svgRef.current

        // RODA DO MOUSE DÁ ZOOM; TOUCHPAD FAZ PAN; Ctrl/Alt (E PINÇA) SEMPRE DÃO ZOOM
        const onWheel = (event: WheelEvent) => {
            const rect     = element?.getBoundingClientRect()
            const [sx, sy] = [event.clientX - (rect?.left ?? 0), event.clientY - (rect?.top ?? 0)]
            const scale    = event.deltaMode === 1 ? LINE_PX : 1
            const touchpad = event.deltaMode === 0 && (event.deltaX !== 0 || Math.abs(event.deltaY) < TOUCHPAD_PX)
            const zoom     = clamp(vp.zoom * ZOOM_STEP ** -(event.deltaY * scale))
            event.preventDefault()

            if (touchpad && !event.ctrlKey && !event.altKey)
                return setViewport(view, { ...vp, x: vp.x + event.deltaX / vp.zoom, y: vp.y + event.deltaY / vp.zoom })

            setViewport(view, { x: vp.x + sx / vp.zoom - sx / zoom, y: vp.y + sy / vp.zoom - sy / zoom, zoom })
        }

        element?.addEventListener('wheel', onWheel, { passive: false })
        return () => element?.removeEventListener('wheel', onWheel)
    }, [vp, view, setViewport])

    const toScene = (clientX: number, clientY: number): Point => {
        const rect = svgRef.current?.getBoundingClientRect()
        return [vp.x + (clientX - (rect?.left ?? 0)) / vp.zoom, vp.y + (clientY - (rect?.top ?? 0)) / vp.zoom]
    }

    const snap      = (value: number) => align ? Math.round(value / grid) * grid : value
    const snapPoint = (point: Point): Point => [snap(point[0]), snap(point[1])]
    const handle    = (width: number) => Math.max(HANDLE_PX / vp.zoom, width / 2 + 1)

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

    const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
        const point   = toScene(event.clientX, event.clientY)
        const element = (event.target as Element).closest('[data-rat], [data-label], [data-leg], [data-grip], [data-index]')
        const rat     = element?.getAttribute('data-rat')
        const label   = element?.getAttribute('data-label')
        const leg     = element?.getAttribute('data-leg') ?? null
        const grip    = element?.getAttribute('data-grip')
        const index   = element?.getAttribute('data-index') ?? grip ?? (leg ? owner(leg) : '')

        if (event.button === 2 || (event.target as Element).closest(EDITABLE))
            return

        event.currentTarget.setPointerCapture(event.pointerId)
        setMenu(null)

        if (event.button === 1 || spaceRef.current)
            return setDrag({ type: 'pan', client: [event.clientX, event.clientY], viewport: vp })

        if (!element) {
            if (!event.shiftKey)
                select([])

            return setDrag({ type: 'marquee', start: point, end: point, base: event.shiftKey ? selection : [] })
        }

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
            return setDrag({ type: 'leg', origin: doc, detached: removeEdges(doc, edge => edge.includes(leg)), key: leg, moved: false })
        }

        if (scene.isWire(index)) {
            const end = hitEnd(index, point)
            pick(index, event.shiftKey)

            if (end && event.altKey)
                return setDrag({ type: 'wire', from: end, start: scene.getTerminal(end) ?? point, end: point })

            if (end) {
                const bend   = scene.getBendpoint(end)
                const anchor = scene.getWireEnds(index)?.[end.endsWith('connector0') ? 1 : 0] ?? null
                return setDrag({ type: 'end', origin: doc, detached: bend ? doc : removeEdges(doc, edge => edge.includes(end)), keys: bend ?? [end], bend: bend !== null, anchor, moved: false })
            }

            if (!scene.getKeys(index).some(key => scene.getPartners(key).length))
                return setDrag({ type: 'move', origin: doc, start: point, moved: [index], dx: 0, dy: 0, stretch: false })

            return setDrag({ type: 'body', origin: doc, wire: index, start: point, curve: event.ctrlKey || event.metaKey, moved: false, bend: null, base: null })
        }

        const key = scene.getConnectorAt(point, modelIndex => modelIndex === index)

        if (key && !scene.getLegPoints(key)) {
            select([index])
            return setDrag({ type: 'wire', from: key, start: scene.getTerminal(key) ?? point, end: point })
        }

        const moved = carried(pick(index, event.shiftKey))

        if (moved.length)
            setDrag({ type: 'move', origin: doc, start: point, moved, dx: 0, dy: 0, stretch: event.altKey })
    }

    const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
        const point = toScene(event.clientX, event.clientY)
        const index = (event.target as Element).closest('[data-index]')?.getAttribute('data-index')
        const far   = (start: Point) => distance(start, point) * vp.zoom > DRAG_PX

        if (!drag)
            return setHover(index ? scene.getConnectorAt(point, modelIndex => modelIndex === index) : null)

        if (drag.type === 'pan')
            return setViewport(view, { ...drag.viewport, x: drag.viewport.x - (event.clientX - drag.client[0]) / drag.viewport.zoom, y: drag.viewport.y - (event.clientY - drag.client[1]) / drag.viewport.zoom })

        if (drag.type === 'marquee') {
            const box: Box = [Math.min(drag.start[0], point[0]), Math.min(drag.start[1], point[1]), Math.max(drag.start[0], point[0]), Math.max(drag.start[1], point[1])]
            const inside   = Object.values(doc.instances).filter(instance => scene.isShown(instance) && !scene.getView(instance.modelIndex)?.locked).map(instance => instance.modelIndex).filter(modelIndex => {
                const bounds = scene.getBounds(modelIndex)
                return bounds && intersects(bounds, box)
            })
            select([...new Set([...drag.base, ...inside])])
            return setDrag({ ...drag, end: point })
        }

        if (drag.type === 'wire') {
            setHover(scene.getConnectorAt(point, modelIndex => modelIndex !== owner(drag.from)))
            return setDrag({ ...drag, end: point })
        }

        if (drag.type === 'end') {
            preview(setWireEnds(drag.detached, view, drag.keys.map(key => [key, placeEnd(drag, point, event.shiftKey)])))
            setHover(drag.bend ? null : scene.getConnectorAt(point, modelIndex => modelIndex !== owner(drag.keys[0])))
            return setDrag({ ...drag, moved: true })
        }

        if (drag.type === 'body' && drag.curve) {
            preview(bendWire(drag.origin, view, drag.wire, drag.start, point))
            return setDrag({ ...drag, moved: true })
        }

        if (drag.type === 'body') {
            const split = drag.base && drag.bend ? { doc: drag.base, bend: drag.bend } : far(drag.start) ? splitWire(drag.origin, view, drag.wire, drag.start) : null

            if (!split?.bend)
                return

            preview(setWireEnds(split.doc, view, split.bend.map(key => [key, snapPoint(point)])))
            return setDrag({ ...drag, moved: true, bend: split.bend, base: split.doc })
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

        const [dx, dy] = [snap(point[0] - drag.start[0]), snap(point[1] - drag.start[1])]

        if (dx === drag.dx && dy === drag.dy)
            return

        preview(moveInstances(drag.origin, library, view, drag.moved, dx, dy, drag.stretch))
        setDrag({ ...drag, dx, dy })
    }

    const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
        const point = toScene(event.clientX, event.clientY)

        if (drag?.type === 'wire') {
            const to = scene.getConnectorAt(point, modelIndex => modelIndex !== owner(drag.from))

            if (to || distance(drag.start, point) * vp.zoom > DRAG_PX)
                void connect(drag.from, to, to ? undefined : snapPoint(point))
        }

        if (drag?.type === 'move' && (drag.dx || drag.dy))
            commit(view === 'breadboardView' ? snapConnections(doc, library, drag.moved) : doc, drag.origin)

        if (drag?.type === 'end' && drag.moved)
            commit(drag.bend ? doc : connectEnd(doc, library, view, drag.keys[0]), drag.origin)

        if (drag?.type === 'body' && drag.moved)
            commit(doc, drag.origin)

        if (drag?.type === 'leg' && drag.moved)
            commit(connectEnd(doc, library, view, drag.key), drag.origin)

        if (drag?.type === 'label' && drag.moved)
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

        if (leg) {
            const inner = (scene.getLegPoints(leg) ?? []).slice(1, -1).some(vertex => distance(vertex, point) <= handle(0))
            return commit(inner ? removeLegPoint(doc, library, view, leg, point) : insertLegPoint(doc, library, view, leg, point))
        }

        if (library.getPart(doc.instances[index]?.moduleIdRef ?? '')?.kind === 'note')
            return setEditing(index)

        if (!scene.isWire(index)) {
            if (index)
                void useStore.getState().toggleSwitch(index)

            return
        }

        const end  = hitEnd(index, point)
        const bend = end ? scene.getBendpoint(end) : null

        if (end && bend?.length === 2)
            return commit(joinWires(doc, library, view, end))

        if (!end)
            commit(splitWire(doc, view, index, point).doc)
    }

    const finishNote = (modelIndex: string, html: string) => {
        setEditing(null)

        if (html !== (doc.instances[modelIndex]?.text ?? ''))
            commit(setNoteText(doc, modelIndex, html))
    }

    const onContextMenu = (event: MouseEvent<SVGSVGElement>) => {
        const point   = toScene(event.clientX, event.clientY)
        const element = (event.target as Element).closest('[data-rat], [data-label], [data-leg], [data-index]')
        const rat     = element?.getAttribute('data-rat')
        const index   = element?.getAttribute('data-index') ?? element?.getAttribute('data-label') ?? owner(element?.getAttribute('data-leg') ?? '')
        event.preventDefault()

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

    const [w, h]   = [size[0] / vp.zoom || 1, size[1] / vp.zoom || 1]
    const style    = WIRE_STYLE[view]
    const marks    = (hover && netlist ? netlist.getNet(view, hover) : []).map(key => scene.getTerminal(key)).filter((point): point is Point => point !== null)
    const boxes    = selection.map(modelIndex => scene.getBounds(modelIndex)).filter((box): box is Box => box !== null)
    const handlers = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onDoubleClick, onContextMenu, onDragOver, onDrop }
    const dash     = `${4 / vp.zoom} ${3 / vp.zoom}`
    const cursor   = drag?.type === 'pan' ? 'grabbing' : 'default'
    const marquee  = drag?.type === 'marquee' ? [Math.min(drag.start[0], drag.end[0]), Math.min(drag.start[1], drag.end[1]), Math.abs(drag.end[0] - drag.start[0]), Math.abs(drag.end[1] - drag.start[1])] : null

    return (
        <>
            <svg ref={svgRef} id="canvas" className="block h-full w-full touch-none select-none" viewBox={`${vp.x} ${vp.y} ${w} ${h}`} style={{ background: settings.backgroundColor ?? BACKGROUND[view], cursor }} {...handlers}>
                <defs>
                    <pattern id="grid" width={grid} height={grid} patternUnits="userSpaceOnUse">
                        <path d={`M${grid} 0H0V${grid}`} fill="none" stroke={GRID_COLOR[view]} strokeWidth={1 / vp.zoom} />
                    </pattern>
                </defs>
                {settings.showGrid !== '0' && grid * vp.zoom >= MIN_GRID_PX && <rect x={vp.x} y={vp.y} width={w} height={h} fill="url(#grid)" pointerEvents="none" data-overlay />}
                {drawing.items.map(item => {
                    if (item.type === 'wire')
                        return <WireShape key={item.modelIndex} item={item} hit={HIT_PX / vp.zoom} />

                    if (item.type === 'note')
                        return <NoteShape key={item.modelIndex} item={item} editing={editing === item.modelIndex} finish={html => finishNote(item.modelIndex, html)} />

                    const part   = library.getPart(item.moduleId)
                    const effect = effects?.get(item.modelIndex) ?? null
                    const greyed = effects !== null && !running.has(item.modelIndex) && part?.kind === 'part' && (part.properties.family ?? '').toLowerCase() !== 'breadboard'
                    return <PartShape key={`${item.modelIndex}|${item.layer}`} item={item} image={getImage(library, item, view, effect?.color ? [['color_', effect.color]] : item.paint)} effect={effect} greyed={greyed} view={view} lab={item.moduleId.includes('LabDCPowerSupply')} />
                })}
                {drawing.junctions.map((junction, i) => <circle key={i} cx={junction.point[0]} cy={junction.point[1]} r={junction.radius} fill="#404040" pointerEvents="none" />)}
                {drawing.marks.map(mark => mark.box ? <rect key={mark.key} x={mark.box[0]} y={mark.box[1]} width={mark.box[2] - mark.box[0]} height={mark.box[3] - mark.box[1]} fill={mark.color} fillOpacity={mark.opacity} pointerEvents="none" data-overlay /> : <circle key={mark.key} cx={mark.point?.[0]} cy={mark.point?.[1]} r={mark.radius} fill={mark.color} fillOpacity={mark.opacity * 2} pointerEvents="none" data-overlay />)}
                {drawing.labels.map(label => (
                    <g key={label.modelIndex} data-label={label.modelIndex} fontSize={label.size} fontFamily={label.font} fill={label.color}>
                        {label.box && <rect x={label.box[0]} y={label.box[1]} width={label.box[2] - label.box[0]} height={label.box[3] - label.box[1]} fill="transparent" />}
                        {label.lines.map((line, i) => <text key={i} x={label.x} y={label.y + label.size * (i + 1)}>{line}</text>)}
                    </g>
                ))}
                {drawing.ratsnest.map((rat, i) => (
                    <g key={`${rat.from}|${rat.to}`} data-rat={i} data-overlay>
                        <line x1={rat.a[0]} y1={rat.a[1]} x2={rat.b[0]} y2={rat.b[1]} stroke="transparent" strokeWidth={HIT_PX / vp.zoom} />
                        <line x1={rat.a[0]} y1={rat.a[1]} x2={rat.b[0]} y2={rat.b[1]} stroke={rat.color} strokeWidth={RAT_PX / vp.zoom} strokeDasharray={dash} pointerEvents="none" />
                    </g>
                ))}
                {boxes.map((box, i) => <rect key={i} x={box[0]} y={box[1]} width={box[2] - box[0]} height={box[3] - box[1]} fill="none" stroke={SELECTED} strokeWidth={RAT_PX / vp.zoom} strokeDasharray={dash} pointerEvents="none" data-overlay />)}
                {marks.map((point, i) => <circle key={i} cx={point[0]} cy={point[1]} r={MARK_PX / vp.zoom} fill={SELECTED} fillOpacity={0.35} stroke={SELECTED} strokeWidth={1 / vp.zoom} pointerEvents="none" data-overlay />)}
                {drag?.type === 'wire' && <line x1={drag.start[0]} y1={drag.start[1]} x2={drag.end[0]} y2={drag.end[1]} stroke={style.color} strokeWidth={milsToPx(style.mils)} strokeLinecap="round" pointerEvents="none" />}
                {marquee && <rect x={marquee[0]} y={marquee[1]} width={marquee[2]} height={marquee[3]} fill={SELECTED} fillOpacity={0.08} stroke={SELECTED} strokeWidth={1 / vp.zoom} strokeDasharray={dash} pointerEvents="none" />}
            </svg>
            {result?.circuit.analysis.type === 'tran' && <div className="pointer-events-none absolute left-3 top-2 rounded bg-white/80 px-2 py-0.5 font-mono text-xs text-neutral-700">t = {result.getTime(simulated.step).toFixed(3)} s</div>}
            {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} close={closeMenu} />}
        </>
    )
}
