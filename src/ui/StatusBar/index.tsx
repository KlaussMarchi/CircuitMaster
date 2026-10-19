import { useMemo } from 'react'
import { useStore } from '../Store'

export const StatusBar = () => {
    const netlist  = useStore(state => state.netlist)
    const view     = useStore(state => state.view)
    const message  = useStore(state => state.message)
    const zoom     = useStore(state => state.viewports[state.view]?.zoom ?? 1)
    const status   = useMemo(() => netlist?.getStatus(view), [netlist, view])
    const routing  = !status                       ? '' :
                     status.nets === 0             ? 'Sem conexões para rotear' :
                     status.routed === status.nets ? 'Roteamento concluído' : `${status.routed} de ${status.nets} nets roteadas — ${status.left} conexões ainda por rotear`

    return (
        <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-neutral-300 bg-white px-3 text-xs text-neutral-600">
            <span>{routing}</span>
            <span className="truncate">{message}</span>
            <span className="ml-auto">{Math.round(zoom * 100)}%</span>
        </footer>
    )
}
