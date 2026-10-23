import { useMemo } from 'react'
import { Icon, type IconName } from '../Icon'
import { countProblems, getProblems, useProblemState } from '../Problems'
import { useStore, type Left } from '../Store'
import { t } from '../../core/Text'

const ITEMS: [Left, IconName, string][] = [['parts', 'parts', 'Peças'], ['ready', 'flask', 'Prontos'], ['project', 'layers', 'Projeto'], ['problems', 'alert', 'Problemas']]
const PHONE = 860    // PX: ATÉ AQUI OS PAINÉIS SÃO FOLHAS (style.css) E O TRILHO SÓ AS ABRE E FECHA

// NO CELULAR OS PAINÉIS VIRAM FOLHAS SOBRE O QUADRO (DESIGN.md §2)
export const toggleSheet = (sheet: 'sheet-left' | 'sheet-insp' | null) => {
    document.body.classList.remove(...['sheet-left', 'sheet-insp'].filter(name => name !== sheet))

    if (sheet)
        document.body.classList.toggle(sheet)
}

// TRILHO: PAINÉIS DA ESQUERDA, TEMA E ATALHOS
export const Rail = () => {
    const left     = useStore(state => state.left)
    const hidden   = useStore(state => state.leftHidden)
    const theme    = useStore(state => state.theme)
    const state    = useProblemState()
    const count    = useMemo(() => countProblems(getProblems(state)), [state])
    const { setLeft, toggleLeft, toggleTheme } = useStore.getState()
    const choose   = (id: Left) => left === id && innerWidth > PHONE ? toggleLeft() : (setLeft(id), toggleSheet('sheet-left'))    // NA TELA LARGA, O BOTÃO DO PAINEL ABERTO O RECOLHE

    return (
        <nav className="rail" aria-label={t('Painéis')}>
            {ITEMS.map(([id, icon, label]) => (
                <button key={id} className="rail-btn" aria-pressed={left === id && !hidden} aria-label={t(label)} title={t(label)} onClick={() => choose(id)}>
                    <Icon name={icon} />
                    {id === 'problems' && count > 0 && <span className="badge">{count}</span>}
                </button>
            ))}
            <button className="rail-btn phone-only" aria-label={t('Propriedades')} title={t('Propriedades')} onClick={() => toggleSheet('sheet-insp')}><Icon name="sliders" /></button>
            <span className="rail-gap" />
            <button className="rail-btn" aria-label={t('Alternar tema')} title={t('Alternar tema claro/escuro')} onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
            <button className="rail-btn" aria-label={t('Atalhos')} title={t('Atalhos de teclado')} onClick={() => useStore.setState({ dialog: 'shortcuts' })}><Icon name="help" /></button>
        </nav>
    )
}
