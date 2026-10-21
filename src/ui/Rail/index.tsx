import { useMemo } from 'react'
import { Icon, type IconName } from '../Icon'
import { countProblems, getProblems, useProblemState } from '../Problems'
import { useStore, type Left } from '../Store'

const ITEMS: [Left, IconName, string][] = [['parts', 'parts', 'Peças'], ['project', 'layers', 'Projeto'], ['problems', 'alert', 'Problemas']]

// NO CELULAR OS PAINÉIS VIRAM FOLHAS SOBRE O QUADRO (DESIGN.md §2)
export const toggleSheet = (sheet: 'sheet-left' | 'sheet-insp' | null) => {
    document.body.classList.remove(...['sheet-left', 'sheet-insp'].filter(name => name !== sheet))

    if (sheet)
        document.body.classList.toggle(sheet)
}

// TRILHO: PAINÉIS DA ESQUERDA, TEMA E ATALHOS
export const Rail = () => {
    const left     = useStore(state => state.left)
    const theme    = useStore(state => state.theme)
    const state    = useProblemState()
    const count    = useMemo(() => countProblems(getProblems(state)), [state])
    const { setLeft, toggleTheme } = useStore.getState()

    return (
        <nav className="rail" aria-label="Painéis">
            {ITEMS.map(([id, icon, label]) => (
                <button key={id} className="rail-btn" aria-pressed={left === id} aria-label={label} title={label} onClick={() => { setLeft(id); toggleSheet('sheet-left') }}>
                    <Icon name={icon} />
                    {id === 'problems' && count > 0 && <span className="badge">{count}</span>}
                </button>
            ))}
            <button className="rail-btn phone-only" aria-label="Propriedades" title="Propriedades" onClick={() => toggleSheet('sheet-insp')}><Icon name="sliders" /></button>
            <span className="rail-gap" />
            <button className="rail-btn" aria-label="Alternar tema" title="Alternar tema claro/escuro" onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
            <button className="rail-btn" aria-label="Atalhos" title="Atalhos de teclado" onClick={() => useStore.setState({ dialog: 'shortcuts' })}><Icon name="help" /></button>
        </nav>
    )
}
