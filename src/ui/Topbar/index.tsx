import { VIEWS, VIEW_LABELS } from '../../core/Layer'
import { Icon } from '../Icon'
import { MenuBar } from '../MenuBar'
import { useStore } from '../Store'

// BARRA SUPERIOR: MARCA, MENUS, VISTA, ANÁLISE E O BOTÃO DE SIMULAR (DESIGN.md §6)
export const Topbar = () => {
    const view      = useStore(state => state.view)
    const ready     = useStore(state => state.ready)
    const enabled   = useStore(state => state.simulation.enabled)
    const transient = useStore(state => state.simulation.transient)
    const { setView, setSimulation } = useStore.getState()

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
                <div className="modetabs" role="tablist" aria-label="Tipo de análise">
                    <button className="tab" role="tab" aria-selected={!transient} title="Ponto de operação (.OP)" onClick={() => setSimulation({ transient: false })}>DC</button>
                    <button className="tab" role="tab" aria-selected={transient} title="Análise no tempo (.TRAN)" onClick={() => setSimulation({ transient: true })}>Transitório</button>
                </div>
                <button className={`btn ${enabled ? 'stop' : 'primary'}`} disabled={!ready} title={view === 'pcbView' ? 'Simular (os efeitos aparecem na protoboard e no esquemático)' : 'Simular / parar'} onClick={() => setSimulation({ enabled: !enabled, result: null, error: null, playing: false, step: 0 })}>
                    <Icon name={enabled ? 'stop' : 'play'} /><span>{enabled ? 'Parar' : 'Simular'}</span>
                </button>
            </div>
        </header>
    )
}
