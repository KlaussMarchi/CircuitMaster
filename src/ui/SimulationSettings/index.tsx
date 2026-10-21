import { formatSi, parseSi } from '../../core/Properties'
import { INITIAL_KEY, PRESET_KEY, PROJECT_DEFAULTS, START_KEY, STOP_KEY, getMode, projectValue, type Mode } from '../../core/Spice'
import { Entry, TimeField } from '../Inspector'
import { useStore } from '../Store'

const REAL_TIME = '-1s'    // ANIMAÇÃO NEGATIVA = TEMPO REAL (SPEC 04 §5.2)

const PRESETS: [Mode, string, string, string][] = [
    ['auto', 'Automático', 'A janela sai da escala de tempo do circuito: constantes RC, ressonâncias LC e o período das fontes.', 'M2 20C12 20 16 5 42 4'],
    ['step', 'Degrau', 'Liga as fontes em t = 0 com capacitores e indutores descarregados: carga, sobressinal e acomodação.', 'M2 20h9V8c3-6 6-6 8-1s5 1 7 0 4-1 16-1'],
    ['square', 'Onda quadrada', 'Três períodos da fonte pulsada a partir do ponto de operação: carga e descarga.', 'M2 20h8V4h11v16h11V4h10'],
    ['sine', 'Senoide', 'Cinco períodos da fonte senoidal em regime: ganho e fase de amplificadores e filtros.', 'M2 12c4-10 7-10 9 0s6 10 9 0 6-10 9 0 6 10 9 0 3-6 4-6'],
    ['custom', 'Manual', 'Você escolhe início, fim, amostragem e se o circuito parte descarregado.', 'M4 7h36M4 17h36M14 4v6M28 14v6']
]

const SECONDS: [string, number][] = [['s', 1], ['ms', 1e-3]]

// JANELA DO TRANSITÓRIO DIGITADA: PASSA A MANUAL A PARTIR DA JANELA QUE ESTAVA VALENDO (MESMO INÍCIO, PONTOS E CONDIÇÃO INICIAL) E MUDA SÓ A PONTA EDITADA
export const setWindow = (edge: 'start' | 'stop', seconds: number) => {
    const { doc, simulation, setProjectProperties, setSimulation } = useStore.getState()
    const analysis = simulation.result?.circuit.analysis
    const tran     = analysis?.type === 'tran' ? analysis : null
    const custom   = getMode(doc) === 'custom'
    const start    = edge === 'start' ? seconds : custom ? parseSi(projectValue(doc, START_KEY), 's') ?? 0 : tran?.t0 ?? 0
    const stop     = edge === 'stop' ? seconds : custom ? parseSi(projectValue(doc, STOP_KEY), 's') ?? 0 : tran?.t1 ?? 0

    if (stop <= start)
        return useStore.setState({ message: 'o fim da janela tem de ser depois do início' })

    const kept: Record<string, string> = custom ? {} : { simulator_time_step_mode: 'false', simulator_number_of_steps: String(tran?.steps ?? 500), [INITIAL_KEY]: tran?.initial ?? 'op' }
    setProjectProperties({ ...kept, [PRESET_KEY]: 'custom', [START_KEY]: formatSi(start, 's', 6), [STOP_KEY]: formatSi(stop, 's', 6) })
    setSimulation({ transient: true })
}

// INÍCIO E FIM DA JANELA EM VIGOR: O DO ÚLTIMO RESULTADO NO TRANSITÓRIO, SENÃO O GRAVADO NA JANELA MANUAL
export const useWindow = () => {
    const doc      = useStore(state => state.doc)
    const analysis = useStore(state => state.simulation.enabled ? state.simulation.result?.circuit.analysis : undefined)
    const custom   = getMode(doc) === 'custom'

    if (analysis?.type === 'tran')
        return { start: analysis.t0, stop: analysis.t1, custom }

    return { start: custom ? parseSi(projectValue(doc, START_KEY), 's') : null, stop: custom ? parseSi(projectValue(doc, STOP_KEY), 's') : null, custom }
}

const Seg = <T extends string>({ value, options, change }: { value: T, options: [T, string][], change: (value: T) => void }) => (
    <div className="seg tabs" role="tablist">{options.map(([id, label]) => <button key={id} className="tab" role="tab" aria-selected={value === id} onClick={() => change(id)}>{label}</button>)}</div>
)

// AJUSTES DA SIMULAÇÃO NA DOCA: ANÁLISE, MODELO DE TESTE DO TRANSITÓRIO, JANELA E AMOSTRAGEM, ANIMAÇÃO, EXIBIÇÃO E OPÇÕES DO SPICE (SPEC 04 §5.2, §5.5, §9)
export const SimulationSettings = () => {
    const doc        = useStore(state => state.doc)
    const transient  = useStore(state => state.simulation.transient)
    const result     = useStore(state => state.simulation.result)
    const show       = useStore(state => state.show)
    const { setProjectProperties, setSimulation, setShow } = useStore.getState()
    const value      = (key: string) => projectValue(doc, key)
    const mode       = getMode(doc)
    const fixed      = value('simulator_time_step_mode').toLowerCase().includes('true')
    const realtime   = (parseSi(value('simulator_animation_time_s'), 's') ?? 0) < 0
    const analysis   = result?.circuit.analysis.type === 'tran' ? result.circuit.analysis : null
    const span       = useWindow()
    const write      = (key: string, text: string, valid: boolean) => valid ? setProjectProperties({ [key]: text }) : useStore.setState({ message: `${text}: valor inválido` })

    const choose = (next: Mode) => {
        const kept: Record<string, string> = next === 'custom' && analysis && !value(STOP_KEY) ? { [START_KEY]: formatSi(analysis.t0, 's', 6), [STOP_KEY]: formatSi(analysis.t1, 's', 6), simulator_number_of_steps: String(analysis.steps), simulator_time_step_mode: 'false', [INITIAL_KEY]: analysis.initial } : {}
        setProjectProperties({ [PRESET_KEY]: next, ...kept })
        setSimulation({ transient: true })
    }

    return (
        <>
            <div className="sec">
                <h3>Análise</h3>
                <Seg value={transient ? 'tran' : 'op'} options={[['op', 'Ponto de operação (DC)'], ['tran', 'Transitório']]} change={item => setSimulation({ transient: item === 'tran' })} />
                {!transient && <p className="sub" style={{ marginTop: 6 }}>Cada ponta mostra o valor de regime. Escolha Transitório para ver a resposta no tempo.</p>}
            </div>
            {transient && (
                <div className="sec">
                    <h3>Teste</h3>
                    <div className="modes">
                        {PRESETS.map(([id, label, text, wave]) => (
                            <button key={id} className="mode" aria-pressed={mode === id} onClick={() => choose(id)}>
                                <svg className="wave" viewBox="0 0 44 24" aria-hidden><path d={wave} /></svg>
                                <span><b>{label}</b><small>{text}</small></span>
                            </button>
                        ))}
                    </div>
                    {analysis && <p className="basis"><span className="num">{analysis.steps}</span> pontos · passo <span className="num">{formatSi(analysis.step, 's')}</span> · {analysis.initial === 'zero' ? 'parte descarregado' : 'parte do ponto de operação'}</p>}
                </div>
            )}
            {transient && (
                <div className="sec">
                    <h3>Janela {mode !== 'custom' && <span className="pill neutral">automática</span>}</h3>
                    <div className="field"><label>Início</label><TimeField label="Início" value={span.start} commit={seconds => setWindow('start', seconds)} /></div>
                    <div className="field"><label>Fim</label><TimeField label="Fim" value={span.stop} commit={seconds => setWindow('stop', seconds)} /></div>
                    {mode === 'custom' && <div className="field"><label>Amostragem</label><Seg value={fixed ? 'step' : 'points'} options={[['points', 'Pontos'], ['step', 'Passo fixo']]} change={item => setProjectProperties({ simulator_time_step_mode: String(item === 'step') })} /></div>}
                    {mode === 'custom' && (fixed ? <div className="field"><label>Passo</label><TimeField label="Passo" value={parseSi(value('simulator_time_step_s'), 's')} commit={seconds => seconds > 0 && setProjectProperties({ simulator_time_step_s: formatSi(seconds, 's', 6) })} /></div> : <div className="field"><label>Pontos</label><Entry value={value('simulator_number_of_steps')} options={['200', '400', '1000', '5000']} numeric commit={text => write('simulator_number_of_steps', text || '400', Number(text || 400) >= 2)} /></div>)}
                    {mode === 'custom' && <div className="field"><label>Começa</label><Seg value={value(INITIAL_KEY) === 'zero' ? 'zero' : 'op'} options={[['zero', 'Descarregado'], ['op', 'Em regime']]} change={item => setProjectProperties({ [INITIAL_KEY]: item })} /></div>}
                    <p className="sub" style={{ marginTop: 4 }}>{mode === 'custom' ? 'Janela escolhida por você.' : 'Calculada para mostrar a resposta inteira; digite um valor para fixar a sua.'}{mode === 'custom' && <> <button className="link" onClick={() => choose('auto')}>Voltar ao automático</button></>}</p>
                </div>
            )}
            {transient && (
                <div className="sec">
                    <h3>Animação</h3>
                    <div className="field"><label>Duração</label><TimeField label="Duração da animação" units={SECONDS} value={realtime ? null : parseSi(value('simulator_animation_time_s'), 's')} commit={seconds => setProjectProperties({ simulator_animation_time_s: formatSi(seconds, 's', 6) })} /></div>
                    <label className="checkrow"><input type="checkbox" checked={realtime} onChange={event => setProjectProperties({ simulator_animation_time_s: event.target.checked ? REAL_TIME : PROJECT_DEFAULTS.simulator_animation_time_s })} />Tempo real (1 s simulado leva 1 s)</label>
                </div>
            )}
            <div className="sec">
                <h3>Exibição</h3>
                <label className="checkrow"><input type="checkbox" checked={show.values} onChange={event => setShow({ values: event.target.checked })} />Valores das pontas sobre o circuito</label>
            </div>
            <div className="sec">
                <h3>Opções do SPICE</h3>
                <Entry value={value('simulator_spice_options')} options={['.options reltol=1e-4']} numeric={false} commit={text => setProjectProperties({ simulator_spice_options: text.trim() })} />
            </div>
        </>
    )
}
