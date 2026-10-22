import { VIEWS, VIEW_LABELS } from '../../core/Layer'
import { Icon } from '../Icon'
import { MenuBar } from '../MenuBar'
import { useStore } from '../Store'

// BARRA SUPERIOR: MARCA, MENUS, VISTA E O BOTÃO DE SIMULAR, QUE DECIDE SOZINHO ENTRE O PONTO DE OPERAÇÃO E O TRANSITÓRIO
export const Topbar = () => {
    const view    = useStore(state => state.view)
    const ready   = useStore(state => state.ready)
    const enabled = useStore(state => state.simulation.enabled)
    const { setView, toggleSimulation } = useStore.getState()

    return (
        <header className="topbar">
            <a className="brand" href="#" aria-label="CircuitMaster" onClick={event => event.preventDefault()}>
                <svg className="mark" viewBox="0 0 24 24" aria-hidden><path d="M17.5 6.6A7.6 7.6 0 1 0 17.5 17.4" /><circle cx="19.2" cy="12" r="2.1" /></svg>
                <span>CircuitMaster</span>
            </a>
            <MenuBar />
            <div className="viewtabs" role="tablist" aria-label="Vista do projeto">
                {VIEWS.map((item, i) => <button key={item} className="tab" role="tab" aria-selected={item === view} title={`${VIEW_LABELS[item]} (${i + 1})`} onClick={() => setView(item)}>{VIEW_LABELS[item]}</button>)}
            </div>
            <div className="topright">
                <button className={`btn ${enabled ? 'stop' : 'primary'}`} disabled={!ready} title={enabled ? 'Parar a simulação' : 'Simular: o ponto de operação e, se algo muda no tempo, o transitório no teste escolhido no painel'} onClick={toggleSimulation}>
                    <Icon name={enabled ? 'stop' : 'play'} /><span>{enabled ? 'Parar' : 'Simular'}</span>
                </button>
            </div>
        </header>
    )
}
