import { lazy, Suspense, useEffect } from 'react'
import { Inspector } from '../Inspector'
import { useStore, type Panel } from '../Store'
import { t } from '../../core/Text'

// AS ABAS ROTEAMENTO E DOCUMENTO CARREGAM QUANDO ABREM
const RoutingPanel = lazy(() => import('../RoutingPanel').then(module => ({ default: module.RoutingPanel })))
const ProjectPanel = lazy(() => import('../ProjectPanel').then(module => ({ default: module.ProjectPanel })))

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
        <aside className="inspector card" aria-label={t('Inspetor')}>
            <div className="tabs insp-tabs" role="tablist">
                {TABS.map(([id, label]) => <button key={id} className="tab" role="tab" aria-selected={panel === id} onClick={() => setPanel(id)}>{t(label)}</button>)}
            </div>
            <div className="insp-body">
                {panel === 'properties' && <Inspector />}
                <Suspense fallback={null}>
                    {panel === 'routing' && <RoutingPanel />}
                    {panel === 'document' && <ProjectPanel />}
                </Suspense>
            </div>
        </aside>
    )
}
