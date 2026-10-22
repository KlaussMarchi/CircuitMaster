import { useMemo } from 'react'
import { splitKey } from '../../core/Document'
import { getNets } from '../../core/Spice'
import { formatReading } from '../../core/Properties'
import { Scene } from '../../engine/Scene'
import { describeChange } from '../../engine/History'
import { useStore } from '../Store'
import { t } from '../../core/Text'

const LISTED = new Set(['part', 'symbol', 'breadboard', 'board', 'resizableBoard'])
const VALUES = ['resistance', 'capacitance', 'inductance', 'voltage', 'amplitude', 'frequency', 'color', 'chip label', 'part number']

const byTitle = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true })

// LEVA A VISTA ATÉ A PEÇA E A SELECIONA
export const focusPart = (modelIndex: string) => {
    const { doc, library, view, size, viewports, setViewport, select } = useStore.getState()
    const box  = new Scene(doc, library, view).getBounds(modelIndex)
    const zoom = viewports[view]?.zoom ?? 1
    select([modelIndex])

    if (box)
        setViewport(view, { x: (box[0] + box[2]) / 2 - size[0] / 2 / zoom, y: (box[1] + box[3]) / 2 - size[1] / 2 / zoom, zoom })
}

// PAINEL DE PROJETO: AS PEÇAS COM O VALOR PRINCIPAL, OS NÓS DO CIRCUITO COM A TENSÃO DO PASSO MOSTRADO E O HISTÓRICO DE DESFAZER, ONDE UM CLIQUE VOLTA A QUALQUER PASSO
export const Outline = () => {
    const doc        = useStore(state => state.doc)
    const library    = useStore(state => state.library)
    const netlist    = useStore(state => state.netlist)
    const name       = useStore(state => state.name)
    const simulation = useStore(state => state.simulation)
    const result     = simulation.enabled ? simulation.result : null

    const past       = useStore(state => state.past)
    const future     = useStore(state => state.future)
    const history    = useMemo(() => [...past, doc, ...future].map((state, i, timeline) => i ? describeChange(timeline[i - 1], state) : t('início (sketch aberto ou novo)')).map((label, i) => [label, i - past.length] as const).reverse(), [past, doc, future])

    const parts = useMemo(() => Object.values(doc.instances).filter(instance => LISTED.has(library.getPart(instance.moduleIdRef)?.kind ?? '')).sort((a, b) => byTitle(a.title, b.title)), [doc, library])
    const nets  = useMemo(() => netlist ? getNets(netlist.doc, library, netlist).filter(net => net.length > 1) : [], [library, netlist])

    const valueOf = (modelIndex: string) => {
        const instance = doc.instances[modelIndex]
        const part     = library.getPart(instance?.moduleIdRef ?? '')
        const key      = VALUES.find(item => instance?.properties[item] || part?.properties[item])
        return key ? instance?.properties[key] || part?.properties[key] || '' : ''
    }

    const pinName = (key: string) => {
        const [modelIndex, connectorId] = splitKey(key)
        const instance = doc.instances[modelIndex]
        const pin      = library.getPart(instance?.moduleIdRef ?? '')?.connectors.find(connector => connector.id === connectorId)?.name ?? connectorId
        return `${instance?.title ?? modelIndex}.${pin}`
    }

    const voltage = (net: string[]) => {
        const node = result?.circuit.nodes.get(net[0])
        return node && result ? formatReading(result.getNodeSeries(node)[Math.min(simulation.step, result.steps - 1)] ?? 0, 'V') : null
    }

    return (
        <section className="lp" aria-label={t('Projeto')}>
            <div className="lp-head"><h2>{t('Projeto')}</h2><p className="sub">{t(name)} · {t('{0} peças', parts.length)} · {t('{0} nós', nets.length)}</p></div>
            <div className="lp-body">
                <h3 className="h3">{t('Lista de peças')}</h3>
                {parts.length ? (
                    <ul className="list">
                        {parts.map(instance => (
                            <li key={instance.modelIndex}>
                                <button className="row-btn" onClick={() => focusPart(instance.modelIndex)}>
                                    <span className="name" style={{ minWidth: 44 }}>{instance.title}</span>
                                    <span className="grow muted">{library.getPart(instance.moduleIdRef)?.title}</span>
                                    <span className="num">{valueOf(instance.modelIndex)}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : <div className="empty">{t('Nenhuma peça ainda. Escolha uma em Peças e clique no quadro.')}</div>}
                {nets.length > 0 && <h3 className="h3">{t('Nós')}</h3>}
                <ul className="list">
                    {nets.map((net, i) => (
                        <li key={net[0]}>
                            <span className="name num" style={{ minWidth: 44 }}>{i === 0 ? 'GND' : `N${i}`}</span>
                            <span className="grow muted" title={net.map(pinName).join(' · ')}>{net.map(pinName).join(' · ')}</span>
                            {voltage(net) && <span className="num">{voltage(net)}</span>}
                        </li>
                    ))}
                </ul>
                {history.length > 1 && <h3 className="h3">{t('Histórico de desfazer')}</h3>}
                {history.length > 1 && (
                    <ul className="list" aria-label={t('Histórico de desfazer')}>
                        {history.map(([label, steps]) => (
                            <li key={steps}>
                                <button className={`row-btn${steps === 0 ? ' current' : ''}`} aria-current={steps === 0 ? 'step' : undefined} title={steps === 0 ? t('estado atual') : steps < 0 ? t('desfazer {0} passo(s)', -steps) : t('refazer {0} passo(s)', steps)} onClick={() => useStore.getState().jump(steps)}>
                                    <span className={`grow${steps > 0 ? ' muted' : ''}`}>{label}</span>
                                    {steps === 0 && <span className="muted">{t('agora')}</span>}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    )
}
