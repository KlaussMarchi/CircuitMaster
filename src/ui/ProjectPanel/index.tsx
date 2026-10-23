import { useMemo, useState } from 'react'
import { VIEW_BACKGROUNDS, VIEW_LABELS } from '../../core/Layer'
import { Scene } from '../../engine/Scene'
import { Icon } from '../Icon'
import { Entry, Kv, TimeField } from '../Inspector'
import { needsBoard, type ExportKind } from '../Export'
import { GRID_SIZES, parseOrigin, useStore } from '../Store'
import { formatLength, lengthToPx } from '../Navigation'
import { formatSi, parseSi } from '../../core/Properties'
import { INITIAL_KEY, PROJECT_DEFAULTS, getMode, projectValue } from '../../core/Spice'
import { t } from '../../core/Text'

const EXPORTS: [string, ExportKind][] = [['PNG', 'png'], ['SVG', 'svg'], ['PDF', 'pdf'], ['Netlist SPICE', 'spice'], ['Lista de materiais', 'bomHtml'], ['Para produção', 'production']]
const BOARDS  = ['board', 'resizableBoard']
const REAL_TIME = '-1s'    // ANIMAÇÃO NEGATIVA = TEMPO REAL (SPEC 04 §5.2)
const SECONDS: [string, number][] = [['s', 1], ['ms', 1e-3]]

const Check = ({ label, checked, change, hint }: { label: string, checked: boolean, change: (checked: boolean) => void, hint?: string }) => (
    <label className="checkrow" title={hint && t(hint)}><input type="checkbox" checked={checked} onChange={event => change(event.target.checked)} />{t(label)}</label>
)

const Seg = <T extends string>({ value, options, change, label }: { value: T, options: [T, string][], change: (value: T) => void, label: string }) => (
    <div className="seg tabs" role="tablist" aria-label={t(label)}>{options.map(([id, text]) => <button key={id} className="tab" role="tab" aria-selected={value === id} onClick={() => change(id)}>{t(text)}</button>)}</div>
)

// OPÇÕES RARAS DA SIMULAÇÃO, FORA DO PAINEL: ANIMAÇÃO, VALORES SOBRE O CIRCUITO, AMOSTRAGEM E INÍCIO DA JANELA MANUAL E OPÇÕES DO SPICE
const SimulationOptions = () => {
    const doc      = useStore(state => state.doc)
    const show     = useStore(state => state.show)
    const { setProjectProperties, setShow } = useStore.getState()
    const value    = (key: string) => projectValue(doc, key)
    const fixed    = value('simulator_time_step_mode').toLowerCase().includes('true')
    const realtime = (parseSi(value('simulator_animation_time_s'), 's') ?? 0) < 0
    const write    = (key: string, text: string, valid: boolean) => valid ? setProjectProperties({ [key]: text }) : useStore.setState({ message: t('{0}: valor inválido', text) })

    return (
        <div className="sec" aria-label={t('Opções da simulação')}>
            <h3>{t('Simulação')}</h3>
            <div className="field"><label>{t('Animação')}</label><TimeField label="Duração da animação" units={SECONDS} value={realtime ? null : parseSi(value('simulator_animation_time_s'), 's')} commit={seconds => setProjectProperties({ simulator_animation_time_s: formatSi(seconds, 's', 6) })} /></div>
            <Check label="Tempo real (1 s simulado leva 1 s)" checked={realtime} change={checked => setProjectProperties({ simulator_animation_time_s: checked ? REAL_TIME : PROJECT_DEFAULTS.simulator_animation_time_s })} />
            <Check label="Valores das pontas sobre o circuito" checked={show.values} change={checked => setShow({ values: checked })} />
            {getMode(doc) === 'custom' && <>
                <h3 style={{ marginTop: 10 }}>{t('Janela manual')}</h3>
                <div className="field"><label>{t('Amostragem')}</label><Seg label="Amostragem" value={fixed ? 'step' : 'points'} options={[['points', 'Pontos'], ['step', 'Passo fixo']]} change={item => setProjectProperties({ simulator_time_step_mode: String(item === 'step') })} /></div>
                {fixed ? <div className="field"><label>{t('Passo')}</label><TimeField label="Passo" value={parseSi(value('simulator_time_step_s'), 's')} commit={seconds => seconds > 0 && setProjectProperties({ simulator_time_step_s: formatSi(seconds, 's', 6) })} /></div> : <div className="field"><label>{t('Pontos')}</label><Entry value={value('simulator_number_of_steps')} options={['200', '400', '1000', '5000']} numeric commit={text => write('simulator_number_of_steps', text || '400', Number(text || 400) >= 2)} /></div>}
                <div className="field"><label>{t('Começa')}</label><Seg label="Condição inicial" value={value(INITIAL_KEY) === 'zero' ? 'zero' : 'op'} options={[['zero', 'Descarregado'], ['op', 'Em regime']]} change={item => setProjectProperties({ [INITIAL_KEY]: item })} /></div>
            </>}
            <div className="field"><label>{t('Opções do SPICE')}</label><Entry value={value('simulator_spice_options')} options={['.options reltol=1e-4']} numeric={false} commit={text => setProjectProperties({ simulator_spice_options: text.trim() })} /></div>
        </div>
    )
}

// ABA DE DOCUMENTO: RESUMO DO SKETCH, AJUSTES DA VISTA CORRENTE, ARQUIVO, EXPORTAÇÃO, OPÇÕES DA SIMULAÇÃO E OS EXEMPLOS DO FRITZING
export const ProjectPanel = () => {
    const doc             = useStore(state => state.doc)
    const library         = useStore(state => state.library)
    const name            = useStore(state => state.name)
    const view            = useStore(state => state.view)
    const samples         = useStore(state => state.samples)
    const changed         = useStore(state => state.doc !== state.saved)
    const stored          = useStore(state => state.stored)
    const [text, setText] = useState('')
    const grids           = useStore(state => state.preferences.grids[state.view]) ?? GRID_SIZES[view]
    const units           = useStore(state => state.preferences.units)
    const { setViewSetting, openSample, exportFile, newSketch, save, setGridOrigin, setGridSize } = useStore.getState()
    // "x, y" NA UNIDADE ESCOLHIDA (VÍRGULA DECIMAL TAMBÉM VALE: "12,7 5,08"); VAZIO VOLTA A ORIGEM A ZERO
    const setOrigin       = (text: string) => {
        const [x, y] = text.trim().split(/\s*;\s*|,\s+|\s+/).map(part => Number(part.replace(',', '.')))

        if (!text.trim())
            return setGridOrigin(null)

        if (!Number.isFinite(x) || !Number.isFinite(y))
            return useStore.setState({ message: t('origem da grade inválida: use x, y') })

        setGridOrigin([lengthToPx(x, units), lengthToPx(y, units)])
    }
    const settings        = doc.settings[view] ?? {}
    const background      = (settings.backgroundColor ?? VIEW_BACKGROUNDS[view]).toLowerCase()
    const instances       = Object.values(doc.instances)
    const wires           = instances.filter(instance => instance.moduleIdRef === 'WireModuleID').length
    const scene           = useMemo(() => new Scene(doc, library, 'pcbView'), [doc, library])
    const board           = instances.some(instance => scene.isShown(instance) && BOARDS.includes(library.getPart(instance.moduleIdRef)?.kind ?? ''))
    const found           = useMemo(() => samples.filter(file => file.toLowerCase().includes(text.trim().toLowerCase())), [samples, text])
    const folders         = [...new Set(found.map(file => file.split('/').slice(0, -1).join(' / ')))]

    return (
        <>
            <div className="ph">
                <h2>{t('Documento')}</h2>
                <span className={`pill ${changed ? 'warn' : 'neutral'}`}>{changed ? t('Não salvo') : stored ? t('Salvo') : t('Novo')}</span>
            </div>
            <p className="sub" style={{ overflowWrap: 'anywhere' }}>{t(name)}</p>
            <div className="sec">
                <Kv label="Peças" value={String(instances.length - wires)} />
                <Kv label="Fios e trilhas" value={String(wires)} />
                <Kv label="Conexões" value={String(doc.edges.length)} />
                <Kv label="Pontas de prova" value={String(doc.probes.length)} />
                <Kv label="Formato" value={`Fritzing ${doc.fritzingVersion || '1.0.8'}`} />
            </div>
            <div className="sec">
                <h3>{t('Arquivo')}</h3>
                <div className="bin-actions">
                    <button className="btn sm" onClick={newSketch}><Icon name="file" />{t('Novo')}</button>
                    <button className="btn sm" onClick={() => document.getElementById('open-file')?.click()}><Icon name="open" />{t('Abrir')}</button>
                    <button className="btn sm" onClick={save}><Icon name="save" />{t('Salvar .fzz')}</button>
                </div>
            </div>
            <div className="sec">
                <h3>{t('Exportar')}</h3>
                <div className="bin-actions">{EXPORTS.map(([label, kind]) => <button key={kind} className="btn sm" disabled={needsBoard(kind) && !board} title={needsBoard(kind) && !board ? t('precisa de uma placa na PCB') : undefined} onClick={() => void exportFile(kind)}>{t(label)}</button>)}</div>
                <p className="sub" style={{ marginTop: 6 }}>{t('Mais formatos em Arquivo › Exportar.')}</p>
            </div>
            <div className="sec">
                <h3>{t('Vista: {0}', t(VIEW_LABELS[view]))}</h3>
                <Check label="Mostrar grade" checked={settings.showGrid !== '0'} change={checked => setViewSetting('showGrid', checked ? '1' : '0')} />
                <Check label="Alinhar à grade" checked={settings.alignToGrid !== '0'} change={checked => setViewSetting('alignToGrid', checked ? '1' : '0')} hint="peças com o primeiro terminal na grade; dobras e pontas de fio na grade" />
                {view !== 'pcbView' && <Check label="Fios ortogonais (90°)" checked={settings.orthogonalWires !== '0'} change={checked => setViewSetting('orthogonalWires', checked ? '1' : '0')} hint="fios novos em trechos horizontais e verticais, que continuam retos ao mover peças" />}
                <div className="field">
                    <label title={t('Tamanho livre em in ou mm, de 0.001in a 1in')}>{t('Grade')}</label>
                    <Entry value={settings.gridSize ?? grids[0]} options={grids} numeric commit={setGridSize} />
                </div>
                <div className="field">
                    <label>{t('Cor de fundo')}</label>
                    <div className="in paint">
                        <input id="view-background" type="color" aria-label={t('Cor de fundo')} value={background} onChange={event => setViewSetting('backgroundColor', event.target.value)} />
                        <span className="num grow">{background}</span>
                        {background !== VIEW_BACKGROUNDS[view] && <button onClick={() => setViewSetting('backgroundColor', VIEW_BACKGROUNDS[view])}>{t('Padrão')}</button>}
                    </div>
                </div>
                <div className="field">
                    <label title={t('Origem da grade em {0} (x, y); vazio volta a zero', units)}>{t('Origem da grade')}</label>
                    <Entry value={parseOrigin(settings.gridOrigin).map(value => formatLength(value, units)).join(', ')} options={[]} numeric commit={text => setOrigin(text)} />
                </div>
            </div>
            <SimulationOptions />
            <div className="sec">
                <h3>{t('Exemplos')} <span className="num">{samples.length}</span></h3>
                <label className="search"><Icon name="search" /><input type="search" placeholder={t('Buscar exemplo')} aria-label={t('Buscar exemplo')} value={text} onChange={event => setText(event.target.value)} /></label>
                {folders.map(folder => (
                    <div key={folder}>
                        <p className="h3">{folder || t('Geral')}</p>
                        <ul className="list">
                            {found.filter(file => file.split('/').slice(0, -1).join(' / ') === folder).map(file => <li key={file}><button className="row-btn" title={file} onClick={() => void openSample(file)}><span className="name grow">{file.split('/').pop()?.replace(/\.fzz$/, '')}</span></button></li>)}
                        </ul>
                    </div>
                ))}
                {text && !found.length && <div className="empty">{t('Nenhum exemplo com “{0}”.', text)}</div>}
            </div>
        </>
    )
}
