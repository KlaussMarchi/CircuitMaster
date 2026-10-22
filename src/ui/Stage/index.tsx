import type { ProbeKind } from '../../core/Document'
import { formatReading, formatSi } from '../../core/Properties'
import { Canvas } from '../Canvas'
import { Layers } from '../Layers'
import { Icon, ProbeIcon } from '../Icon'
import { Welcome } from '../Welcome'
import { useStore, type Side } from '../Store'
import { t } from '../../core/Text'

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
    const text = analysis?.type === 'tran' && !simulation.result?.isStill() ? <>{t('Transitório')} · {formatSi(analysis.t0, 's', 3)}–{formatSi(analysis.t1, 's', 3)} · <span className="num">t = {formatReading(simulation.result?.getTime(simulation.step) ?? 0, 's')}</span></> : simulation.busy ? t('Simulando…') : t('Ponto de operação · DC')
    return <div className="chip chip-tr" aria-live="off"><span className={`live ${live ? 'on' : ''}`} />{text}</div>
}

// AÇÕES PARA VÁRIOS ITENS SELECIONADOS (SELETOR OU SHIFT+CLIQUE)
const SelectionBar = () => {
    const count = useStore(state => state.selection.length)
    const { rotate, duplicate, remove, select } = useStore.getState()

    if (count < 2)
        return null

    return (
        <div className="selbar" role="toolbar" aria-label={t('Seleção')}>
            <b>{t('{0} selecionados', count)}</b>
            <button className="icon-btn" aria-label={t('Girar')} title={`${t('Girar 90°')} (])`} onClick={() => rotate(90)}><Icon name="rotate" /></button>
            <button className="icon-btn" aria-label={t('Duplicar')} title={`${t('Duplicar')} (Ctrl+D)`} onClick={() => void duplicate()}><Icon name="duplicate" /></button>
            <button className="icon-btn" aria-label={t('Apagar')} title={`${t('Apagar')} (Delete)`} onClick={() => remove(false)}><Icon name="trash" /></button>
            <button className="icon-btn" aria-label={t('Desmarcar')} title={`${t('Desmarcar')} (Esc)`} onClick={() => select([])}><Icon name="close" /></button>
        </div>
    )
}

const Zoom = () => {
    const zoom = useStore(state => state.viewports[state.view]?.zoom ?? 1)
    const view = useStore(state => state.view)
    const { setZoom, setViewport } = useStore.getState()

    return (
        <div className="zoom" role="group" aria-label={t('Zoom')}>
            <button className="icon-btn" aria-label={t('Diminuir zoom')} title={`${t('Diminuir')} (Ctrl+-)`} onClick={() => setZoom(zoom / ZOOM_STEP)}><Icon name="minus" /></button>
            <button className="num" title="100% (Ctrl+Shift+0)" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
            <button className="icon-btn" aria-label={t('Aumentar zoom')} title={`${t('Aumentar')} (Ctrl++)`} onClick={() => setZoom(zoom * ZOOM_STEP)}><Icon name="plus" /></button>
            <button className="icon-btn" aria-label={t('Enquadrar')} title={`${t('Enquadrar')} (Ctrl+0)`} onClick={() => setViewport(view, undefined)}><Icon name="fit" /></button>
        </div>
    )
}

const titleOf = (name: string) => t(name.replace(/\.(fzz|fz)$/i, ''))

// SKETCH ABERTO: O NOME E O ESTADO; COM MAIS DE UM, AS ABAS PARA TROCAR E FECHAR (O PONTO MARCA ALTERAÇÕES NÃO SALVAS)
const Sheets = () => {
    const sheets  = useStore(state => state.sheets)
    const sheet   = useStore(state => state.sheet)
    const name    = useStore(state => state.name)
    const changed = useStore(state => state.doc !== state.saved)
    const stored  = useStore(state => state.stored)
    const { switchSheet, closeSheet } = useStore.getState()
    const status  = <span className={`pill ${changed ? 'warn' : 'neutral'}`}>{changed ? t('Alterações não salvas') : stored ? t('Salvo') : t('Novo')}</span>

    if (sheets.length < 2)
        return <div className="doc"><h1 title={titleOf(name)}>{titleOf(name)}</h1>{status}</div>

    return (
        <div className="doc">
            <div className="tabs sheets" role="tablist" aria-label={t('Sketches abertos')}>
                {sheets.map(item => {
                    const active = item.id === sheet
                    const label  = titleOf(active ? name : item.name)
                    const dirty  = active ? changed : item.doc !== item.saved

                    return (
                        <span key={item.id} className="sheet">
                            <button className="tab" role="tab" aria-selected={active} title={`${label}${dirty ? ` · ${t('alterações não salvas')}` : ''}`} onClick={() => switchSheet(item.id)}>{label}{dirty && <i className="dirty" aria-hidden />}</button>
                            <button className="icon-btn" aria-label={t('Fechar {0}', label)} title={t('Fechar {0}', label)} onClick={() => closeSheet(item.id)}><Icon name="close" /></button>
                        </span>
                    )
                })}
            </div>
            {status}
        </div>
    )
}

// ÁREA DE DESENHO: FERRAMENTAS, DOCUMENTO E O QUADRO COM AS SOBREPOSIÇÕES (DESIGN.md §6)
export const Stage = () => {
    const view     = useStore(state => state.view)
    const tool     = useStore(state => state.tool)
    const ready    = useStore(state => state.ready)
    const past     = useStore(state => state.past.length)
    const future   = useStore(state => state.future.length)
    const selected = useStore(state => state.selection.length)
    const side     = useStore(state => state.side)
    const { setTool, undo, redo, rotate, flip, remove, setSide } = useStore.getState()
    const sheet    = view !== 'pcbView'

    return (
        <section className="stage card" aria-label={t('Área de desenho')}>
            <div className="stage-head">
                <div className="tools" role="toolbar" aria-label={t('Ferramentas')}>
                    <button className="tool" aria-pressed={tool === 'select'} aria-label={t('Editar')} title={`${t('Editar: clique seleciona, arraste o fundo para mover a vista, clique num terminal para ligar')} (H)`} onClick={() => setTool('select')}><Icon name="hand" /></button>
                    <button className="tool" aria-pressed={tool === 'area'} aria-label={t('Seletor')} title={`${t('Seletor: arraste no quadro para selecionar várias peças de uma vez')} (V)`} onClick={() => setTool(tool === 'area' ? 'select' : 'area')}><Icon name="select" /></button>
                    {sheet && PROBES.map(([kind, letters, hint]) => <button key={kind} className="tool" aria-pressed={tool === kind} aria-label={t(hint)} title={t(hint)} disabled={!ready} onClick={() => setTool(tool === kind ? 'select' : kind)}><ProbeIcon /><b>{letters}</b></button>)}
                    <span className="sep" />
                    <button className="tool" aria-label={t('Desfazer')} title={`${t('Desfazer')} (Ctrl+Z)`} disabled={!past} onClick={undo}><Icon name="undo" /></button>
                    <button className="tool" aria-label={t('Refazer')} title={`${t('Refazer')} (Ctrl+Shift+Z)`} disabled={!future} onClick={redo}><Icon name="redo" /></button>
                    <span className="sep" />
                    <button className="tool" aria-label={t('Girar')} title={`${t('Girar 90°')} (])`} disabled={!selected} onClick={() => rotate(90)}><Icon name="rotate" /></button>
                    {view === 'schematicView' && <button className="tool" aria-label={t('Espelhar')} title={`${t('Espelhar')} (|)`} disabled={!selected} onClick={() => flip(true)}><Icon name="flip" /></button>}
                    <button className="tool" aria-label={t('Apagar')} title={`${t('Apagar')} (Delete)`} disabled={!selected} onClick={() => remove(false)}><Icon name="trash" /></button>
                </div>
                {view === 'pcbView' && (
                    <div className="tabs layerswitch" role="tablist" aria-label={t('Face da placa')}>
                        {SIDES.map(([id, label, hint]) => <button key={id} className="tab" role="tab" aria-selected={side === id} title={t(hint)} onClick={() => setSide(id)}><i className={`swatch ${id}`} />{t(label)}</button>)}
                    </div>
                )}
                <Sheets />
            </div>
            <div className="canvas">
                <Canvas />
                <SimChip />
                <SelectionBar />
                <Zoom />
                {view === 'pcbView' && <Layers />}
                <Welcome />
            </div>
        </section>
    )
}
