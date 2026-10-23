import { BENCHES } from '../../engine/Bench'
import { Icon } from '../Icon'
import { useStore } from '../Store'
import { t } from '../../core/Text'

const STEPS: [string, string][] = [['Peças', 'escolha à esquerda e clique no quadro (ou arraste)'], ['Fios', 'clique num terminal, clique para dobrar e clique no terminal de destino'], ['Vista', 'arraste o fundo para mover; a roda dá zoom'], ['Medir', 'escolha V, A ou V·A na barra, clique num fio e aperte Simular'], ['Qualquer ação', 'Ctrl+K e o nome dela, em português ou em inglês']]

// QUADRO VAZIO: COMO COMEÇAR, ABRIR UM ARQUIVO, VER OS EXEMPLOS OU ABRIR UM CIRCUITO DE TESTE; SAI DA FRENTE QUANDO UMA PEÇA FOI ESCOLHIDA PARA PÔR (O CLIQUE NO CENTRO DO QUADRO É DELA)
export const Welcome = () => {
    const empty   = useStore(state => Object.keys(state.doc.instances).length === 0)
    const ready   = useStore(state => state.ready)
    const asked   = useStore(state => state.welcome)
    const placing = useStore(state => state.placing)
    const { setPanel, openBench } = useStore.getState()

    if (!(empty || asked) || !ready || placing)
        return null

    return (
        <div className="welcome">
            <section className="card">
                <div className="modal-head"><h2>{t('Comece um circuito')}</h2>{asked && <button className="btn sm" onClick={() => useStore.setState({ welcome: false })}>{t('Fechar')}</button>}</div>
                <p className="sub">{t('Protoboard, esquemático e PCB sempre sincronizados')}</p>
                <ol>{STEPS.map(([title, text], i) => <li key={title}><span className="step">{i + 1}</span><span><b>{t(title)}:</b> {t(text)}</span></li>)}</ol>
                <div className="acts">
                    <button className="btn primary sm" onClick={() => document.getElementById('open-file')?.click()}><Icon name="open" />{t('Abrir arquivo')}</button>
                    <button className="btn sm" onClick={() => setPanel('document')}><Icon name="project" />{t('Ver exemplos')}</button>
                </div>
                <h3 className="h3">{t('Ou experimente um circuito de teste')}</h3>
                <div className="benches">{BENCHES.map(bench => <button key={bench.id} className="chipb" title={t(bench.summary)} onClick={() => void openBench(bench.id)}>{t(bench.title)}</button>)}</div>
            </section>
        </div>
    )
}
