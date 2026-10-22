import { Component, Fragment, type ReactNode } from 'react'
import { t } from '../../core/Text'

type Props = { name: string, className: string, close?: () => void, children: ReactNode }
type State = { error: Error | null, round: number }

// LIMITE DE ERRO DE UMA REGIÃO: A FALHA MOSTRA A CAUSA NO LUGAR DO PAINEL, O RESTO DO APP SEGUE E O DOCUMENTO NÃO É TOCADO; RECARREGAR MONTA O PAINEL DE NOVO
export class Boundary extends Component<Props, State> {
    state: State = { error: null, round: 0 }

    static getDerivedStateFromError(error: Error) {
        return { error }
    }

    reload = () => this.setState({ error: null, round: this.state.round + 1 })

    render() {
        const { name, className, close, children } = this.props
        const { error, round }                     = this.state

        if (!error)
            return <Fragment key={round}>{children}</Fragment>

        return (
            <section className={className} role="alert" aria-label={t('{0}: falha', t(name))}>
                <div className="boundary">
                    <h2>{t('{0} parou', t(name))}</h2>
                    <p className="sub">{error.message || String(error)}</p>
                    <p className="sub">{t('O circuito não foi alterado. Recarregar monta o painel de novo; se o erro voltar, desfaça a última ação.')}</p>
                    <div className="boundary-actions">
                        <button className="btn sm" onClick={this.reload}>{t('Recarregar painel')}</button>
                        {close && <button className="btn sm" onClick={() => { close(); this.reload() }}>{t('Fechar')}</button>}
                    </div>
                </div>
            </section>
        )
    }
}
