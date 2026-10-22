import { useMemo } from 'react'
import { VIEW_LABELS } from '../../core/Layer'
import { clearGroundFillSeeds } from '../../engine/Edit'
import { Icon } from '../Icon'
import { Entry, Kv } from '../Inspector'
import { useStore } from '../Store'
import { t } from '../../core/Text'

const RULES: [string, string, string][] = [['autorouteTraceWidth', 'Largura da trilha (mil)', '24'], ['DRC_Keepout', 'Folga mínima', '0.01in'], ['autorouteViaHoleSize', 'Furo da via', '0.4mm'], ['autorouteViaRingThickness', 'Anel da via', '0.3mm'], ['GPG_Keepout', 'Folga do cobre', '0.01in'], ['autorouteCycles', 'Ciclos', '20']]

// ABA DE ROTEAMENTO: ESTADO DAS LIGAÇÕES DA VISTA, AUTOROUTER COM PROGRESSO, REGRAS GRAVADAS NO SKETCH, DRC E PREENCHIMENTO DE COBRE (SPEC 03 §6–§8)
export const RoutingPanel = () => {
    const view     = useStore(state => state.view)
    const netlist  = useStore(state => state.netlist)
    const routing  = useStore(state => state.routing)
    const drc      = useStore(state => state.drc)
    const settings = useStore(state => state.doc.settings.pcbView) ?? {}
    const { autoroute, makeBoard, cancelRouting, checkRules, fillCopper, removeFills, clearAutorouted, setPcbSettings, setView, setLeft, edit } = useStore.getState()
    const status   = useMemo(() => netlist?.getStatus(view), [netlist, view])
    const pcb      = view === 'pcbView'
    const boarded  = useStore(state => Object.values(state.doc.instances).some(instance => ['board', 'resizableBoard'].includes(state.library.getPart(instance.moduleIdRef)?.kind ?? '')))
    const done     = status !== undefined && status.routed === status.nets
    const share    = routing ? (routing.cycle + (routing.requested ? routing.connected / routing.requested : 0)) / Math.max(1, routing.cycles) : done ? 1 : 0

    if (view === 'breadboardView')
        return (
            <>
                <div className="ph"><h2>{t('Roteamento')}</h2></div>
                <p className="sub">{t('Na protoboard os fios são desenhados à mão.')}</p>
                <div className="nopart">{t('O autorouter traça as ligações do esquemático e as trilhas da PCB a partir das mesmas conexões da protoboard.')}</div>
                <div className="runrow">
                    <button className="btn sm" onClick={() => setView('schematicView')}>{t('Ir ao esquemático')}</button>
                    <button className="btn sm" onClick={() => setView('pcbView')}>{t('Ir à PCB')}</button>
                </div>
            </>
        )

    return (
        <>
            <div className="ph">
                <h2>{t('Roteamento')}</h2>
                <span className={`pill ${routing ? 'neutral' : done ? 'ok' : 'warn'}`}>{routing ? t('Roteando') : done ? t('Concluído') : t('Pendente')}</span>
            </div>
            <p className="sub">{t(VIEW_LABELS[view])} · {status ? status.nets === 0 ? t('sem conexões para rotear') : t('{0} de {1} nets roteadas', status.routed, status.nets) : '—'}</p>
            <div className="runrow">
                {routing ? <button className="btn stop" onClick={cancelRouting}><Icon name="stop" />{t('Cancelar')}</button> : pcb && !boarded ? <button className="btn primary" title={t('Cria uma placa de duas faces em volta das peças e roteia')} onClick={() => void makeBoard()}><Icon name="route" />{t('Criar placa e rotear')}</button> : <button className="btn primary" disabled={!status?.nets} title="Ctrl+Shift+A" onClick={() => void autoroute()}><Icon name="route" />{t('Rotear')}</button>}
                <div className="progress" aria-hidden><i style={{ width: `${Math.round(share * 100)}%` }} /></div>
            </div>
            {pcb && !boarded && !routing && <p className="sub" style={{ marginTop: 6 }}>{t('Ainda não há placa: o botão cria uma em volta das peças (com folga de 0,15 in) e traça as trilhas nas duas faces.')}</p>}
            {routing && <p className="sub" style={{ marginTop: 6 }}>{t('ciclo {0} de {1} · {2} de {3} ligações', routing.cycle, routing.cycles, routing.connected, routing.requested)}</p>}
            {status && status.left > 0 && !routing && <p className="sub" style={{ marginTop: 6 }}>{t(status.left > 1 ? '{0} conexões ainda sem fio aparecem tracejadas no quadro.' : '{0} conexão ainda sem fio aparece tracejada no quadro.', status.left)}</p>}
            {pcb && (
                <div className="sec">
                    <h3>{t('Regras')}</h3>
                    {RULES.map(([key, label, fallback]) => <div key={key} className="rule-row"><label>{t(label)}</label><Entry value={settings[key] || fallback} options={[]} numeric commit={text => setPcbSettings({ [key]: text.trim() || fallback })} /></div>)}
                    <p className="sub" style={{ marginTop: 6 }}>{t('Medidas em in, mm, mil ou px (0.01in, 0.25mm). Valem para o autorouter, o DRC e o preenchimento.')}</p>
                </div>
            )}
            {pcb && (
                <div className="sec">
                    <h3>{t('Verificação (DRC)')}</h3>
                    {drc && <Kv label="Violações" value={String(drc.violations.length)} />}
                    {drc && <Kv label="Folga usada" value={`${drc.keepout.toFixed(1)} mil`} />}
                    <div className="runrow" style={{ marginTop: 8 }}>
                        <button className="btn sm" disabled={routing !== null} title="Ctrl+Shift+D" onClick={() => void checkRules()}><Icon name="check" />{t('Verificar regras')}</button>
                        {drc && drc.violations.length > 0 && <button className="link" onClick={() => setLeft('problems')}>{t('Ver problemas')}</button>}
                    </div>
                </div>
            )}
            {pcb && (
                <div className="sec">
                    <h3>{t('Preenchimento de cobre')}</h3>
                    <div className="bin-actions">
                        <button className="btn sm" disabled={routing !== null} onClick={() => void fillCopper('ground')}>{t('Preencher com terra')}</button>
                        <button className="btn sm" disabled={routing !== null} onClick={() => void fillCopper('plain')}>{t('Preencher com cobre')}</button>
                        <button className="btn sm" onClick={removeFills}>{t('Remover')}</button>
                        <button className="btn sm" onClick={() => edit(clearGroundFillSeeds)}>{t('Limpar sementes')}</button>
                    </div>
                </div>
            )}
            <div className="sec">
                <h3>{t('Limpar')}</h3>
                <button className="btn sm" disabled={routing !== null} onClick={clearAutorouted}>{pcb ? t('Apagar trilhas autoroteadas') : t('Apagar fios autoroteados')}</button>
            </div>
        </>
    )
}
