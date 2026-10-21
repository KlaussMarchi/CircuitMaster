import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { splitKey, type Doc } from '../../core/Document'
import type { Library } from '../../core/Library'
import { formatReading, formatSi } from '../../core/Properties'
import { getElements, getTiming } from '../../core/Timing'
import { getStats, familyOf, type Simulation } from '../../engine/Simulation'
import { getReport, type Report } from '../../engine/Response'
import { Grapher, type Series } from '../Grapher'
import { Icon } from '../Icon'
import { Kv, TimeField } from '../Inspector'
import { probeColor } from '../Probe'
import { SimulationSettings, setWindow, useWindow } from '../SimulationSettings'
import { useStore, type Readout } from '../Store'
import { PRESET_KEY } from '../../core/Spice'

const DEFAULTS = 3                          // CURVAS MOSTRADAS QUANDO NÃO HÁ PONTA NEM INSTRUMENTO
const HEIGHT   = [200, 300, 640] as const   // PX: MÍNIMO, INICIAL E MÁXIMO DA DOCA ABERTA
const TABS: [Readout, string][] = [['measures', 'Medidas'], ['response', 'Resposta'], ['settings', 'Ajustes']]

const nameOf = (doc: Doc, library: Library, key: string) => {
    const [modelIndex, connectorId] = splitKey(key)
    const instance                  = doc.instances[modelIndex]
    const connector                 = library.getPart(instance?.moduleIdRef ?? '')?.connectors.find(item => item.id === connectorId)
    return `${instance?.title ?? modelIndex}.${connector?.name ?? connectorId}`
}

// CURVAS POSSÍVEIS: CADA PONTA DE PROVA, A TENSÃO DE CADA NET EM RELAÇÃO AO TERRA E A CORRENTE DE CADA FONTE (SPEC 04 §8.6–§8.7)
const getOptions = (result: Simulation): Series[] => {
    const simulated = new Set(result.circuit.simulated)
    const members   = [...result.circuit.nodes].filter(([key, node]) => node !== '0' && simulated.has(splitKey(key)[0]))
    const nodes     = [...new Map(members.reverse().map(([key, node]) => [node, key])).entries()].sort((a, b) => Number(a[0]) - Number(b[0]))
    const probes    = result.doc.probes.flatMap((probe, i) => {
        const reading = result.getProbe(probe.id)
        const color   = probeColor(i)
        const voltage = probe.kind !== 'current' && reading.voltage
        const current = probe.kind !== 'voltage' && reading.current
        return [...voltage ? [{ id: `p:${probe.id}:v`, label: `${probe.id} V`, unit: 'V' as const, color, values: voltage }] : [], ...current ? [{ id: `p:${probe.id}:i`, label: `${probe.id} I`, unit: 'A' as const, color, values: current, dashed: probe.kind === 'both' }] : []]
    })
    const voltages  = nodes.map(([node, key], i): Series => ({ id: `v:${node}`, label: `V(${nameOf(result.doc, result.library, key)})`, unit: 'V', color: probeColor(result.doc.probes.length + i), values: result.getNodeSeries(node) }))
    const currents  = Object.keys(result.vectors).filter(name => name.endsWith('#branch') && !name.startsWith('vprobe_')).map((name, i): Series => ({ id: `i:${name}`, label: `I(${name.replace('#branch', '').toUpperCase()})`, unit: 'A', color: probeColor(result.doc.probes.length + nodes.length + i), values: result.vectors[name] }))
    return [...probes, ...voltages, ...currents]
}

const getInstruments = (result: Simulation) => result.circuit.simulated.flatMap(modelIndex => {
    const part    = result.getPart(modelIndex)
    const family  = part ? familyOf(part) : null
    const variant = (part?.properties.variant ?? '').toLowerCase()
    const node    = (key: string | null) => key && result.isWired(key) ? [`v:${result.circuit.nodes.get(key)}`] : []

    if (family === 'oscilloscope')
        return [1, 2, 3, 4].flatMap(channel => node(result.findKey(modelIndex, name => name === `v${channel} probe`)))

    if (family === 'multimeter' && variant.startsWith('ammeter'))
        return [`i:${result.getCurrentName(modelIndex)}`]

    return family === 'multimeter' ? node(result.findKey(modelIndex, name => name === 'v probe')) : []
})

// FONTE QUE DÁ O TESTE (SENOIDE ANTES DE PULSO), A TENSÃO NOS TERMINAIS DELA E OS NÓS LIGADOS A FONTES, QUE NÃO SÃO SAÍDA; UM NÓ FORA DAS NETS É O INTERNO ENTRE A FONTE E A RESISTÊNCIA INTERNA, QUE LEVA AO TERMINAL; AS FONTES DE 0 V DAS PONTAS NÃO CONTAM
const getStimulus = (result: Simulation) => {
    const elements = getElements(result.circuit.deck)
    const nets     = new Set(result.circuit.nodes.values())
    const supplies = elements.filter(element => element.kind === 'v' && !/^vprobe_/i.test(element.name))
    const timing   = getTiming(result.circuit.deck)
    const sources  = timing.sources
    const source   = sources.find(item => item.kind === 'sin') ?? sources.find(item => item.kind === 'pulse') ?? null
    const outer    = (node: string) => (nets.has(node) ? node : elements.find(element => element.kind === 'r' && element.nodes.includes(node))?.nodes.find(other => other !== node) ?? node).toLowerCase()
    const nodes    = (supplies.find(element => element.name === source?.name)?.nodes ?? []).map(outer)
    const input    = nodes.length === 2 ? Float64Array.from(result.getNodeSeries(nodes[0]), (value, i) => value - result.getNodeSeries(nodes[1])[i]) : null
    const driven   = new Set(supplies.flatMap(element => element.nodes.map(outer)))
    return { source, input, driven, events: timing.events }
}

const Measures = ({ series, options, chosen, time, step, toggle }: { series: Series[], options: Series[], chosen: string[], time: ArrayLike<number> | null, step: number, toggle: (id: string) => void }) => {
    const stats = useMemo(() => series.map(item => ({ item, stats: getStats(item.values, time, step) })), [series, time, step])
    const dash  = <td className="dash">—</td>

    return (
        <>
            <table className="tbl">
                <thead><tr><th>Medida</th><th>{time ? 'No cursor' : 'Valor'}</th><th>Média</th><th>RMS</th><th>Pico a pico</th></tr></thead>
                <tbody>
                    {stats.map(({ item, stats: value }) => (
                        <tr key={item.id}>
                            <td><span className="dot-s" style={{ background: item.color }} />{item.label}</td>
                            <td>{formatReading(value.value, item.unit)}</td>
                            {time ? <><td>{formatReading(value.mean, item.unit)}</td><td>{formatReading(value.rms, item.unit)}</td><td>{formatReading(value.pp, item.unit)}</td></> : <>{dash}{dash}{dash}</>}
                        </tr>
                    ))}
                    {!stats.length && <tr><td colSpan={5} className="dash">Nenhuma curva marcada.</td></tr>}
                </tbody>
            </table>
            <div className="chips" role="group" aria-label="Curvas exibidas">
                {options.map(option => <button key={option.id} className="chipb" aria-pressed={chosen.includes(option.id)} onClick={() => toggle(option.id)}><span className="dot-s" style={{ background: chosen.includes(option.id) ? option.color : 'var(--muted)' }} />{option.label}</button>)}
            </div>
        </>
    )
}

const sign = (gain: { gain: number, phase: number }) => Math.abs(gain.phase) > 90 ? -gain.gain : gain.gain

// LEITURA DA RESPOSTA DA CURVA ESCOLHIDA: DEGRAU (SUBIDA, τ, PICO, SOBRESSINAL, ACOMODAÇÃO, OSCILAÇÃO) OU GANHO E FASE FRENTE À FONTE SENOIDAL (SPEC 04 §8.8)
const Response = ({ report, options, curve, choose }: { report: Report | null, options: Series[], curve: Series | null, choose: (id: string) => void }) => {
    const unit = curve?.unit ?? 'V'
    const time = (seconds: number) => formatReading(seconds, 's')

    return (
        <>
            <div className="field">
                <label>Curva</label>
                <div className="in">
                    <select value={curve?.id ?? ''} onChange={event => choose(event.target.value)}>{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
                    <Icon name="chevronDown" />
                </div>
            </div>
            {report?.kind === 'step' && (() => {
                const r = report.response
                return (
                    <div className="summary">
                        <Kv label="Inicial → final" value={`${formatReading(r.initial, unit)} → ${formatReading(r.final, unit)}`} />
                        <Kv label="Subida (10–90%)" value={r.rise ? time(r.rise[1] - r.rise[0]) : '—'} />
                        {r.tau !== null && <Kv label="Constante τ (63%)" value={time(r.tau - r.from)} />}
                        <Kv label="Pico" value={`${formatReading(r.peak.value, unit)} em ${time(r.peak.time - r.from)}`} />
                        <Kv label="Sobressinal" value={`${(r.overshoot * 100).toFixed(1)}%`} />
                        <Kv label="Acomodação (±2%)" value={r.settling !== null ? time(r.settling - r.from) : 'não acomodou na janela'} />
                        {r.period !== null && <Kv label="Oscilação" value={`${time(r.period)} · ${formatReading(1 / r.period, 'Hz')}`} />}
                        {r.damping !== null && <Kv label="Amortecimento ζ" value={r.damping.toFixed(3)} />}
                        <p className="verdict" style={{ marginTop: 6 }}>{r.tau !== null ? `1ª ordem: em 5τ = ${time(5 * (r.tau - r.from))} chega a 99% do final.` : r.damping !== null ? `Subamortecida (ζ < 1): passa do final em ${(r.overshoot * 100).toFixed(1)}% e oscila até acomodar.` : 'Sem sobressinal.'}{!r.steady && ' A curva ainda varia no fim: aumente a janela em Ajustes.'}</p>
                    </div>
                )
            })()}
            {report?.kind === 'gain' && (
                <div className="summary">
                    <Kv label="Frequência" value={formatReading(report.gain.frequency, 'Hz')} />
                    <Kv label="Entrada (pico)" value={formatReading(report.gain.input.amplitude, unit)} />
                    <Kv label="Saída (pico)" value={formatReading(report.gain.output.amplitude, unit)} />
                    <Kv label="Ganho" value={`${sign(report.gain).toFixed(2)} V/V · ${report.gain.decibels.toFixed(1)} dB`} />
                    <Kv label="Fase" value={`${report.gain.phase.toFixed(0)}°`} />
                    <Kv label="Nível DC da saída" value={formatReading(report.gain.output.offset, unit)} />
                    <p className="verdict" style={{ marginTop: 6 }}>{Math.abs(report.gain.phase) > 135 ? 'Inversor: a saída fica em oposição de fase à entrada.' : Math.abs(report.gain.phase) < 45 ? 'Não inversor: a saída acompanha a entrada.' : 'A saída fica defasada da entrada.'}</p>
                </div>
            )}
            {!report && curve && <p className="verdict" style={{ marginTop: 8 }}>Esta curva não tem degrau nem senoide para medir. Escolha outra curva ou um teste em Ajustes.</p>}
        </>
    )
}

// DOCA DE SIMULAÇÃO: RESUMO DA RESPOSTA, REPRODUÇÃO DO TRANSITÓRIO, MEDIDAS, RESPOSTA, AJUSTES E O OSCILOSCÓPIO; ARRASTAR A BORDA DE CIMA MUDA A ALTURA (DESIGN.md §6)
export const SimulationPanel = () => {
    const simulation          = useStore(state => state.simulation)
    const doc                 = useStore(state => state.doc)
    const open                = useStore(state => state.show.chart)
    const readout             = useStore(state => state.readout)
    const [height, setHeight] = useState<number>(HEIGHT[1])
    const [curveId, setCurve] = useState<string | null>(null)
    const resizeRef           = useRef<{ y: number, height: number } | null>(null)
    const { play, pause, seek, setSimulation, setShow, setReadout } = useStore.getState()
    const result              = simulation.enabled ? simulation.result : null
    const step                = simulation.step
    const span                = useWindow()

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

    const options     = useMemo(() => result ? getOptions(result) : [], [result])
    const instruments = useMemo(() => result ? getInstruments(result) : [], [result])
    const stimulus    = useMemo(() => result ? getStimulus(result) : null, [result])
    const probed      = options.filter(option => option.id.startsWith('p:')).map(option => option.id)
    const automatic   = probed.length ? probed : instruments.length ? instruments : options.slice(0, DEFAULTS).map(option => option.id)
    const chosen      = [...new Set(simulation.series.length ? simulation.series : automatic)]
    const shown       = chosen.join()
    const series      = useMemo(() => shown.split(',').flatMap(id => options.filter(option => option.id === id)), [shown, options])
    const analysis    = result?.circuit.analysis
    const time        = analysis?.type === 'tran' ? result?.vectors.time ?? null : null
    const output      = (option: Series) => option.unit === 'V' && !stimulus?.driven.has(option.id.startsWith('p:') ? result?.circuit.meters.get(option.id.split(':')[1])?.node ?? '' : option.id.slice(2))
    const curve       = options.find(option => option.id === curveId) ?? options.find(option => chosen.includes(option.id) && output(option)) ?? options.find(output) ?? options[0] ?? null
    const report      = useMemo(() => time && curve && stimulus ? getReport(time, curve.values, stimulus.source, stimulus.input, stimulus.events) : null, [time, curve, stimulus])
    const marks       = report?.kind === 'step' && curve && series.includes(curve) ? { color: curve.color, unit: curve.unit, response: report.response } : null
    const toggle      = (id: string) => setSimulation({ series: chosen.includes(id) ? chosen.filter(other => other !== id) : [...chosen, id] })
    const playing     = simulation.playing

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

    const finding = !simulation.enabled                                 ? `parada · ${simulation.transient ? 'transitório' : 'ponto de operação'}: aperte Simular` :
                    simulation.busy                                     ? 'simulando…' :
                    simulation.error                                    ? `erro: ${simulation.error}` :
                    analysis?.type === 'op'                             ? 'ponto de operação (DC): valores de regime' :
                    report?.kind === 'step' && report.response.tau !== null ? `${curve?.label}: τ = ${formatReading(report.response.tau - report.response.from, 's')} · final ${formatReading(report.response.final, curve?.unit ?? 'V')}` :
                    report?.kind === 'step'                             ? `${curve?.label}: sobressinal ${(report.response.overshoot * 100).toFixed(1)}% · pico ${formatReading(report.response.peak.value, curve?.unit ?? 'V')}${report.response.settling !== null ? ` · acomoda em ${formatReading(report.response.settling - report.response.from, 's')}` : ''}` :
                    report?.kind === 'gain'                             ? `${curve?.label}: ganho ${sign(report.gain).toFixed(2)} (${report.gain.decibels.toFixed(1)} dB) a ${formatReading(report.gain.frequency, 'Hz')}` :
                    analysis?.type === 'tran'                           ? `transitório ${formatSi(analysis.t0, 's')} – ${formatSi(analysis.t1, 's')} · ${result?.steps} pontos` : 'aguardando o circuito'

    return (
        <section className={`dock card ${open ? '' : 'collapsed'}`} style={open ? { height } : undefined} aria-label="Simulação">
            {open && <div className="dock-grip" onPointerDown={onResize} onPointerMove={onResize} onPointerUp={onResize} />}
            <header className="dock-head">
                <div className="dock-title">
                    <h2>Simulação</h2>
                    <p className={`sub ${simulation.enabled && simulation.error ? 'err' : ''}`} title={finding}>{finding}</p>
                </div>
                <div className="dock-ctl">
                    {simulation.transient && (
                        <div className="win" title="Fim da janela do transitório: digite para fixar; auto volta ao cálculo automático">
                            <span>até</span>
                            <TimeField label="Fim da janela" value={span.stop} commit={seconds => setWindow('stop', seconds)} />
                            {span.custom && <button className="chipb" onClick={() => useStore.getState().setProjectProperties({ [PRESET_KEY]: 'auto' })}>auto</button>}
                        </div>
                    )}
                    {time && result && <>
                        <button className="icon-btn" aria-label="Voltar ao início" title="Voltar ao início" onClick={() => { seek(0); play() }}><Icon name="reset" /></button>
                        <button className="icon-btn" aria-label={playing ? 'Pausar' : 'Reproduzir'} title={playing ? 'Pausar' : 'Reproduzir'} onClick={playing ? pause : play}><Icon name={playing ? 'pause' : 'play'} /></button>
                        <input type="range" min={0} max={result.steps - 1} value={step} aria-label="Instante da simulação" onChange={event => seek(Number(event.target.value))} />
                        <span className="num tread">t = {formatReading(result.getTime(step), 's')}</span>
                    </>}
                    <button className="icon-btn toggle" aria-label={open ? 'Recolher simulação' : 'Abrir simulação'} aria-expanded={open} title={open ? 'Recolher' : 'Abrir'} onClick={() => setShow({ chart: !open })}><Icon name="chevronDown" /></button>
                </div>
            </header>
            {open && (
                <div className="dock-body">
                    <div className="meas">
                        <div className="tabs" role="tablist">{TABS.map(([id, label]) => <button key={id} className="tab" role="tab" aria-selected={readout === id} onClick={() => setReadout(id)}>{label}</button>)}</div>
                        {readout === 'measures' && (result ? <Measures series={series} options={options} chosen={chosen} time={time} step={step} toggle={toggle} /> : <p className="verdict">{doc.probes.length ? 'As pontas aparecem aqui com o resultado.' : 'Escolha V, A ou V·A na barra do quadro e clique num fio ou terminal para medir.'}</p>)}
                        {readout === 'response' && (time ? <Response report={report} options={options} curve={curve} choose={setCurve} /> : <p className="verdict">{result ? 'A resposta no tempo aparece no Transitório.' : 'Simule no Transitório para medir subida, sobressinal, acomodação ou ganho.'}</p>)}
                        {readout === 'settings' && <SimulationSettings />}
                    </div>
                    {time && result ? <Grapher time={time} series={series} step={step} marks={marks} seek={index => { pause(); seek(index) }} /> : (
                        <div className="scope">
                            <div className="scope-cap">
                                {!simulation.enabled ? <>Aperte <b>Simular</b> para ver as curvas das pontas de prova.<br /><span className="muted">Em Ajustes: degrau, onda quadrada, senoide ou janela manual.</span></> :
                                 simulation.busy     ? 'Simulando…' :
                                 analysis?.type === 'op' ? <>Ponto de operação: cada ponta mostra o valor de regime.<br /><button className="btn sm" style={{ marginTop: 10 }} onClick={() => setSimulation({ transient: true })}>Ver no tempo (Transitório)</button></> : simulation.error ? <span className="muted">Veja o erro em Problemas.</span> : 'Aguardando o circuito.'}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </section>
    )
}
