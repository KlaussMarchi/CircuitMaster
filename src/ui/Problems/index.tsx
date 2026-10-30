import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { apply, invert } from '../../core/Geometry'
import type { Rule, Violation } from '../../core/Drc'
import { VIEW_LABELS } from '../../core/Layer'
import { focusPart } from '../Outline'
import { useStore } from '../Store'
import { t } from '../../core/Text'

type State   = Pick<ReturnType<typeof useStore.getState>, 'simulation' | 'doc' | 'library' | 'netlist' | 'view' | 'drc'>
type Problem = { level: 'bad' | 'warn' | 'info' | 'ok', title: string, text: string, select?: string[], show?: () => void }

const RULES: Record<Rule, string> = { overlap: 'cobre perto demais', edge: 'perto demais da borda', hole: 'furo fora da placa', width: 'trilha mais fina que o mínimo', ring: 'anel do furo menor que o mínimo', drill: 'furo menor que o mínimo' }
const FACES: Record<string, string> = { top: 'face de cima', bottom: 'face de baixo' }
const ZOOM_MIN = 4    // ZOOM MÍNIMO AO IR ATÉ UM PROBLEMA DO DRC

// LEVA A PCB ATÉ A VIOLAÇÃO E SELECIONA AS PEÇAS ENVOLVIDAS (SPEC 03 §7.3)
const showViolation = (violation: Violation) => {
    const { size, viewports, setViewport, setView, select, drc, doc } = useStore.getState()
    const [x, y] = drc ? apply(invert(drc.frame), violation.center[0], violation.center[1]) : [0, 0]
    const zoom   = Math.max(viewports.pcbView?.zoom ?? 1, ZOOM_MIN)
    setView('pcbView')
    setViewport('pcbView', { x: x - size[0] / 2 / zoom, y: y - size[1] / 2 / zoom, zoom })
    select(violation.owners.filter(owner => doc.instances[owner]))
}

// PROBLEMAS DO PROJETO COM DADOS REAIS: ERRO DA SIMULAÇÃO, PEÇAS ACIMA DO LIMITE NO PASSO MOSTRADO, PEÇAS SEM MODELO, LIGAÇÕES PENDENTES NA VISTA E O RESULTADO DO DRC
export const getProblems = (state: State): Problem[] => {
    const { simulation, doc, library, netlist, view, drc } = state
    const result   = simulation.enabled ? simulation.result : null
    const title    = (modelIndex: string) => doc.instances[modelIndex]?.title ?? modelIndex
    const effects  = result ? [...result.getEffects(simulation.step)].filter(([, effect]) => effect.smoke).map(([modelIndex]) => modelIndex) : []
    const skipped  = result ? Object.values(doc.instances).filter(instance => library.getPart(instance.moduleIdRef)?.kind === 'part' && !result.circuit.simulated.includes(instance.modelIndex) && doc.edges.some(edge => edge.some(key => key.startsWith(`${instance.modelIndex}/`)))) : []
    const status   = netlist?.getStatus(view)
    const silent   = result ? doc.probes.filter(probe => { const reading = result.getProbe(probe.id); return !reading.voltage && !reading.current }) : []

    return [
        ...simulation.enabled && simulation.error ? [{ level: 'bad' as const, title: t('Simulação'), text: simulation.error }] : [],
        ...effects.map((modelIndex): Problem => ({ level: 'warn', title: title(modelIndex), text: t('passou do limite da peça neste instante (potência, corrente ou tensão).'), select: [modelIndex] })),
        ...skipped.length ? [{ level: 'info' as const, title: t('Fora da simulação'), text: t(skipped.length > 1 ? '{0} não têm modelo SPICE e ficam de fora.' : '{0} não tem modelo SPICE e fica de fora.', skipped.map(instance => instance.title).join(', ')) }] : [],
        ...silent.map((probe): Problem => ({ level: 'warn', title: probe.id, text: t('não mede nada: o ponto não está ligado ao circuito simulado.') })),
        ...status && status.left ? [{ level: 'info' as const, title: t(VIEW_LABELS[view]), text: t(status.left > 1 ? '{0} conexões ainda sem fio (linhas tracejadas).' : '{0} conexão ainda sem fio (linhas tracejadas).', status.left) }] : [],
        ...drc ? drc.violations.map((violation): Problem => ({ level: 'bad', title: 'DRC', text: `${t(RULES[violation.rule])}${violation.measured !== undefined ? ` (${violation.measured.toFixed(1)} mil < ${violation.limit?.toFixed(1)} mil)` : violation.limit !== undefined && violation.rule !== 'overlap' ? ` (${violation.limit.toFixed(1)} mil)` : ''} · ${t(violation.face ? FACES[violation.face] : 'placa')} · ${violation.owners.map(title).join(' × ') || '—'}`, show: () => showViolation(violation) })) : [],
        ...drc && !drc.violations.length ? [{ level: 'ok' as const, title: 'DRC', text: t('nenhuma violação com folga mínima de {0} mil.', drc.keepout.toFixed(1)) }] : []
    ]
}

export const countProblems = (problems: Problem[]) => problems.filter(problem => problem.level === 'bad' || problem.level === 'warn').length

export const useProblemState = () => useStore(useShallow((state): State => ({ simulation: state.simulation, doc: state.doc, library: state.library, netlist: state.netlist, view: state.view, drc: state.drc })))

// PAINEL DE PROBLEMAS: CADA ITEM COM A AÇÃO DE IR ATÉ ELE
export const Problems = () => {
    const state    = useProblemState()
    const problems = useMemo(() => getProblems(state), [state])
    const count    = countProblems(problems)

    return (
        <section className="lp" aria-label={t('Problemas')}>
            <div className="lp-head"><h2>{t('Problemas')}</h2><p className="sub">{count ? t(count > 1 ? '{0} alertas no projeto' : '{0} alerta no projeto', count) : t('Nenhum alerta')}</p></div>
            <div className="lp-body">
                {!problems.length && <div className="note"><span className="dot ok" /><p>{t('Nada a corrigir. Rode a simulação ou o DRC (Roteamento) para verificar mais.')}</p></div>}
                {problems.map((problem, i) => (
                    <div key={i} className="note">
                        <span className={`dot ${problem.level}`} />
                        <div>
                            <p><b>{problem.title}</b> {problem.text}</p>
                            <div className="acts">
                                {problem.select && <button className="link" onClick={() => focusPart(problem.select?.[0] ?? '')}>{t('Selecionar {0}', problem.title)}</button>}
                                {problem.show && <button className="link" onClick={problem.show}>{t('Mostrar na placa')}</button>}
                            </div>
                        </div>
                    </div>
                ))}
                {state.drc && <button className="btn sm" style={{ marginTop: 12 }} onClick={() => useStore.setState({ drc: null })}>{t('Limpar resultado do DRC')}</button>}
            </div>
        </section>
    )
}
