import { useMemo, useState } from 'react'
import { VIEW_BACKGROUNDS, VIEW_LABELS } from '../../core/Layer'
import { Scene } from '../../engine/Scene'
import { Icon } from '../Icon'
import { Kv } from '../Inspector'
import { needsBoard, type ExportKind } from '../Export'
import { GRID_SIZES, parseOrigin, useStore } from '../Store'
import { formatLength, lengthToPx } from '../Navigation'
import { Entry } from '../Inspector'
import { t } from '../../core/Text'

const EXPORTS: [string, ExportKind][] = [['PNG', 'png'], ['SVG', 'svg'], ['PDF', 'pdf'], ['Netlist SPICE', 'spice'], ['Lista de materiais', 'bomHtml'], ['Para produção', 'production']]
const BOARDS  = ['board', 'resizableBoard']

const Check = ({ label, checked, change, hint }: { label: string, checked: boolean, change: (checked: boolean) => void, hint?: string }) => (
    <label className="checkrow" title={hint && t(hint)}><input type="checkbox" checked={checked} onChange={event => change(event.target.checked)} />{t(label)}</label>
)

// ABA DE DOCUMENTO: RESUMO DO SKETCH, AJUSTES DA VISTA CORRENTE, ARQUIVO, EXPORTAÇÃO E OS EXEMPLOS DO FRITZING
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
