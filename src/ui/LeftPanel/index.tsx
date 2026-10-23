import { lazy, Suspense } from 'react'
import { VIEWS, VIEW_LABELS } from '../../core/Layer'
import { BENCHES } from '../../engine/Bench'
import { Library } from '../Library'
import { Problems } from '../Problems'
import { useStore } from '../Store'
import { t } from '../../core/Text'

const Outline = lazy(() => import('../Outline').then(module => ({ default: module.Outline })))    // SÓ QUANDO O TRILHO ABRE O PROJETO

// CIRCUITOS PRONTOS PARA TESTAR: CADA UM ABRE NUMA ABA NOVA NA VISTA ESCOLHIDA, JÁ SIMULANDO COM AS PONTAS CERTAS; A PCB ABRE COM A PLACA ROTEADA (PEDIDO DO USUÁRIO, 2026-10-23)
const Ready = () => (
    <section className="lp" aria-label={t('Prontos')}>
        <div className="lp-head"><h2>{t('Prontos')}</h2><p className="sub">{t('Circuitos didáticos que já simulam: escolha a vista para abrir.')}</p></div>
        <div className="lp-body">
            {BENCHES.map(bench => (
                <div key={bench.id} className="sec" role="group" aria-label={t(bench.title)}>
                    <h3>{t(bench.title)}</h3>
                    <p className="sub">{t(bench.summary)}</p>
                    <div className="bin-actions">{VIEWS.map(view => <button key={view} className="btn sm" onClick={() => void useStore.getState().openBench(bench.id, view)}>{t(VIEW_LABELS[view])}</button>)}</div>
                </div>
            ))}
        </div>
    </section>
)

// PAINEL ESQUERDO: PEÇAS, PRONTOS, PROJETO OU PROBLEMAS, CONFORME O TRILHO
export const LeftPanel = () => {
    const left = useStore(state => state.left)

    return (
        <aside className="left card" aria-label={t('Painel lateral')}>
            {left === 'parts' && <Library />}
            {left === 'ready' && <Ready />}
            {left === 'project' && <Suspense fallback={null}><Outline /></Suspense>}
            {left === 'problems' && <Problems />}
        </aside>
    )
}
