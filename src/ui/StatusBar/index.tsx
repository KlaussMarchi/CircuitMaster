import { useMemo } from 'react'
import { VIEW_LABELS } from '../../core/Layer'
import { useStore } from '../Store'
import { t } from '../../core/Text'

// BARRA DE STATUS: VISTA, PEÇAS E LIGAÇÕES PENDENTES, A ÚLTIMA MENSAGEM, O AUTOROUTER EM ANDAMENTO E O ZOOM
export const StatusBar = () => {
    const netlist = useStore(state => state.netlist)
    const view    = useStore(state => state.view)
    const message = useStore(state => state.message)
    const routing = useStore(state => state.routing)
    const parts   = useStore(state => Object.values(state.doc.instances).filter(instance => instance.moduleIdRef !== 'WireModuleID').length)
    const zoom    = useStore(state => state.viewports[state.view]?.zoom ?? 1)
    const status  = useMemo(() => netlist?.getStatus(view), [netlist, view])
    const pending = !status || status.nets === 0 ? t('sem conexões') : status.left ? t(status.left > 1 ? '{0} ligações sem fio' : '{0} ligação sem fio', status.left) : t('tudo ligado')

    return (
        <footer className="status">
            <span>{t(VIEW_LABELS[view])} · {t(parts === 1 ? '{0} peça' : '{0} peças', parts)} · {pending}</span>
            <span className="msg" role="status" title={message}>{message}</span>
            <span className="grow" />
            {routing && <span>{t('autorouter: ciclo {0}/{1} · {2} de {3}', routing.cycle, routing.cycles, routing.connected, routing.requested)} <button className="link" onClick={() => useStore.getState().cancelRouting()}>{t('Cancelar')}</button></span>}
            <span className="num">{Math.round(zoom * 100)}%</span>
        </footer>
    )
}
