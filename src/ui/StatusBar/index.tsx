import { useMemo } from 'react'
import { VIEW_LABELS } from '../../core/Layer'
import { parseOrigin, useStore } from '../Store'
import { formatCursor, useCursor } from '../Navigation'
import { t } from '../../core/Text'

// POSIÇÃO DO CURSOR NA UNIDADE ESCOLHIDA, PELA ORIGEM DA GRADE, E A RELATIVA À ORIGEM LOCAL (ESPAÇO)
const Coordinates = () => {
    const { point, origin } = useCursor()
    const units  = useStore(state => state.preferences.units)
    const polar  = useStore(state => state.preferences.polar)
    const grid   = parseOrigin(useStore(state => state.doc.settings[state.view]?.gridOrigin))
    const shown  = useStore(state => state.level > 1)    // AS COORDENADAS SÃO DO MAKER EM DIANTE

    return point && shown ? <span className="num coords" title={t('Espaço zera as coordenadas relativas; Ctrl+U troca a unidade')}>{formatCursor(point, grid, origin, units, polar)}</span> : null
}

// BARRA DE STATUS: VISTA, PEÇAS E LIGAÇÕES PENDENTES, A ÚLTIMA MENSAGEM, O AUTOROUTER EM ANDAMENTO, O CURSOR E O ZOOM
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
            <Coordinates />
            <span className="num">{Math.round(zoom * 100)}%</span>
        </footer>
    )
}
