import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { formatReading, formatSi, parseSi } from '../../core/Properties'
import { INITIAL_KEY, START_KEY, STOP_KEY, getMode, projectValue, type Mode } from '../../core/Spice'
import type { Simulation } from '../../engine/Simulation'
import { signedGain } from '../../engine/Response'
import { Grapher, type Series } from '../Grapher'
import { Icon } from '../Icon'
import { TimeField } from '../Inspector'
import { probeColor } from '../Probe'
import { useStore } from '../Store'
import { t } from '../../core/Text'

const HEIGHT = [220, 320, 640] as const    // PX: MÍNIMO, INICIAL E MÁXIMO DA DOCA ABERTA

// JANELA DO TRANSITÓRIO DIGITADA: PASSA A MANUAL A PARTIR DA JANELA QUE ESTAVA VALENDO (MESMO INÍCIO, PONTOS E CONDIÇÃO INICIAL) E MUDA SÓ A PONTA EDITADA
const setWindow = (edge: 'start' | 'stop', seconds: number) => {
    const { doc, simulation, setProjectProperties } = useStore.getState()
    const analysis = simulation.result?.circuit.analysis
    const tran     = analysis?.type === 'tran' ? analysis : null
    const custom   = getMode(doc) === 'custom'
    const start    = edge === 'start' ? seconds : custom ? parseSi(projectValue(doc, START_KEY), 's') ?? 0 : tran?.t0 ?? 0
    const stop     = edge === 'stop' ? seconds : custom ? parseSi(projectValue(doc, STOP_KEY), 's') ?? 0 : tran?.t1 ?? 0

    if (stop <= start)
        return useStore.setState({ message: t('o fim da janela tem de ser depois do início') })

    const kept: Record<string, string> = custom ? {} : { simulator_time_step_mode: 'false', simulator_number_of_steps: String(tran?.steps ?? 500), [INITIAL_KEY]: tran?.initial ?? 'op' }
    setProjectProperties({ ...kept, [START_KEY]: formatSi(start, 's', 6), [STOP_KEY]: formatSi(stop, 's', 6) })
}

// INÍCIO E FIM DA JANELA EM VIGOR: O DO ÚLTIMO RESULTADO NO TRANSITÓRIO, SENÃO O GRAVADO NA JANELA MANUAL
const useWindow = () => {
    const doc      = useStore(state => state.doc)
    const analysis = useStore(state => state.simulation.enabled ? state.simulation.result?.circuit.analysis : undefined)
    const custom   = getMode(doc) === 'custom'

    if (analysis?.type === 'tran')
        return { start: analysis.t0, stop: analysis.t1, custom }

    return { start: custom ? parseSi(projectValue(doc, START_KEY), 's') : null, stop: custom ? parseSi(projectValue(doc, STOP_KEY), 's') : null, custom }
}

// POR QUE A SIMULAÇÃO DEU SÓ O REGIME: NADA MUDA NO TEMPO E O QUE FARIA MUDAR
const STILL: Record<Mode, string> = {
    auto: 'regime (ponto de operação): nada muda no tempo; clique na fonte de tensão e escolha Degrau, Rampa, Senoide ou Onda quadrada',
    custom: 'regime (ponto de operação): nada muda no tempo; escolha o sinal na fonte de tensão ou, na aba Documento, Começa descarregado'
}

// CURVAS DO PAINEL: SÓ AS PONTAS DE PROVA QUE O USUÁRIO PÔS, A TENSÃO E A CORRENTE DE CADA UMA (SPEC 04 §8.7)
const getCurves = (result: Simulation): Series[] => result.doc.probes.flatMap((probe, i) => {
    const reading = result.getProbe(probe.id)
    const color   = probeColor(i)
    const voltage = probe.kind !== 'current' && reading.voltage
    const current = probe.kind !== 'voltage' && reading.current
    return [...voltage ? [{ id: `p:${probe.id}:v`, label: `${probe.id} V`, unit: 'V' as const, color, values: voltage }] : [], ...current ? [{ id: `p:${probe.id}:i`, label: `${probe.id} I`, unit: 'A' as const, color, values: current, dashed: probe.kind === 'both' }] : []]
})

// PÍLULAS DAS CURVAS NO TOPO, COM FILTRO: CADA UMA MOSTRA OU ESCONDE A SUA
const Curves = ({ options, hidden, toggle }: { options: Series[], hidden: string[], toggle: (id: string) => void }) => {
    const [query, setQuery] = useState('')
    const shown             = options.filter(option => option.label.toLowerCase().includes(query.trim().toLowerCase()))

    return (
        <div className="sim-curves" role="group" aria-label={t('Curvas')}>
            <label className="search"><Icon name="search" /><input type="search" placeholder={t('Filtrar')} aria-label={t('Filtrar curvas')} value={query} onChange={event => setQuery(event.target.value)} /></label>
            {shown.map(option => <button key={option.id} className="pill curve" aria-pressed={!hidden.includes(option.id)} title={t(hidden.includes(option.id) ? 'Mostrar {0}' : 'Esconder {0}', option.label)} onClick={() => toggle(option.id)}><span className="dot-s" style={{ background: option.color }} />{option.label}</button>)}
        </div>
    )
}

// PAINEL DE SIMULAÇÃO LIMPO: NO CABEÇALHO O TEMPO DE SIMULAÇÃO E A REPRODUÇÃO; NO TOPO AS PONTAS DO USUÁRIO COM FILTRO; EMBAIXO O GRÁFICO COM CURSOR; AS MEDIDAS FICAM NO CARTÃO DA PONTA (PEDIDO DO USUÁRIO, 2026-10-23)
export const SimulationPanel = () => {
    const simulation          = useStore(state => state.simulation)
    const doc                 = useStore(state => state.doc)
    const selected            = useStore(state => state.probe)
    const open                = useStore(state => state.show.chart)
    const [height, setHeight] = useState<number>(HEIGHT[1])
    const resizeRef           = useRef<{ y: number, height: number } | null>(null)
    const { play, pause, seek, setSimulation, setShow, setProjectProperties } = useStore.getState()
    const result              = simulation.enabled ? simulation.result : null
    const step                = simulation.step
    const span                = useWindow()
    const mode                = getMode(doc)

    useEffect(() => {
        if (!simulation.playing || result?.circuit.analysis.type !== 'tran')
            return

        const interval = result.circuit.analysis.interval
        let frame      = 0

        const tick = () => {
            const next = interval > 0 ? Math.min(result.steps - 1, Math.floor((performance.now() - simulation.started) / interval)) : result.steps - 1
            setSimulation({ step: next, playing: next < result.steps - 1 })

            if (next < result.steps - 1)
                frame = requestAnimationFrame(tick)
        }

        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
    }, [simulation.playing, simulation.started, result, setSimulation])

    const options  = useMemo(() => result ? getCurves(result) : [], [result])
    const hidden   = simulation.hidden
    const shown    = options.filter(option => !hidden.includes(option.id)).map(option => option.id).join()
    const series   = useMemo(() => options.filter(option => shown.split(',').includes(option.id)), [shown, options])
    const analysis = result?.circuit.analysis
    const still    = result?.isStill() ?? false
    const time     = analysis?.type === 'tran' && !still ? result?.vectors.time ?? null : null
    const output   = (option: Series) => option.unit === 'V' && !result?.getStimulus().driven.has(result.circuit.meters.get(option.id.split(':')[1])?.node ?? '')
    const curve    = options.find(option => option.id.split(':')[1] === selected) ?? series.find(output) ?? series[0] ?? null
    const report   = useMemo(() => time && curve && result ? result.getResponse(curve.values) : null, [time, curve, result])
    const marks    = report?.kind === 'step' && curve && series.includes(curve) ? { color: curve.color, unit: curve.unit, response: report.response } : null
    const regime   = useMemo(() => series.map(item => ({ ...item, values: [item.values[0] ?? 0, item.values[0] ?? 0] })), [series])
    const toggle   = (id: string) => setSimulation({ hidden: hidden.includes(id) ? hidden.filter(other => other !== id) : [...hidden, id] })
    const playing  = simulation.playing

    const onResize = (event: PointerEvent<HTMLDivElement>) => {
        if (event.type === 'pointerdown') {
            event.currentTarget.setPointerCapture(event.pointerId)
            resizeRef.current = { y: event.clientY, height }
        }

        if (event.type === 'pointermove' && resizeRef.current)
            setHeight(Math.min(HEIGHT[2], Math.max(HEIGHT[0], resizeRef.current.height + resizeRef.current.y - event.clientY)))

        if (event.type === 'pointerup')
            resizeRef.current = null
    }

    const finding = !simulation.enabled                                     ? t('parada: aperte Simular') :
                    simulation.busy                                         ? t('simulando…') :
                    simulation.error                                        ? t('erro: {0}', simulation.error) :
                    still                                                   ? t(STILL[mode]) :
                    report?.kind === 'step' && report.response.tau !== null ? t('{0}: τ = {1} · final {2}', curve?.label ?? '', formatReading(report.response.tau - report.response.from, 's'), formatReading(report.response.final, curve?.unit ?? 'V')) :
                    report?.kind === 'step'                                 ? t('{0}: sobressinal {1}% · pico {2}', curve?.label ?? '', (report.response.overshoot * 100).toFixed(1), formatReading(report.response.peak.value, curve?.unit ?? 'V')) :
                    report?.kind === 'gain'                                 ? t('{0}: ganho {1} ({2} dB) a {3}', curve?.label ?? '', signedGain(report.gain).toFixed(2), report.gain.decibels.toFixed(1), formatReading(report.gain.frequency, 'Hz')) :
                    analysis?.type === 'tran'                               ? t('transitório {0} – {1} · {2} pontos', formatSi(analysis.t0, 's'), formatSi(analysis.t1, 's'), result?.steps ?? 0) : t('aguardando o circuito')

    const caption = !simulation.enabled ? <>{t('Aperte')} <b>{t('Simular')}</b>: {t('o ponto de operação e, se algo mudar no tempo, o transitório.')}<br /><span className="muted">{doc.probes.length ? t('As pontas de prova viram curvas aqui.') : t('Use V, A ou V·A na barra do quadro para medir um fio ou terminal.')}</span></> :
                    simulation.busy     ? t('Simulando…') :
                    simulation.error    ? <span className="muted">{t('Veja a causa em Problemas.')}</span> :
                    !options.length     ? t('Use V, A ou V·A na barra do quadro para medir um fio ou terminal.') :
                    !series.length      ? t('Clique numa curva acima para mostrá-la.') : t('Aguardando o circuito.')

    return (
        <section className={`dock card ${open ? '' : 'collapsed'}`} style={open ? { height } : undefined} aria-label={t('Simulação')}>
            {open && <div className="dock-grip" onPointerDown={onResize} onPointerMove={onResize} onPointerUp={onResize} />}
            <header className="dock-head">
                <div className="dock-title">
                    <h2>{t('Simulação')}</h2>
                    <p className={`sub ${simulation.enabled && simulation.error ? 'err' : ''}`} title={finding}>{finding}</p>
                </div>
                <div className="dock-ctl">
                    <div className="win" title={mode === 'custom' ? t('Janela manual do tempo de simulação') : t('Tempo de simulação automático, pela escala do circuito e pelos sinais das fontes: digite para fixar')}>
                        {mode === 'custom' && <><span>{t('de')}</span><TimeField label="Início da janela" value={span.start} commit={seconds => setWindow('start', seconds)} /></>}
                        <span>{t('até')}</span>
                        <TimeField label="Fim da janela" value={span.stop} commit={seconds => setWindow('stop', seconds)} />
                        {mode === 'custom' && <button className="btn sm" title={t('Volta ao tempo de simulação pela escala do circuito')} onClick={() => setProjectProperties({ [START_KEY]: '', [STOP_KEY]: '', [INITIAL_KEY]: '' })}>{t('Automático')}</button>}
                    </div>
                    {time && result && <>
                        <button className="icon-btn" aria-label={t('Voltar ao início')} title={t('Voltar ao início')} onClick={() => { seek(0); play() }}><Icon name="reset" /></button>
                        <button className="icon-btn" aria-label={playing ? t('Pausar') : t('Reproduzir')} title={playing ? t('Pausar') : t('Reproduzir')} onClick={playing ? pause : play}><Icon name={playing ? 'pause' : 'play'} /></button>
                        <input type="range" min={0} max={result.steps - 1} value={step} aria-label={t('Instante da simulação')} onChange={event => seek(Number(event.target.value))} />
                        <span className="num tread">t = {formatReading(result.getTime(step), 's')}</span>
                    </>}
                    <button className="icon-btn toggle" aria-label={open ? t('Recolher simulação') : t('Abrir simulação')} aria-expanded={open} title={open ? t('Recolher') : t('Abrir')} onClick={() => setShow({ chart: !open })}><Icon name="chevronDown" /></button>
                </div>
            </header>
            {open && (
                <div className="sim-body">
                    {options.length > 0 && <Curves options={options} hidden={hidden} toggle={toggle} />}
                    {result && time && series.length ? <Grapher time={time} series={series} step={step} marks={marks} seek={index => { pause(); seek(index) }} /> : result && still && series.length ? <Grapher time={[0, 1]} series={regime} step={1} marks={null} still seek={() => {}} /> : <div className="scope"><div className="scope-cap">{caption}</div></div>}
                </div>
            )}
        </section>
    )
}
