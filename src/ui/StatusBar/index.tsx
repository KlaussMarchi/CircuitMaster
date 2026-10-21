import { useMemo } from 'react'
import { VIEW_LABELS } from '../../core/Layer'
import { useStore } from '../Store'

// BARRA DE STATUS: VISTA, PEÇAS E LIGAÇÕES PENDENTES, A ÚLTIMA MENSAGEM, O AUTOROUTER EM ANDAMENTO E O ZOOM
export const StatusBar = () => {
    const netlist = useStore(state => state.netlist)
    const view    = useStore(state => state.view)
    const message = useStore(state => state.message)
    const routing = useStore(state => state.routing)
    const parts   = useStore(state => Object.values(state.doc.instances).filter(instance => instance.moduleIdRef !== 'WireModuleID').length)
    const zoom    = useStore(state => state.viewports[state.view]?.zoom ?? 1)
    const status  = useMemo(() => netlist?.getStatus(view), [netlist, view])
    const pending = !status || status.nets === 0 ? 'sem conexões' : status.left ? `${status.left} ${status.left > 1 ? 'ligações' : 'ligação'} sem fio` : 'tudo ligado'

    return (
        <footer className="status">
            <span>{VIEW_LABELS[view]} · {parts} {parts === 1 ? 'peça' : 'peças'} · {pending}</span>
            <span className="msg" role="status" title={message}>{message}</span>
            <span className="grow" />
            {routing && <span>autorouter: ciclo {routing.cycle}/{routing.cycles} · {routing.connected} de {routing.requested} <button className="link" onClick={() => useStore.getState().cancelRouting()}>Cancelar</button></span>}
            <span className="num">{Math.round(zoom * 100)}%</span>
        </footer>
    )
}
