import { BENCHES } from '../../engine/Bench'
import { Icon } from '../Icon'
import { useStore } from '../Store'

const STEPS: [string, string][] = [['Peças', 'escolha à esquerda e clique no quadro (ou arraste)'], ['Fios', 'clique num terminal, clique para dobrar e clique no terminal de destino'], ['Vista', 'arraste o fundo para mover; a roda dá zoom'], ['Medir', 'escolha V, A ou V·A na barra, clique num fio e aperte Simular']]

// QUADRO VAZIO: COMO COMEÇAR, ABRIR UM ARQUIVO, VER OS EXEMPLOS OU ABRIR UM CIRCUITO DE TESTE
export const Welcome = () => {
    const empty = useStore(state => Object.keys(state.doc.instances).length === 0)
    const ready = useStore(state => state.ready)
    const { setPanel, openBench } = useStore.getState()

    if (!empty || !ready)
        return null

    return (
        <div className="welcome">
            <section className="card">
                <h2>Comece um circuito</h2>
                <p className="sub">Protoboard, esquemático e PCB sempre sincronizados</p>
                <ol>{STEPS.map(([title, text], i) => <li key={title}><span className="step">{i + 1}</span><span><b>{title}:</b> {text}</span></li>)}</ol>
                <div className="acts">
                    <button className="btn primary sm" onClick={() => document.getElementById('open-file')?.click()}><Icon name="open" />Abrir arquivo</button>
                    <button className="btn sm" onClick={() => setPanel('document')}><Icon name="project" />Ver exemplos</button>
                </div>
                <h3 className="h3">Ou experimente um circuito de teste</h3>
                <div className="benches">{BENCHES.map(bench => <button key={bench.id} className="chipb" title={bench.summary} onClick={() => void openBench(bench.id)}>{bench.title}</button>)}</div>
            </section>
        </div>
    )
}
