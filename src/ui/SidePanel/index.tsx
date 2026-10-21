import { useEffect } from 'react'
import { Inspector } from '../Inspector'
import { RoutingPanel } from '../RoutingPanel'
import { ProjectPanel } from '../ProjectPanel'
import { useStore, type Panel } from '../Store'

const TABS: [Panel, string][] = [['properties', 'Propriedades'], ['routing', 'Roteamento'], ['document', 'Documento']]

// INSPETOR À DIREITA: PROPRIEDADES DA SELEÇÃO, ROTEAMENTO E DOCUMENTO; SELECIONAR UMA PEÇA VOLTA PARA AS PROPRIEDADES
export const SidePanel = () => {
    const panel    = useStore(state => state.panel)
    const picked   = useStore(state => state.selection.some(modelIndex => state.doc.instances[modelIndex]?.moduleIdRef !== 'WireModuleID'))
    const setPanel = useStore(state => state.setPanel)

    useEffect(() => {
        if (picked)
            useStore.getState().setPanel('properties')
    }, [picked])

    return (
        <aside className="inspector card" aria-label="Inspetor">
            <div className="tabs insp-tabs" role="tablist">
                {TABS.map(([id, label]) => <button key={id} className="tab" role="tab" aria-selected={panel === id} onClick={() => setPanel(id)}>{label}</button>)}
            </div>
            <div className="insp-body">
                {panel === 'properties' && <Inspector />}
                {panel === 'routing' && <RoutingPanel />}
                {panel === 'document' && <ProjectPanel />}
            </div>
        </aside>
    )
}
