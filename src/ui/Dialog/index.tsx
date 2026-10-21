import type { ReactNode } from 'react'
import { useStore } from '../Store'

const SHORTCUTS: [string, string][] = [
    ['Ctrl+N · Ctrl+O · Ctrl+S', 'novo, abrir, salvar'],
    ['Ctrl+Z · Ctrl+Shift+Z', 'desfazer, refazer'],
    ['Ctrl+X · Ctrl+C · Ctrl+V · Ctrl+Shift+V', 'recortar, copiar, colar, colar no lugar'],
    ['Ctrl+D · Ctrl+A · Esc', 'duplicar, selecionar tudo, desmarcar'],
    ['Delete · Backspace · Alt+Backspace', 'apagar, apagar sem fios'],
    ['] · [ · |', 'girar 90° horário, anti-horário, espelhar (esquemático)'],
    ['Ctrl+] · Ctrl+[ · Ctrl+Shift+] · Ctrl+Shift+[', 'avançar, recuar, trazer para frente, enviar para trás'],
    ['Setas · Shift+Setas', 'mover 1 passo (ou 1 px sem grade), 10 passos'],
    ['Ctrl++ · Ctrl+- · Ctrl+0 · Ctrl+Shift+0', 'ampliar, reduzir, enquadrar, 100%'],
    ['Ctrl+1 · Ctrl+2 · Ctrl+3', 'protoboard, esquemático, PCB'],
    ['Roda · Shift+roda', 'zoom no cursor, mover a vista'],
    ['Arrastar o fundo · botão do meio · Espaço+arrastar', 'mover a vista'],
    ['Shift+arrastar o fundo · Ctrl+arrastar', 'selecionar por retângulo (soma), selecionar por retângulo'],
    ['Clique num terminal · clique · clique no terminal', 'começa o fio, faz uma dobra, termina o fio'],
    ['Botão direito · Esc · Backspace (durante o fio)', 'deixa a ponta solta, cancela, desfaz a última dobra'],
    ['Shift · Alt (durante o fio)', 'trecho a 0°/45°/90°, trecho livre sem grade'],
    ['Arrastar um trecho reto · Ctrl+arrastar · Alt+arrastar', 'desloca mantendo 90°, curva, dobra livre'],
    ['Duplo clique no fio · clique na ponta solta', 'cria dobra, continua o fio'],
    ['Alt+arrastar a peça', 'esticar pernas presas'],
    ['Pontas V · A · V·A (barra) · Shift+clique', 'medir tensão, corrente, ambas; manter a ferramenta'],
    ['Duplo clique na nota · na chave', 'editar o texto, alternar a chave']
]

const CREDITS: [string, string][] = [
    ['Peças e exemplos', 'fritzing-parts e sketches do Fritzing, lidos como dados (CC-BY-SA 3.0)'],
    ['Simulação', 'ngspice compilado para WebAssembly (BSD modificada, ver COPYING)'],
    ['Polígonos', 'Clipper2 de Angus Johnson em WebAssembly (Boost 1.0)'],
    ['Fontes', 'Droid Sans (Apache 2.0), Noto Sans (OFL), OCR-A (domínio público)'],
    ['Código', 'implementação própria a partir das especificações em docs/specs, sem código do fritzing-app']
]

const Table = ({ rows }: { rows: [string, string][] }) => (
    <table className="tbl keys">
        <tbody>{rows.map(([key, text]) => <tr key={key}><td><kbd>{key}</kbd></td><td>{text}</td></tr>)}</tbody>
    </table>
)

const CONTENT: Record<string, [string, ReactNode]> = {
    shortcuts: ['Atalhos de teclado', <Table rows={SHORTCUTS} />],
    about: ['Sobre o CircuitMaster', <><p className="soft" style={{ marginBottom: 12 }}>Editor de circuitos compatível com o Fritzing 1.0.8: protoboard, esquemático e PCB sincronizados, simulação SPICE e manufatura (Gerber, Excellon, BOM).</p><Table rows={CREDITS} /></>]
}

// JANELA MODAL DE AJUDA; FECHA NO BOTÃO, NO FUNDO OU NO ESC
export const Dialog = () => {
    const dialog = useStore(state => state.dialog)
    const close  = () => useStore.setState({ dialog: null })
    const shown  = dialog ? CONTENT[dialog] : null

    if (!shown)
        return null

    return (
        <div className="modal" role="dialog" aria-modal="true" aria-label={shown[0]} onPointerDown={event => event.target === event.currentTarget && close()} onKeyDown={event => event.key === 'Escape' && close()}>
            <section className="card">
                <header className="modal-head">
                    <h2>{shown[0]}</h2>
                    <button className="btn sm" autoFocus onClick={close}>Fechar</button>
                </header>
                {shown[1]}
            </section>
        </div>
    )
}
