import { useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import type { LayerKind } from '../../core/GerberReader'
import type { Point } from '../../core/Geometry'
import { useStore } from '../Store'
import { t } from '../../core/Text'

const LABELS: Record<LayerKind, [string, string]> = {
    copperTop: ['Cobre de cima', '#d9534f'], copperBottom: ['Cobre de baixo', '#4a7bd8'], copperInner: ['Cobre interno', '#d08b2c'],
    maskTop: ['Máscara de cima', '#3fa66b'], maskBottom: ['Máscara de baixo', '#2f8a58'], silkTop: ['Serigrafia de cima', '#f2f2f2'], silkBottom: ['Serigrafia de baixo', '#d8c99b'],
    pasteTop: ['Pasta de cima', '#a9b1ba'], pasteBottom: ['Pasta de baixo', '#868e96'], outline: ['Contorno', '#f0b429'], drill: ['Furação', '#35d6a4'], other: ['Outro', '#be7be6']
}
const MM_PER_MIL = 0.0254
const ZOOM       = 1.2
const MARGIN     = 0.05    // FOLGA EM VOLTA DO CONJUNTO, FRAÇÃO DO LADO MAIOR

const both = (mils: number) => `${(mils * MM_PER_MIL).toFixed(3)} mm · ${mils.toFixed(1)} mil`

// VISUALIZADOR DOS ARQUIVOS DE FABRICAÇÃO: CAMADAS SOBREPOSTAS DE BAIXO PARA CIMA, CADA UMA COM COR E VISIBILIDADE; RODA = ZOOM NO CURSOR, ARRASTAR = MOVER, CLIQUE = RÉGUA (SPEC 09 §8)
export const GerberViewer = () => {
    const gerber  = useStore(state => state.gerber)
    const [hidden, setHidden] = useState<Set<string>>(new Set())
    const [frame, setFrame]   = useState<number[] | null>(null)
    const [cursor, setCursor] = useState<Point | null>(null)
    const [ruler, setRuler]   = useState<Point[]>([])
    const svg     = useRef<SVGSVGElement>(null)
    const drag    = useRef<{ start: Point, frame: number[], moved: boolean } | null>(null)
    const fitted  = useMemo(() => {
        const boxes = gerber?.layers.map(layer => layer.box).filter(box => box.every(Number.isFinite)) ?? []
        const [x0, y0, x1, y1] = boxes.reduce((all, box) => [Math.min(all[0], box[0]), Math.min(all[1], box[1]), Math.max(all[2], box[2]), Math.max(all[3], box[3])], [Infinity, Infinity, -Infinity, -Infinity])
        const pad = Math.max(x1 - x0, y1 - y0) * MARGIN || 100
        return boxes.length ? [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad] : [0, 0, 1000, 1000]
    }, [gerber])
    const close   = () => {
        useStore.setState({ gerber: null })
        setFrame(null)
        setRuler([])
        setHidden(new Set())
    }

    if (!gerber)
        return null

    const view    = frame ?? fitted
    const toScene = (event: { clientX: number, clientY: number }): Point => {
        const rect = svg.current?.getBoundingClientRect()
        const ctm  = svg.current?.getScreenCTM()

        if (!rect || !ctm)
            return [0, 0]

        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse())
        return [point.x, point.y]
    }
    const onWheel = (event: WheelEvent) => {
        const [x, y]   = toScene(event)
        const factor   = event.deltaY > 0 ? ZOOM : 1 / ZOOM
        setFrame([x - (x - view[0]) * factor, y - (y - view[1]) * factor, view[2] * factor, view[3] * factor])
    }
    const onDown  = (event: PointerEvent) => {
        drag.current = { start: [event.clientX, event.clientY], frame: view, moved: false }
        ;(event.target as Element).setPointerCapture?.(event.pointerId)
    }
    const onMove  = (event: PointerEvent) => {
        setCursor(toScene(event))
        const current = drag.current

        if (!current || !svg.current)
            return

        const scale = current.frame[2] / svg.current.getBoundingClientRect().width
        const [dx, dy] = [event.clientX - current.start[0], event.clientY - current.start[1]]
        current.moved  = current.moved || Math.hypot(dx, dy) > 3

        if (current.moved)
            setFrame([current.frame[0] - dx * scale, current.frame[1] - dy * scale, current.frame[2], current.frame[3]])
    }
    const onUp    = (event: PointerEvent) => {
        if (drag.current && !drag.current.moved)
            setRuler(ruler.length === 1 ? [ruler[0], toScene(event)] : [toScene(event)])

        drag.current = null
    }
    const toggle  = (name: string) => setHidden(current => {
        const next = new Set(current)
        next.has(name) ? next.delete(name) : next.add(name)
        return next
    })
    const stroke  = view[2] / 400

    return (
        <div className="modal" role="dialog" aria-modal="true" aria-label={t('Gerber: {0}', gerber.name)} onKeyDown={event => event.key === 'Escape' && close()}>
            <section className="card gerber">
                <header className="modal-head">
                    <h2>{t('Gerber · {0}', gerber.name)}</h2>
                    <div className="runrow">
                        <button className="btn sm" onClick={() => setFrame(null)}>{t('Enquadrar')}</button>
                        <button className="btn sm" autoFocus onClick={close}>{t('Fechar')}</button>
                    </div>
                </header>
                <div className="gerber-body">
                    <ul className="gerber-layers">
                        {gerber.layers.map(layer => (
                            <li key={layer.name}>
                                <label title={layer.problems.join('; ') || layer.name}>
                                    <input type="checkbox" checked={!hidden.has(layer.name)} onChange={() => toggle(layer.name)} />
                                    <i style={{ background: LABELS[layer.kind][1] }} />
                                    <span>{t(LABELS[layer.kind][0])}<small>{layer.name} · {layer.count}{layer.problems.length ? ' · ⚠' : ''}</small></span>
                                </label>
                            </li>
                        ))}
                    </ul>
                    <svg ref={svg} className="gerber-canvas" viewBox={view.join(' ')} preserveAspectRatio="xMidYMid meet" onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setCursor(null)}>
                        {gerber.layers.filter(layer => !hidden.has(layer.name)).map(layer => (
                            <g key={layer.name} style={{ color: LABELS[layer.kind][1] }} opacity={layer.kind.startsWith('mask') || layer.kind.startsWith('paste') ? 0.45 : 0.85} dangerouslySetInnerHTML={{ __html: layer.svg }} />
                        ))}
                        {ruler.length === 2 && <line x1={ruler[0][0]} y1={ruler[0][1]} x2={ruler[1][0]} y2={ruler[1][1]} stroke="var(--accent)" strokeWidth={stroke} />}
                        {ruler.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={stroke * 3} fill="var(--accent)" />)}
                    </svg>
                </div>
                <footer className="gerber-status">
                    <span>{cursor ? `X ${both(cursor[0])}   Y ${both(-cursor[1])}` : t('passe o cursor sobre a placa')}</span>
                    <span>{ruler.length === 2 ? t('régua: {0}', both(Math.hypot(ruler[1][0] - ruler[0][0], ruler[1][1] - ruler[0][1]))) : ruler.length === 1 ? t('clique no segundo ponto da régua') : t('clique em dois pontos para medir')}</span>
                </footer>
            </section>
        </div>
    )
}
