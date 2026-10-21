import { Library } from '../Library'
import { Outline } from '../Outline'
import { Problems } from '../Problems'
import { useStore } from '../Store'

// PAINEL ESQUERDO: PEÇAS, PROJETO OU PROBLEMAS, CONFORME O TRILHO
export const LeftPanel = () => {
    const left = useStore(state => state.left)

    return (
        <aside className="left card" aria-label="Painel lateral">
            {left === 'parts' && <Library />}
            {left === 'project' && <Outline />}
            {left === 'problems' && <Problems />}
        </aside>
    )
}
