import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { splitKey, type Doc } from '../../core/Document'
import type { Library } from '../../core/Library'
import { formatReading, formatSi, parseSi } from '../../core/Properties'
import { getElements, getTiming } from '../../core/Timing'
import { INITIAL_KEY, PRESET_KEY, PROJECT_DEFAULTS, START_KEY, STOP_KEY, getMode, projectValue, type Mode } from '../../core/Spice'
import { getStats, familyOf, type Simulation } from '../../engine/Simulation'
import { getReport, type Report } from '../../engine/Response'
import { Grapher, type Series } from '../Grapher'
import { Icon } from '../Icon'
import { Entry, Kv, TimeField } from '../Inspector'
import { probeColor } from '../Probe'
import { useStore } from '../Store'

const DEFAULTS  = 3                          // CURVAS MOSTRADAS QUANDO NÃO HÁ PONTA NEM INSTRUMENTO
const HEIGHT    = [220, 320, 640] as const   // PX: MÍNIMO, INICIAL E MÁXIMO DA DOCA ABERTA
const REAL_TIME = '-1s'                      // ANIMAÇÃO NEGATIVA = TEMPO REAL (SPEC 04 §5.2)
const SECONDS: [string, number][] = [['s', 1], ['ms', 1e-3]]

// OS TESTES DO TRANSITÓRIO COM A FRASE DE PARA QUE SERVE CADA UM (SPEC 04 §5.5)
export const TESTS: [Mode, string, string][] = [
    ['auto', 'Automático', 'A janela sai da escala de tempo do circuito: constantes RC, ressonâncias LC e o período das fontes.'],
    ['step', 'Degrau', 'Liga as fontes em t = 0 com capacitores e indutores descarregados: carga, sobressinal e acomodação.'],
    ['square', 'Onda quadrada', 'Três períodos da fonte pulsada a partir do ponto de operação: carga e descarga.'],
    ['sine', 'Senoide', 'Cinco períodos da fonte senoidal em regime: ganho e fase de amplificadores e filtros.'],
    ['custom', 'Manual', 'Você escolhe início, fim, amostragem e se o circuito parte descarregado.']
]

// JANELA DO TRANSITÓRIO DIGITADA: PASSA A MANUAL A PARTIR DA JANELA QUE ESTAVA VALENDO (MESMO INÍCIO, PONTOS E CONDIÇÃO INICIAL) E MUDA SÓ A PONTA EDITADA
const setWindow = (edge: 'start' | 'stop', seconds: number) => {
    const { doc, simulation, setProjectProperties } = useStore.getState()
    const analysis = simulation.result?.circuit.analysis
    const tran     = analysis?.type === 'tran' ? analysis : null
    const custom   = getMode(doc) === 'custom'
    const start    = edge === 'start' ? seconds : custom ? parseSi(projectValue(doc, START_KEY), 's') ?? 0 : tran?.t0 ?? 0
    const stop     = edge === 'stop' ? seconds : custom ? parseSi(projectValue(doc, STOP_KEY), 's') ?? 0 : tran?.t1 ?? 0

    if (stop <= start)
        return useStore.setState({ message: 'o fim da janela tem de ser depois do início' })

    const kept: Record<string, string> = custom ? {} : { simulator_time_step_mode: 'false', simulator_number_of_steps: String(tran?.steps ?? 500), [INITIAL_KEY]: tran?.initial ?? 'op' }
    setProjectProperties({ ...kept, [PRESET_KEY]: 'custom', [START_KEY]: formatSi(start, 's', 6), [STOP_KEY]: formatSi(stop, 's', 6) })
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

// POR QUE O TESTE ESCOLHIDO DEU SÓ O REGIME: NADA MUDA NO TEMPO E O QUE FARIA MUDAR
const STILL: Record<Mode, string> = {
    auto: 'regime (ponto de operação): nada muda no tempo neste circuito; Degrau mostra a carga desde o circuito descarregado',
    step: 'regime (ponto de operação)',
    square: 'Onda quadrada precisa de uma fonte de pulso no circuito; sem ela nada muda no tempo e o painel mostra o regime',
    sine: 'Senoide precisa de um gerador senoidal no circuito; sem ele nada muda no tempo e o painel mostra o regime',
    custom: 'regime (ponto de operação): nada muda no tempo; em ⋯, Começa descarregado mostra a carga'
}

const Seg = <T extends string>({ value, options, change, label }: { value: T, options: [T, string, string?][], change: (value: T) => void, label: string }) => (
    <div className="seg tabs" role="tablist" aria-label={label}>{options.map(([id, text, hint]) => <button key={id} className="tab" role="tab" aria-selected={value === id} title={hint} onClick={() => change(id)}>{text}</button>)}</div>
)

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


const sign = (gain: { gain: number, phase: number }) => Math.abs(gain.phase) > 90 ? -gain.gain : gain.gain

// COLUNA DAS CURVAS: BUSCA, CAIXA PARA MOSTRAR OU ESCONDER E A COR; O NOME ESCOLHE A CURVA DAS MEDIDAS
const Curves = ({ options, chosen, focus, toggle, pick }: { options: Series[], chosen: string[], focus: string | null, toggle: (id: string) => void, pick: (id: string) => void }) => {
    const [query, setQuery] = useState('')
    const shown             = options.filter(option => option.label.toLowerCase().includes(query.trim().toLowerCase()))

    return (
        <div className="sim-col curves" aria-label="Curvas">
            <label className="search"><Icon name="search" /><input type="search" placeholder="Buscar curva" aria-label="Buscar curva" value={query} onChange={event => setQuery(event.target.value)} /></label>
            <ul className="curve-list">
                {shown.map(option => (
                    <li key={option.id}>
                        <input type="checkbox" checked={chosen.includes(option.id)} aria-label={`Mostrar ${option.label}`} onChange={() => toggle(option.id)} />
                        <span className="dot-s" style={{ background: option.color }} />
                        <button className={`curve${focus === option.id ? ' current' : ''}`} aria-pressed={focus === option.id} title="Medir esta curva" onClick={() => pick(option.id)}>{option.label}</button>
                    </li>
                ))}
            </ul>
            {!options.length && <p className="verdict">As curvas aparecem ao simular: pontas de prova, tensões dos nós e correntes das fontes.</p>}
        </div>
    )
}

// COLUNA DAS MEDIDAS DA CURVA ESCOLHIDA: VALOR NO CURSOR, MÉDIA, RMS E PICO A PICO; SUBIDA, τ, SOBRESSINAL, ACOMODAÇÃO, PERÍODO, ζ, GANHO E FASE SÓ QUANDO VALEM (SPEC 04 §8.8)
const Readings = ({ curve, time, step, report }: { curve: Series | null, time: ArrayLike<number> | null, step: number, report: Report | null }) => {
    const stats = useMemo(() => curve ? getStats(curve.values, time, step) : null, [curve, time, step])
    const unit  = curve?.unit ?? 'V'
    const at    = (seconds: number) => formatReading(seconds, 's')
    const r     = report?.kind === 'step' ? report.response : null
    const gain  = report?.kind === 'gain' ? report.gain : null

    if (!curve || !stats)
        return <div className="sim-col readings" aria-label="Medidas"><p className="verdict">As medidas da curva escolhida aparecem aqui: valor, média, RMS, pico a pico e, quando valem, subida, τ, sobressinal, acomodação, período, ganho e fase.</p></div>

    return (
        <div className="sim-col readings" aria-label="Medidas">
            <h3><span className="dot-s" style={{ background: curve.color }} />{curve.label}</h3>
            <Kv label={time ? 'No cursor' : 'Valor (regime)'} value={formatReading(stats.value, unit)} />
            {time && <Kv label="Média" value={formatReading(stats.mean, unit)} />}
            {time && <Kv label="RMS" value={formatReading(stats.rms, unit)} />}
            {time && <Kv label="Pico a pico" value={formatReading(stats.pp, unit)} />}
            {time && stats.frequency !== null && !gain && <Kv label="Período" value={`${at(1 / stats.frequency)} · ${formatReading(stats.frequency, 'Hz')}`} />}
            {r && <Kv label="Inicial → final" value={`${formatReading(r.initial, unit)} → ${formatReading(r.final, unit)}`} />}
            {r?.rise && <Kv label="Subida (10–90%)" value={at(r.rise[1] - r.rise[0])} />}
            {r && r.tau !== null && <Kv label="Constante τ (63%)" value={at(r.tau - r.from)} />}
            {r && r.overshoot > 0 && <Kv label="Sobressinal" value={`${(r.overshoot * 100).toFixed(1)}% · pico ${formatReading(r.peak.value, unit)}`} />}
            {r && <Kv label="Acomodação (±2%)" value={r.settling !== null ? at(r.settling - r.from) : 'não acomodou na janela'} />}
            {r && r.period !== null && <Kv label="Oscilação" value={`${at(r.period)} · ${formatReading(1 / r.period, 'Hz')}`} />}
            {r && r.damping !== null && <Kv label="Amortecimento ζ" value={r.damping.toFixed(3)} />}
            {gain && <Kv label="Frequência" value={formatReading(gain.frequency, 'Hz')} />}
            {gain && <Kv label="Ganho" value={`${sign(gain).toFixed(2)} V/V · ${gain.decibels.toFixed(1)} dB`} />}
            {gain && <Kv label="Fase" value={`${gain.phase.toFixed(0)}°`} />}
            {gain && <Kv label="Nível DC da saída" value={formatReading(gain.output.offset, unit)} />}
            <p className="verdict">{!time ? 'Nada muda no tempo neste circuito: cada valor é o de regime (ponto de operação).' : r ? (r.tau !== null ? `1ª ordem: em 5τ = ${at(5 * (r.tau - r.from))} chega a 99% do final.` : r.damping !== null ? `Subamortecida (ζ < 1): passa do final em ${(r.overshoot * 100).toFixed(1)}% e oscila até acomodar.` : 'Sem sobressinal.') + (r.steady ? '' : ' A curva ainda varia no fim: aumente o fim da janela.') : gain ? (Math.abs(gain.phase) > 135 ? 'Inversor: a saída fica em oposição de fase à entrada.' : Math.abs(gain.phase) < 45 ? 'Não inversor: a saída acompanha a entrada.' : 'A saída fica defasada da entrada.') : 'Sem degrau nem senoide para medir resposta nesta curva: escolha Degrau ou Senoide no teste.'}</p>
        </div>
    )
}

// OPÇÕES RARAS DO PAINEL ATRÁS DO "⋯": ANIMAÇÃO, VALORES SOBRE O CIRCUITO, AMOSTRAGEM DO MANUAL E OPÇÕES DO SPICE
const More = ({ close }: { close: () => void }) => {
    const doc      = useStore(state => state.doc)
    const show     = useStore(state => state.show)
    const { setProjectProperties, setShow } = useStore.getState()
    const value    = (key: string) => projectValue(doc, key)
    const manual   = getMode(doc) === 'custom'
    const fixed    = value('simulator_time_step_mode').toLowerCase().includes('true')
    const realtime = (parseSi(value('simulator_animation_time_s'), 's') ?? 0) < 0
    const write    = (key: string, text: string, valid: boolean) => valid ? setProjectProperties({ [key]: text }) : useStore.setState({ message: `${text}: valor inválido` })

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close()
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [close])

    return (
        <div className="sim-more" role="dialog" aria-label="Opções da simulação">
            <div className="sec">
                <h3>Animação</h3>
                <div className="field"><label>Duração</label><TimeField label="Duração da animação" units={SECONDS} value={realtime ? null : parseSi(value('simulator_animation_time_s'), 's')} commit={seconds => setProjectProperties({ simulator_animation_time_s: formatSi(seconds, 's', 6) })} /></div>
                <label className="checkrow"><input type="checkbox" checked={realtime} onChange={event => setProjectProperties({ simulator_animation_time_s: event.target.checked ? REAL_TIME : PROJECT_DEFAULTS.simulator_animation_time_s })} />Tempo real (1 s simulado leva 1 s)</label>
                <label className="checkrow"><input type="checkbox" checked={show.values} onChange={event => setShow({ values: event.target.checked })} />Valores das pontas sobre o circuito</label>
            </div>
            {manual && (
                <div className="sec">
                    <h3>Amostragem do teste manual</h3>
                    <div className="field"><label>Amostragem</label><Seg label="Amostragem" value={fixed ? 'step' : 'points'} options={[['points', 'Pontos'], ['step', 'Passo fixo']]} change={item => setProjectProperties({ simulator_time_step_mode: String(item === 'step') })} /></div>
                    {fixed ? <div className="field"><label>Passo</label><TimeField label="Passo" value={parseSi(value('simulator_time_step_s'), 's')} commit={seconds => seconds > 0 && setProjectProperties({ simulator_time_step_s: formatSi(seconds, 's', 6) })} /></div> : <div className="field"><label>Pontos</label><Entry value={value('simulator_number_of_steps')} options={['200', '400', '1000', '5000']} numeric commit={text => write('simulator_number_of_steps', text || '400', Number(text || 400) >= 2)} /></div>}
                    <div className="field"><label>Começa</label><Seg label="Condição inicial" value={value(INITIAL_KEY) === 'zero' ? 'zero' : 'op'} options={[['zero', 'Descarregado'], ['op', 'Em regime']]} change={item => setProjectProperties({ [INITIAL_KEY]: item })} /></div>
                </div>
            )}
            <div className="sec">
                <h3>Opções do SPICE</h3>
                <Entry value={value('simulator_spice_options')} options={['.options reltol=1e-4']} numeric={false} commit={text => setProjectProperties({ simulator_spice_options: text.trim() })} />
            </div>
        </div>
    )
}

// PAINEL ÚNICO DE SIMULAÇÃO: NO CABEÇALHO O TESTE, A JANELA E A REPRODUÇÃO; NO CORPO AS CURVAS, O GRÁFICO SEMPRE VISÍVEL E AS MEDIDAS DA CURVA ESCOLHIDA; ARRASTAR A BORDA DE CIMA MUDA A ALTURA (FRIZING_KICAD §5, DECISÃO 3)
export const SimulationPanel = () => {
    const simulation          = useStore(state => state.simulation)
    const doc                 = useStore(state => state.doc)
    const open                = useStore(state => state.show.chart)
    const [height, setHeight] = useState<number>(HEIGHT[1])
    const [more, setMore]     = useState(false)
    const resizeRef           = useRef<{ y: number, height: number } | null>(null)
    const { play, pause, seek, setSimulation, setShow, setTest } = useStore.getState()
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

    const options     = useMemo(() => result ? getOptions(result) : [], [result])
    const instruments = useMemo(() => result ? getInstruments(result) : [], [result])
    const stimulus    = useMemo(() => result ? getStimulus(result) : null, [result])
    const probed      = options.filter(option => option.id.startsWith('p:')).map(option => option.id)
    const automatic   = probed.length ? probed : instruments.length ? instruments : options.slice(0, DEFAULTS).map(option => option.id)
    const chosen      = [...new Set(simulation.series.length ? simulation.series : automatic)]
    const shown       = chosen.join()
    const series      = useMemo(() => shown.split(',').flatMap(id => options.filter(option => option.id === id)), [shown, options])
    const analysis    = result?.circuit.analysis
    const still       = result?.isStill() ?? false
    const time        = analysis?.type === 'tran' && !still ? result?.vectors.time ?? null : null
    const output      = (option: Series) => option.unit === 'V' && !stimulus?.driven.has(option.id.startsWith('p:') ? result?.circuit.meters.get(option.id.split(':')[1])?.node ?? '' : option.id.slice(2))
    const curve       = options.find(option => option.id === simulation.focus) ?? options.find(option => chosen.includes(option.id) && output(option)) ?? options.find(output) ?? options[0] ?? null
    const report      = useMemo(() => time && curve && stimulus ? getReport(time, curve.values, stimulus.source, stimulus.input, stimulus.events) : null, [time, curve, stimulus])
    const marks       = report?.kind === 'step' && curve && series.includes(curve) ? { color: curve.color, unit: curve.unit, response: report.response } : null
    const regime      = useMemo(() => series.map(item => ({ ...item, values: [item.values[0] ?? 0, item.values[0] ?? 0] })), [series])
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

    const finding = !simulation.enabled                                     ? 'parada: aperte Simular' :
                    simulation.busy                                         ? 'simulando…' :
                    simulation.error                                        ? `erro: ${simulation.error}` :
                    still                                                   ? STILL[mode] :
                    report?.kind === 'step' && report.response.tau !== null ? `${curve?.label}: τ = ${formatReading(report.response.tau - report.response.from, 's')} · final ${formatReading(report.response.final, curve?.unit ?? 'V')}` :
                    report?.kind === 'step'                                 ? `${curve?.label}: sobressinal ${(report.response.overshoot * 100).toFixed(1)}% · pico ${formatReading(report.response.peak.value, curve?.unit ?? 'V')}` :
                    report?.kind === 'gain'                                 ? `${curve?.label}: ganho ${sign(report.gain).toFixed(2)} (${report.gain.decibels.toFixed(1)} dB) a ${formatReading(report.gain.frequency, 'Hz')}` :
                    analysis?.type === 'tran'                               ? `transitório ${formatSi(analysis.t0, 's')} – ${formatSi(analysis.t1, 's')} · ${result?.steps} pontos` : 'aguardando o circuito'

    return (
        <section className={`dock card ${open ? '' : 'collapsed'}`} style={open ? { height } : undefined} aria-label="Simulação">
            {open && <div className="dock-grip" onPointerDown={onResize} onPointerMove={onResize} onPointerUp={onResize} />}
            <header className="dock-head">
                <div className="dock-title">
                    <h2>Simulação</h2>
                    <p className={`sub ${simulation.enabled && simulation.error ? 'err' : ''}`} title={finding}>{finding}</p>
                </div>
                <div className="dock-ctl">
                    <Seg label="Teste" value={mode} options={TESTS} change={setTest} />
                    <div className="win" title={mode === 'custom' ? 'Janela do teste manual' : 'Fim da janela: digite para fixar (passa a Manual)'}>
                        {mode === 'custom' && <><span>de</span><TimeField label="Início da janela" value={span.start} commit={seconds => setWindow('start', seconds)} /></>}
                        <span>até</span>
                        <TimeField label="Fim da janela" value={span.stop} commit={seconds => setWindow('stop', seconds)} />
                    </div>
                    {time && result && <>
                        <button className="icon-btn" aria-label="Voltar ao início" title="Voltar ao início" onClick={() => { seek(0); play() }}><Icon name="reset" /></button>
                        <button className="icon-btn" aria-label={playing ? 'Pausar' : 'Reproduzir'} title={playing ? 'Pausar' : 'Reproduzir'} onClick={playing ? pause : play}><Icon name={playing ? 'pause' : 'play'} /></button>
                        <input type="range" min={0} max={result.steps - 1} value={step} aria-label="Instante da simulação" onChange={event => seek(Number(event.target.value))} />
                        <span className="num tread">t = {formatReading(result.getTime(step), 's')}</span>
                    </>}
                    <div className="more-wrap">
                        <button className="icon-btn" aria-label="Mais opções da simulação" aria-expanded={more} title="Animação, valores sobre o circuito, amostragem e opções do SPICE" onClick={() => setMore(!more)}><Icon name="more" /></button>
                        {more && <More close={() => setMore(false)} />}
                    </div>
                    <button className="icon-btn toggle" aria-label={open ? 'Recolher simulação' : 'Abrir simulação'} aria-expanded={open} title={open ? 'Recolher' : 'Abrir'} onClick={() => setShow({ chart: !open })}><Icon name="chevronDown" /></button>
                </div>
            </header>
            {open && (
                <div className="sim-body">
                    <Curves options={options} chosen={chosen} focus={curve?.id ?? null} toggle={toggle} pick={id => setSimulation({ focus: id })} />
                    {result && time ? <Grapher time={time} series={series} step={step} marks={marks} seek={index => { pause(); seek(index) }} /> : result && still ? <Grapher time={[0, 1]} series={regime} step={1} marks={null} still seek={() => {}} /> : (
                        <div className="scope">
                            <div className="scope-cap">
                                {!simulation.enabled ? <>Aperte <b>Simular</b>: o ponto de operação e, se algo mudar no tempo, o transitório na janela do teste.<br /><span className="muted">{doc.probes.length ? 'As pontas de prova viram curvas aqui.' : 'Use V, A ou V·A na barra do quadro para medir um fio ou terminal.'}</span></> :
                                 simulation.busy     ? 'Simulando…' :
                                 simulation.error    ? <span className="muted">Veja a causa em Problemas.</span> : 'Aguardando o circuito.'}
                            </div>
                        </div>
                    )}
                    <Readings curve={curve} time={time} step={step} report={report} />
                </div>
            )}
        </section>
    )
}
