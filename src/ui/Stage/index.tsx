import type { ProbeKind } from '../../core/Document'
import { formatReading, formatSi } from '../../core/Properties'
import { Canvas } from '../Canvas'
import { Icon, ProbeIcon } from '../Icon'
import { Welcome } from '../Welcome'
import { useStore, type Side } from '../Store'

const ZOOM_STEP = 1.25
const SIDES: [Side, string, string][] = [['both', 'Ambas', 'Mostra as duas faces'], ['top', 'Topo', 'Destaca a face de cima (vermelha); trilhas novas vão nela'], ['bottom', 'Base', 'Destaca a face de baixo (azul); trilhas novas vão nela']]
const PROBES: [ProbeKind, string, string][] = [['voltage', 'V', 'Ponta de tensão: clique num fio ou terminal'], ['current', 'A', 'Ponta de corrente: clique num fio ou terminal'], ['both', 'V·A', 'Ponta de tensão e corrente']]

// CHIP DO CANTO: ANÁLISE, JANELA E O INSTANTE MOSTRADO, COM O PONTO ACESO ENQUANTO SIMULA OU REPRODUZ
const SimChip = () => {
    const simulation = useStore(state => state.simulation)
    const analysis   = simulation.result?.circuit.analysis

    if (!simulation.enabled)
        return null

    const live = simulation.busy || simulation.playing
    const text = analysis?.type === 'tran' ? <>Transitório · {formatSi(analysis.t0, 's', 3)}–{formatSi(analysis.t1, 's', 3)} · <span className="num">t = {formatReading(simulation.result?.getTime(simulation.step) ?? 0, 's')}</span></> : simulation.busy ? 'Simulando…' : 'Ponto de operação · DC'
    return <div className="chip chip-tr" aria-live="off"><span className={`live ${live ? 'on' : ''}`} />{text}</div>
}

// AÇÕES PARA VÁRIOS ITENS SELECIONADOS (SELETOR OU SHIFT+CLIQUE)
const SelectionBar = () => {
    const count = useStore(state => state.selection.length)
    const { rotate, duplicate, remove, select } = useStore.getState()

    if (count < 2)
        return null

    return (
        <div className="selbar" role="toolbar" aria-label="Seleção">
            <b>{count} selecionados</b>
            <button className="icon-btn" aria-label="Girar" title="Girar 90° (])" onClick={() => rotate(90)}><Icon name="rotate" /></button>
            <button className="icon-btn" aria-label="Duplicar" title="Duplicar (Ctrl+D)" onClick={() => void duplicate()}><Icon name="duplicate" /></button>
            <button className="icon-btn" aria-label="Apagar" title="Apagar (Delete)" onClick={() => remove(false)}><Icon name="trash" /></button>
            <button className="icon-btn" aria-label="Desmarcar" title="Desmarcar (Esc)" onClick={() => select([])}><Icon name="close" /></button>
        </div>
    )
}

const Zoom = () => {
    const zoom = useStore(state => state.viewports[state.view]?.zoom ?? 1)
    const view = useStore(state => state.view)
    const { setZoom, setViewport } = useStore.getState()

    return (
        <div className="zoom" role="group" aria-label="Zoom">
            <button className="icon-btn" aria-label="Diminuir zoom" title="Diminuir (Ctrl+-)" onClick={() => setZoom(zoom / ZOOM_STEP)}><Icon name="minus" /></button>
            <button className="num" title="100% (Ctrl+Shift+0)" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
            <button className="icon-btn" aria-label="Aumentar zoom" title="Aumentar (Ctrl++)" onClick={() => setZoom(zoom * ZOOM_STEP)}><Icon name="plus" /></button>
            <button className="icon-btn" aria-label="Enquadrar" title="Enquadrar (Ctrl+0)" onClick={() => setViewport(view, undefined)}><Icon name="fit" /></button>
        </div>
    )
}

// ÁREA DE DESENHO: FERRAMENTAS, DOCUMENTO E O QUADRO COM AS SOBREPOSIÇÕES (DESIGN.md §6)
export const Stage = () => {
    const view     = useStore(state => state.view)
    const tool     = useStore(state => state.tool)
    const ready    = useStore(state => state.ready)
    const name     = useStore(state => state.name)
    const changed  = useStore(state => state.doc !== state.saved)
    const stored   = useStore(state => state.stored)
    const past     = useStore(state => state.past.length)
    const future   = useStore(state => state.future.length)
    const selected = useStore(state => state.selection.length)
    const side     = useStore(state => state.side)
    const { setTool, undo, redo, rotate, flip, remove, setSide } = useStore.getState()
    const sheet    = view !== 'pcbView'

    return (
        <section className="stage card" aria-label="Área de desenho">
            <div className="stage-head">
                <div className="tools" role="toolbar" aria-label="Ferramentas">
                    <button className="tool" aria-pressed={tool === 'select'} aria-label="Editar" title="Editar: clique seleciona, arraste o fundo para mover a vista, clique num terminal para ligar (H)" onClick={() => setTool('select')}><Icon name="hand" /></button>
                    <button className="tool" aria-pressed={tool === 'area'} aria-label="Seletor" title="Seletor: arraste no quadro para selecionar várias peças de uma vez (V)" onClick={() => setTool(tool === 'area' ? 'select' : 'area')}><Icon name="select" /></button>
                    {PROBES.map(([kind, letters, hint]) => <button key={kind} className="tool" aria-pressed={tool === kind} aria-label={hint} title={`${hint}${sheet ? '' : ' (só na protoboard e no esquemático)'}`} disabled={!ready || !sheet} onClick={() => setTool(tool === kind ? 'select' : kind)}><ProbeIcon /><b>{letters}</b></button>)}
                    <span className="sep" />
                    <button className="tool" aria-label="Desfazer" title="Desfazer (Ctrl+Z)" disabled={!past} onClick={undo}><Icon name="undo" /></button>
                    <button className="tool" aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)" disabled={!future} onClick={redo}><Icon name="redo" /></button>
                    <span className="sep" />
                    <button className="tool" aria-label="Girar" title="Girar 90° (])" disabled={!selected} onClick={() => rotate(90)}><Icon name="rotate" /></button>
                    <button className="tool" aria-label="Espelhar" title="Espelhar (|, esquemático)" disabled={!selected || view !== 'schematicView'} onClick={() => flip(true)}><Icon name="flip" /></button>
                    <button className="tool" aria-label="Apagar" title="Apagar (Delete)" disabled={!selected} onClick={() => remove(false)}><Icon name="trash" /></button>
                </div>
                {view === 'pcbView' && (
                    <div className="tabs layerswitch" role="tablist" aria-label="Face da placa">
                        {SIDES.map(([id, label, hint]) => <button key={id} className="tab" role="tab" aria-selected={side === id} title={hint} onClick={() => setSide(id)}><i className={`swatch ${id}`} />{label}</button>)}
                    </div>
                )}
                <div className="doc">
                    <h1 title={name}>{name.replace(/\.(fzz|fz)$/i, '')}</h1>
                    <span className={`pill ${changed ? 'warn' : 'neutral'}`}>{changed ? 'Alterações não salvas' : stored ? 'Salvo' : 'Novo'}</span>
                </div>
            </div>
            <div className="canvas">
                <Canvas />
                <SimChip />
                <SelectionBar />
                <Zoom />
                <Welcome />
            </div>
        </section>
    )
}
