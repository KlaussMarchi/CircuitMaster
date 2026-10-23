import type { KeyboardEvent, ReactNode } from 'react'
import { LEVELS } from '../Modes'
import { assignKey, getKeyMap, KEY_ACTIONS, keyOf, shortcutOf, showKey } from '../Keys'
import { GRID_SIZES, getSeedCandidates, useStore, type GridKind, type View } from '../Store'
import { setGroundFillSeed } from '../../engine/Edit'
import { CROSSHAIRS, UNITS } from '../Navigation'
import { VIEWS, VIEW_LABELS } from '../../core/Layer'
import { getTag, LANGUAGES, t } from '../../core/Text'

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
        <span>{t(label)}</span>
        <div className="seg tabs" role="tablist" aria-label={t(label)}>{options.map(([id, text]) => <button key={String(id)} className="tab" role="tab" aria-selected={value === id} onClick={() => change(id)}>{t(text)}</button>)}</div>
    </div>
)

const OVERRIDES: [GridKind, string][] = [['parts', 'Grade das peças'], ['wires', 'Grade dos fios']]

// TEXTO QUE SÓ GRAVA AO SAIR DO CAMPO OU COM Enter
const Field = ({ label, value, placeholder, commit }: { label: string, value: string, placeholder: string, commit: (text: string) => void }) => (
    <div className="pref">
        <span>{t(label)}</span>
        <div className="in"><input className="text" aria-label={t(label)} defaultValue={value} placeholder={placeholder} onBlur={event => event.target.value !== value && commit(event.target.value.trim())} onKeyDown={event => event.key === 'Enter' && event.currentTarget.blur()} /></div>
    </div>
)

const Swatch = ({ label, value, change }: { label: string, value: string, change: (color: string) => void }) => (
    <div className="pref">
        <span>{t(label)}</span>
        <div className="in paint"><input type="color" aria-label={t(label)} value={value} onChange={event => change(event.target.value)} /><span className="num grow">{value}</span></div>
    </div>
)

const NET_TEXT: ['outside' | 'connector', string][] = [['outside', 'Na ponta de fora'], ['connector', 'Junto ao conector']]

// PREFERÊNCIAS DO NAVEGADOR: RODA, FIOS CURVOS, MODO, LÍNGUA, TEMA, UNIDADES E CURSOR, GRADES, MANUTENÇÃO E AS TECLAS DE CADA AÇÃO (A TECLA ESCOLHIDA SAI DA AÇÃO QUE A TINHA)
const Preferences = () => {
    const preferences = useStore(state => state.preferences)
    const level       = useStore(state => state.level)
    const language    = useStore(state => state.language)
    const theme       = useStore(state => state.theme)
    const keys        = useStore(state => state.keys)
    const { setPreferences, setLevel, setLanguage, toggleTheme, setKeys, resetSettings, rebuildIndex } = useStore.getState()
    const grids = (view: View, text: string) => setPreferences({ grids: { ...preferences.grids, [view]: text ? text.split(/[,;\s]+/).filter(Boolean) : undefined } })

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
            <Choice label="Idioma" value={language} options={LANGUAGES.map(([id, text]) => [id, text])} change={next => void setLanguage(next)} />
            <Choice label="Tema" value={theme} options={[['dark', 'Escuro'], ['light', 'Claro']]} change={next => next !== theme && toggleTheme()} />
            <Choice label="Unidades" value={preferences.units} options={UNITS} change={units => setPreferences({ units })} />
            <Choice label="Coordenadas relativas" value={preferences.polar} options={[[false, 'Cartesianas (dX, dY)'], [true, 'Polares (r, θ)']]} change={polar => setPreferences({ polar })} />
            <Choice label="Cursor em cruz" value={preferences.crosshair} options={CROSSHAIRS} change={crosshair => setPreferences({ crosshair })} />
            <Swatch label="Realce de terminal ligado" value={preferences.connectedColor} change={connectedColor => setPreferences({ connectedColor })} />
            <Swatch label="Realce de terminal solto" value={preferences.unconnectedColor} change={unconnectedColor => setPreferences({ unconnectedColor })} />
            <Choice label="Texto dos net labels novos" value={preferences.netLabel} options={NET_TEXT} change={netLabel => setPreferences({ netLabel })} />
            <Choice label="Mostrar o cursor em cruz" value={preferences.crosshairAlways} options={[[false, 'Só com o teclado'], [true, 'Sempre']]} change={crosshairAlways => setPreferences({ crosshairAlways })} />
            <p className="soft" style={{ margin: '14px 0 6px' }}>{t('Grades: a lista de cada vista (N e Shift+N andam por ela; as duas primeiras são as grades rápidas Alt+1 e Alt+2) e as que valem só para peças ou só para fios.')}</p>
            {VIEWS.map(view => <Field key={view} label={VIEW_LABELS[view]} value={(preferences.grids[view] ?? GRID_SIZES[view]).join(', ')} placeholder={GRID_SIZES[view].join(', ')} commit={text => grids(view, text)} />)}
            {OVERRIDES.map(([kind, label]) => <Field key={kind} label={label} value={preferences.overrides[kind]} placeholder={t('a da vista')} commit={text => setPreferences({ overrides: { ...preferences.overrides, [kind]: text } })} />)}
            <p className="soft" style={{ margin: '14px 0 6px' }}>{t('Atalhos: clique no campo e aperte a tecla nova. Uma tecla já usada passa para esta ação.')}</p>
            <table className="tbl keys prefs-keys">
                <tbody>
                    {KEY_ACTIONS.map(action => (
                        <tr key={action.id}>
                            <td>{t(action.label)}</td>
                            <td><input className="keycap" readOnly aria-label={t('Tecla de {0}', t(action.label))} value={shortcutOf(keys, action.id) ?? '—'} onKeyDown={capture(action.id)} /></td>
                            <td>{keys[action.id] && <button className="link" onClick={() => setKeys(assignKey(keys, action.id, null))}>{t('padrão')}</button>}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {Object.keys(keys).length > 0 && <div className="boundary-actions" style={{ marginTop: 12 }}><button className="btn sm" onClick={() => setKeys({})}>{t('Restaurar todos os atalhos')}</button></div>}
            <p className="soft" style={{ margin: '14px 0 6px' }}>{t('Manutenção: as peças, os bins e as versões salvas ficam.')}</p>
            <div className="boundary-actions">
                <button className="btn sm" onClick={() => window.confirm(t('Voltar todas as preferências, teclas, modo, idioma e tema ao padrão e recarregar?')) && resetSettings()}>{t('Restaurar todos os ajustes')}</button>
                <button className="btn sm" onClick={() => window.confirm(t('Refazer o índice do acervo do zero? A página recarrega e a busca volta em alguns segundos.')) && rebuildIndex()}>{t('Refazer o índice do acervo')}</button>
            </div>
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
        <tbody>{rows.map(([key, text]) => <tr key={key}><td><kbd>{t(key)}</kbd></td><td>{t(text)}</td></tr>)}</tbody>
    </table>
)

const when = (time: number) => new Date(time).toLocaleString(getTag(), { dateStyle: 'short', timeStyle: 'short' })

// VERSÕES DO SALVAMENTO AUTOMÁTICO: NA ABERTURA, AS DE SESSÕES QUE FECHARAM COM ALTERAÇÕES NÃO SALVAS; PELO MENU, TODAS
const Versions = ({ startup }: { startup: boolean }) => {
    const versions                     = useStore(state => state.recovery)
    const { recover, dismissRecovery } = useStore.getState()

    return (
        <>
            <p className="soft" style={{ marginBottom: 12 }}>{startup ? t('O CircuitMaster fechou com alterações não salvas. Abra uma versão para continuar dela; nada é apagado até você descartar.') : t('Cópias gravadas sozinhas a cada mudança: uma nova por minuto de edição, as 20 mais recentes.')}</p>
            {versions.length ? (
                <table className="tbl">
                    <tbody>
                        {versions.map(version => (
                            <tr key={version.id}>
                                <td>{t(version.name)}</td>
                                <td>{when(version.time)}</td>
                                <td>{t('{0} itens', version.count)}</td>
                                <td className="label">{version.dirty ? t('não salvo') : t('salvo')}</td>
                                <td><button className="btn sm" onClick={() => void recover(version)}>{t('Abrir')}</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : <p className="soft">{t('Nenhuma versão guardada ainda: elas aparecem depois da primeira mudança no sketch.')}</p>}
            {startup && <div className="boundary-actions" style={{ marginTop: 12 }}><button className="btn sm" onClick={() => void dismissRecovery()}>{t('Descartar')}</button></div>}
        </>
    )
}

// COMO FAZER CADA COISA, A PARTIR DA TELA NORMAL (O TESTE DE CLAREZA DA SPEC 05 §13)
const GUIDE: [string, string][] = [
    ['Pôr uma peça', 'clique na peça do painel e depois no quadro (ou arraste)'],
    ['Achar uma peça', 'digite o nome na busca do painel, em português ou em inglês'],
    ['Ligar dois terminais', 'clique num terminal e no outro'],
    ['Dobrar um fio', 'clique no meio do caminho ao desenhar, ou arraste o fio'],
    ['Mudar um valor', 'selecione e digite no cartão abaixo da peça'],
    ['Simular', 'clique em Simular; o painel abre embaixo'],
    ['Medir', 'escolha V, A ou V·A na barra do quadro e clique num fio'],
    ['Ver a carga de um capacitor', 'clique na fonte, escolha Degrau em Sinal e Simular'],
    ['Ver o ganho de um amplificador', 'clique na fonte, escolha Senoide em Sinal e Simular'],
    ['Entender uma peça', 'selecione: o cartão "Como funciona" está no inspetor'],
    ['Trabalhar em dois sketches', 'Arquivo › Novo ou abra outro: cada um ganha a sua aba'],
    ['Criar a placa e rotear', 'abra a PCB e clique em "Criar placa e rotear"'],
    ['Ligar e desligar camadas', 'clique na camada na legenda do quadro da PCB'],
    ['Mandar fabricar', 'Arquivo › Exportar › Para produção › Tudo para fabricar (zip)'],
    ['Mover o cursor pelo teclado', 'setas sem nada selecionado (Ctrl: rápido); Enter clica; Espaço zera as coordenadas relativas'],
    ['Mudar a grade', 'N e Shift+N, ou Alt+1 e Alt+2 para as grades rápidas'],
    ['Trocar a unidade das coordenadas', 'Ctrl+U, ou Editar › Preferências'],
    ['Achar qualquer outra ação', 'Ctrl+K e o nome dela']
]

const Guide = () => (
    <table className="tbl keys">
        <tbody>{GUIDE.map(([task, how]) => <tr key={task}><td>{t(task)}</td><td>{t(how)}</td></tr>)}</tbody>
    </table>
)

const About = () => <><p className="soft" style={{ marginBottom: 12 }}>{t('Editor de circuitos compatível com o Fritzing 1.0.8: protoboard, esquemático e PCB sincronizados, simulação SPICE e manufatura (Gerber, Excellon, BOM).')}</p><Table rows={CREDITS} /></>

// SEMENTES DO PREENCHIMENTO DE TERRA: CADA CAIXA MARCA OU DESMARCA NA HORA, COM DESFAZER; O BOTÃO PREENCHE (GroundFillSeedDialog DO FRITZING)
const Seeds = () => {
    const doc     = useStore(state => state.doc)
    const library = useStore(state => state.library)
    const netlist = useStore(state => state.netlist)
    const rows    = getSeedCandidates(doc, library, netlist)
    const { edit, fillCopper } = useStore.getState()

    return (
        <>
            <p className="soft" style={{ marginBottom: 12 }}>{t('No preenchimento de terra o cobre inunda também as trilhas e os terminais ligados às sementes. A lista traz as sementes marcadas e os conectores GND, VSS ou ground da PCB, um por net.')}</p>
            {rows.length ? <ul className="seeds">{rows.map(row => <li key={row.key}><label className="pe-check"><input type="checkbox" checked={row.seed} onChange={event => edit(current => setGroundFillSeed(current, row.key, event.target.checked))} />{row.name}</label></li>)}</ul> : <div className="empty">{t('Nenhum conector de terra na PCB: marque uma semente no menu de contexto de um terminal.')}</div>}
            <div className="boundary-actions" style={{ marginTop: 12 }}><button className="btn sm primary" onClick={() => { useStore.setState({ dialog: null }); void fillCopper('ground') }}>{t('Preencher com terra')}</button></div>
        </>
    )
}

const CONTENT: Record<string, [string, ReactNode]> = {
    recovery: ['Recuperar trabalho não salvo', <Versions startup />],
    versions: ['Versões salvas automaticamente', <Versions startup={false} />],
    shortcuts: ['Atalhos de teclado', <Shortcuts />],
    preferences: ['Preferências', <Preferences />],
    guide: ['Guia de uso', <Guide />],
    seeds: ['Sementes de terra', <Seeds />],
    about: ['Sobre o CircuitMaster', <About />]
}

// JANELA MODAL DE AJUDA E DE VERSÕES; FECHA NO BOTÃO, NO FUNDO OU NO ESC
export const Dialog = () => {
    const dialog = useStore(state => state.dialog)
    const close  = () => useStore.setState({ dialog: null })
    const shown  = dialog ? CONTENT[dialog] : null

    if (!shown)
        return null

    return (
        <div className="modal" role="dialog" aria-modal="true" aria-label={t(shown[0])} onPointerDown={event => event.target === event.currentTarget && close()} onKeyDown={event => event.key === 'Escape' && close()}>
            <section className="card">
                <header className="modal-head">
                    <h2>{t(shown[0])}</h2>
                    <button className="btn sm" autoFocus onClick={close}>{t('Fechar')}</button>
                </header>
                {shown[1]}
            </section>
        </div>
    )
}
