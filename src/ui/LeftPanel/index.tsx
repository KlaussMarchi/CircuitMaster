import { lazy, Suspense } from 'react'
import { Library } from '../Library'
import { Problems } from '../Problems'
import { useStore } from '../Store'
import { t } from '../../core/Text'

const Outline = lazy(() => import('../Outline').then(module => ({ default: module.Outline })))    // SÓ QUANDO O TRILHO ABRE O PROJETO

// PAINEL ESQUERDO: PEÇAS, PROJETO OU PROBLEMAS, CONFORME O TRILHO
export const LeftPanel = () => {
    const left = useStore(state => state.left)

    return (
        <aside className="left card" aria-label={t('Painel lateral')}>
            {left === 'parts' && <Library />}
            {left === 'project' && <Suspense fallback={null}><Outline /></Suspense>}
            {left === 'problems' && <Problems />}
        </aside>
    )
}
