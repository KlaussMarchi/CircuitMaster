import { useMemo, useState } from 'react'
import { VIEW_LABELS } from '../../core/Layer'
import { Scene } from '../../engine/Scene'
import { Icon } from '../Icon'
import { Kv } from '../Inspector'
import { BOARD_EXPORTS, type ExportKind } from '../Export'
import { useStore } from '../Store'

const GRID_SIZES: Record<string, string[]> = { breadboardView: ['0.1in', '0.05in', '2.54mm'], schematicView: ['0.1in', '0.05in', '7.5mm'], pcbView: ['0.05in', '0.025in', '0.1in', '1mm'] }
const EXPORTS: [string, ExportKind][] = [['PNG', 'png'], ['SVG', 'svg'], ['PDF', 'pdf'], ['Netlist SPICE', 'spice'], ['Lista de materiais', 'bomHtml'], ['Gerber', 'gerber']]
const BOARDS  = ['board', 'resizableBoard']

const Check = ({ label, checked, change, hint }: { label: string, checked: boolean, change: (checked: boolean) => void, hint?: string }) => (
    <label className="checkrow" title={hint}><input type="checkbox" checked={checked} onChange={event => change(event.target.checked)} />{label}</label>
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
    const { setViewSetting, openSample, exportFile, newSketch, save } = useStore.getState()
    const settings        = doc.settings[view] ?? {}
    const instances       = Object.values(doc.instances)
    const wires           = instances.filter(instance => instance.moduleIdRef === 'WireModuleID').length
    const scene           = useMemo(() => new Scene(doc, library, 'pcbView'), [doc, library])
    const board           = instances.some(instance => scene.isShown(instance) && BOARDS.includes(library.getPart(instance.moduleIdRef)?.kind ?? ''))
    const found           = useMemo(() => samples.filter(file => file.toLowerCase().includes(text.trim().toLowerCase())), [samples, text])
    const folders         = [...new Set(found.map(file => file.split('/').slice(0, -1).join(' / ')))]

    return (
        <>
            <div className="ph">
                <h2>Documento</h2>
                <span className={`pill ${changed ? 'warn' : 'neutral'}`}>{changed ? 'Não salvo' : stored ? 'Salvo' : 'Novo'}</span>
            </div>
            <p className="sub" style={{ overflowWrap: 'anywhere' }}>{name}</p>
            <div className="sec">
                <Kv label="Peças" value={String(instances.length - wires)} />
                <Kv label="Fios e trilhas" value={String(wires)} />
                <Kv label="Conexões" value={String(doc.edges.length)} />
                <Kv label="Pontas de prova" value={String(doc.probes.length)} />
                <Kv label="Formato" value={`Fritzing ${doc.fritzingVersion || '1.0.8'}`} />
            </div>
            <div className="sec">
                <h3>Arquivo</h3>
                <div className="bin-actions">
                    <button className="btn sm" onClick={newSketch}><Icon name="file" />Novo</button>
                    <button className="btn sm" onClick={() => document.getElementById('open-file')?.click()}><Icon name="open" />Abrir</button>
                    <button className="btn sm" onClick={save}><Icon name="save" />Salvar .fzz</button>
                </div>
            </div>
            <div className="sec">
                <h3>Exportar</h3>
                <div className="bin-actions">{EXPORTS.map(([label, kind]) => <button key={kind} className="btn sm" disabled={BOARD_EXPORTS.includes(kind) && !board} title={BOARD_EXPORTS.includes(kind) && !board ? 'precisa de uma placa na PCB' : undefined} onClick={() => void exportFile(kind)}>{label}</button>)}</div>
                <p className="sub" style={{ marginTop: 6 }}>Mais formatos em Arquivo › Exportar.</p>
            </div>
            <div className="sec">
                <h3>Vista: {VIEW_LABELS[view]}</h3>
                <Check label="Mostrar grade" checked={settings.showGrid !== '0'} change={checked => setViewSetting('showGrid', checked ? '1' : '0')} />
                <Check label="Alinhar à grade" checked={settings.alignToGrid !== '0'} change={checked => setViewSetting('alignToGrid', checked ? '1' : '0')} hint="peças com o primeiro terminal na grade; dobras e pontas de fio na grade" />
                {view !== 'pcbView' && <Check label="Fios ortogonais (90°)" checked={settings.orthogonalWires !== '0'} change={checked => setViewSetting('orthogonalWires', checked ? '1' : '0')} hint="fios novos em trechos horizontais e verticais, que continuam retos ao mover peças" />}
                <div className="field">
                    <label>Grade</label>
                    <div className="in">
                        <select value={settings.gridSize ?? GRID_SIZES[view][0]} onChange={event => setViewSetting('gridSize', event.target.value)}>
                            {[...new Set([settings.gridSize ?? GRID_SIZES[view][0], ...GRID_SIZES[view]])].map(size => <option key={size} value={size}>{size}</option>)}
                        </select>
                        <Icon name="chevronDown" />
                    </div>
                </div>
            </div>
            <div className="sec">
                <h3>Exemplos <span className="num">{samples.length}</span></h3>
                <label className="search"><Icon name="search" /><input type="search" placeholder="Buscar exemplo" aria-label="Buscar exemplo" value={text} onChange={event => setText(event.target.value)} /></label>
                {folders.map(folder => (
                    <div key={folder}>
                        <p className="h3">{folder || 'Geral'}</p>
                        <ul className="list">
                            {found.filter(file => file.split('/').slice(0, -1).join(' / ') === folder).map(file => <li key={file}><button className="row-btn" title={file} onClick={() => void openSample(file)}><span className="name grow">{file.split('/').pop()?.replace(/\.fzz$/, '')}</span></button></li>)}
                        </ul>
                    </div>
                ))}
                {text && !found.length && <div className="empty">Nenhum exemplo com “{text}”.</div>}
            </div>
        </>
    )
}
