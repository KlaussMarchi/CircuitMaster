import type { KeyboardEvent, ReactNode } from 'react'
import { LEVELS } from '../Modes'
import { assignKey, getKeyMap, KEY_ACTIONS, keyOf, shortcutOf, showKey } from '../Keys'
import { useStore } from '../Store'

// GESTOS DE MOUSE E DO FIO EM DESENHO: FIXOS; AS TECLAS SAEM DA TABELA DE AÇÕES (ui/Keys), COM AS ESCOLHAS DAS PREFERÊNCIAS
const GESTURES: [string, string][] = [
    ['Roda · Shift+roda', 'zoom no cursor, mover a vista (ou o contrário, nas Preferências)'],
    ['Arrastar o fundo · botão do meio · Espaço+arrastar', 'mover a vista'],
    ['Shift+arrastar o fundo · Ctrl+arrastar', 'selecionar por retângulo (soma), selecionar por retângulo'],
    ['Clique num terminal · clique · clique no terminal', 'começa o fio, faz uma dobra, termina o fio'],
    ['Botão direito · Esc · Backspace (durante o fio)', 'deixa a ponta solta, cancela, desfaz a última dobra'],
    ['Shift · Alt (durante o fio)', 'trecho a 0°/45°/90°, trecho livre sem grade'],
    ['Arrastar um trecho reto · Ctrl+arrastar · Alt+arrastar', 'desloca mantendo 90°, curva (ou dobra, com fios curvos), dobra livre'],
    ['Duplo clique no fio · clique na ponta solta', 'cria dobra, continua o fio'],
    ['Alt+arrastar a peça', 'esticar pernas presas'],
    ['Pontas V · A · V·A (barra) · Shift+clique', 'medir tensão, corrente, ambas; manter a ferramenta'],
    ['Duplo clique na nota · na chave', 'editar o texto, alternar a chave']
]

const MODIFIERS = ['Control', 'Shift', 'Alt', 'Meta']

const Shortcuts = () => {
    const keys = useStore(state => state.keys)
    const map  = [...getKeyMap(keys)]
    const rows = KEY_ACTIONS.map((action): [string, string] => [map.filter(([, owner]) => owner === action).map(([key]) => showKey(key)).join(' · '), action.label]).filter(([shown]) => shown)
    return <Table rows={[...rows, ...GESTURES]} />
}

const Choice = <T extends string | number | boolean,>({ label, value, options, change }: { label: string, value: T, options: [T, string][], change: (value: T) => void }) => (
    <div className="pref">
        <span>{label}</span>
        <div className="seg tabs" role="tablist" aria-label={label}>{options.map(([id, text]) => <button key={String(id)} className="tab" role="tab" aria-selected={value === id} onClick={() => change(id)}>{text}</button>)}</div>
    </div>
)

// PREFERÊNCIAS DO NAVEGADOR: RODA, FIOS CURVOS, MODO, TEMA E AS TECLAS DE CADA AÇÃO (A TECLA ESCOLHIDA SAI DA AÇÃO QUE A TINHA)
const Preferences = () => {
    const preferences = useStore(state => state.preferences)
    const level       = useStore(state => state.level)
    const theme       = useStore(state => state.theme)
    const keys        = useStore(state => state.keys)
    const { setPreferences, setLevel, toggleTheme, setKeys } = useStore.getState()

    const capture = (id: string) => (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape' || event.key === 'Tab' || MODIFIERS.includes(event.key))
            return

        event.preventDefault()
        event.stopPropagation()
        setKeys(assignKey(keys, id, keyOf(event)))
    }

    return (
        <>
            <Choice label="Roda do mouse" value={preferences.wheel} options={[['zoom', 'Zoom'], ['scroll', 'Rolar a vista']]} change={wheel => setPreferences({ wheel })} />
            <Choice label="Arrastar o meio de um fio" value={preferences.curvy} options={[[false, 'Faz uma dobra'], [true, 'Curva o fio']]} change={curvy => setPreferences({ curvy })} />
            <Choice label="Modo da interface" value={level} options={LEVELS.map(([id, text]) => [id, text])} change={setLevel} />
            <Choice label="Tema" value={theme} options={[['dark', 'Escuro'], ['light', 'Claro']]} change={next => next !== theme && toggleTheme()} />
            <p className="soft" style={{ margin: '14px 0 6px' }}>Atalhos: clique no campo e aperte a tecla nova. Uma tecla já usada passa para esta ação.</p>
            <table className="tbl keys prefs-keys">
                <tbody>
                    {KEY_ACTIONS.map(action => (
                        <tr key={action.id}>
                            <td>{action.label}</td>
                            <td><input className="keycap" readOnly aria-label={`Tecla de ${action.label}`} value={shortcutOf(keys, action.id) ?? '—'} onKeyDown={capture(action.id)} /></td>
                            <td>{keys[action.id] && <button className="link" onClick={() => setKeys(assignKey(keys, action.id, null))}>padrão</button>}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {Object.keys(keys).length > 0 && <div className="boundary-actions" style={{ marginTop: 12 }}><button className="btn sm" onClick={() => setKeys({})}>Restaurar todos os atalhos</button></div>}
        </>
    )
}

const CREDITS: [string, string][] = [
    ['Peças e exemplos', 'fritzing-parts e sketches do Fritzing, lidos como dados (CC-BY-SA 3.0)'],
    ['Simulação', 'ngspice compilado para WebAssembly (BSD modificada, ver COPYING)'],
    ['Polígonos', 'Clipper2 de Angus Johnson em WebAssembly (Boost 1.0)'],
    ['Fontes', 'Public Sans e JetBrains Mono na interface; Droid Sans (Apache 2.0), Noto Sans e OCR-A nas peças (OFL e domínio público)'],
    ['Código', 'GPL-3.0-or-later; código portado do Fritzing e do KiCad listado em THIRD_PARTY.md']
]

const Table = ({ rows }: { rows: [string, string][] }) => (
    <table className="tbl keys">
        <tbody>{rows.map(([key, text]) => <tr key={key}><td><kbd>{key}</kbd></td><td>{text}</td></tr>)}</tbody>
    </table>
)

const when = (time: number) => new Date(time).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

// VERSÕES DO SALVAMENTO AUTOMÁTICO: NA ABERTURA, AS DE SESSÕES QUE FECHARAM COM ALTERAÇÕES NÃO SALVAS; PELO MENU, TODAS
const Versions = ({ startup }: { startup: boolean }) => {
    const versions                     = useStore(state => state.recovery)
    const { recover, dismissRecovery } = useStore.getState()

    return (
        <>
            <p className="soft" style={{ marginBottom: 12 }}>{startup ? 'O CircuitMaster fechou com alterações não salvas. Abra uma versão para continuar dela; nada é apagado até você descartar.' : 'Cópias gravadas sozinhas a cada mudança: uma nova por minuto de edição, as 20 mais recentes.'}</p>
            {versions.length ? (
                <table className="tbl">
                    <tbody>
                        {versions.map(version => (
                            <tr key={version.id}>
                                <td>{version.name}</td>
                                <td>{when(version.time)}</td>
                                <td>{version.count} itens</td>
                                <td className="label">{version.dirty ? 'não salvo' : 'salvo'}</td>
                                <td><button className="btn sm" onClick={() => void recover(version)}>Abrir</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : <p className="soft">Nenhuma versão guardada ainda: elas aparecem depois da primeira mudança no sketch.</p>}
            {startup && <div className="boundary-actions" style={{ marginTop: 12 }}><button className="btn sm" onClick={() => void dismissRecovery()}>Descartar</button></div>}
        </>
    )
}

const CONTENT: Record<string, [string, ReactNode]> = {
    recovery: ['Recuperar trabalho não salvo', <Versions startup />],
    versions: ['Versões salvas automaticamente', <Versions startup={false} />],
    shortcuts: ['Atalhos de teclado', <Shortcuts />],
    preferences: ['Preferências', <Preferences />],
    about: ['Sobre o CircuitMaster', <><p className="soft" style={{ marginBottom: 12 }}>Editor de circuitos compatível com o Fritzing 1.0.8: protoboard, esquemático e PCB sincronizados, simulação SPICE e manufatura (Gerber, Excellon, BOM).</p><Table rows={CREDITS} /></>]
}

// JANELA MODAL DE AJUDA E DE VERSÕES; FECHA NO BOTÃO, NO FUNDO OU NO ESC
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
