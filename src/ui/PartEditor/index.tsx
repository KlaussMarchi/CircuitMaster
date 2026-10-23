import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { strToU8, zipSync } from 'fflate'
import { DRAFT_FIELDS, DRAFT_VIEWS, HISTORY_MODES, PartDraft, bumpVersion, canonicalMode, type DraftSnapshot, type DraftView, type HistoryEntry } from '../../core/PartDraft'
import { download } from '../Export'
import { parseXml, tagOf } from '../../core/Xml'
import { INVERTED } from '../Canvas'
import { Icon, type IconName } from '../Icon'
import { useStore, type Editing } from '../Store'
import { t } from '../../core/Text'

type Tab   = 'metadata' | 'connectors' | DraftView
type Side  = 'center' | 'N' | 'S' | 'E' | 'W' | 'free'
type Point = [number, number]
type Gate  = { action: 'save' | 'copy' | 'export', entry: HistoryEntry, bump: boolean }
type Look  = { zoom: number, grid: boolean, background: string, hidden: string[] }

const TABS: [Tab, IconName, string][] = [['metadata', 'project', 'Metadados'], ['connectors', 'chip', 'Conectores'], ['breadboardView', 'breadboard', 'Protoboard'], ['schematicView', 'schematic', 'Esquemático'], ['pcbView', 'pcb', 'PCB'], ['iconView', 'note', 'Ícone']]
const LABELS: Record<typeof DRAFT_FIELDS[number], string> = { title: 'Título', label: 'Rótulo (prefixo)', author: 'Autor', version: 'Versão', date: 'Data', url: 'URL', description: 'Descrição' }
const SIDES: [Side, string][] = [['center', 'Centro'], ['N', 'Topo'], ['S', 'Base'], ['W', 'Esquerda'], ['E', 'Direita']]
const MODES: Record<string, [string, string]> = { optional: ['opcional', 'oferecida quando faz diferença'], recommended: ['recomendada', 'perguntada a cada carga'], required: ['obrigatória', 'aplicada sem perguntar'] }
const TYPES = ['male', 'female', 'pad']
const MARK  = 500    // O RETÂNGULO DO TERMINAL TEM 1/500 DA CAIXA DO ELEMENTO (SPEC 01 §8A.4)
const STEPS = 100    // PASSOS GUARDADOS NO DESFAZER DO EDITOR (CADA UM LEVA O .fzp E OS SVG)
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4]
const GRID  = 0.1    // in, A GRADE DO DESENHO DA VISTA
const TYPE_NAMES: [string, string][] = [['male', 'Macho'], ['female', 'Fêmea'], ['pad', 'Pad']]
const MOUNTS: [boolean, string][]    = [[false, 'Passante'], [true, 'SMD']]
const RASTER = /^image\/(png|jpeg)$/

// IMAGEM PNG OU JPG COMO DESENHO DA VISTA: UM SVG COM A IMAGEM EMBUTIDA NO TAMANHO DELA A 90 dpi, COMO O Load image for view DO FRITZING
const rasterSvg = async (file: File) => {
    const url    = await new Promise<string>(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.readAsDataURL(file)
    })
    const image  = new Image()
    image.src    = url
    await image.decode()
    const [w, h] = [image.naturalWidth, image.naturalHeight]
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w / 90}in" height="${h / 90}in" viewBox="0 0 ${w} ${h}"><image width="${w}" height="${h}" xlink:href="${url}"/></svg>`
}

const prefixOf = (title: string) => title.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'peca'

const localDate = () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const Field = ({ label, children }: { label: string, children: ReactNode }) => (
    <label className="field">
        <span>{t(label)}</span>
        {children}
    </label>
)

// TEXTO QUE SÓ GRAVA AO SAIR DO CAMPO OU COM Enter (UMA ALTERAÇÃO POR EDIÇÃO, NÃO POR TECLA)
const Text = ({ value, commit, area = false }: { value: string, commit: (text: string) => void, area?: boolean }) => {
    const [text, setText] = useState(value)

    useEffect(() => setText(value), [value])

    return <div className={area ? 'in area' : 'in'}>{area ? <textarea value={text} onChange={event => setText(event.target.value)} onBlur={() => text !== value && commit(text)} /> : <input className="text" value={text} onChange={event => setText(event.target.value)} onBlur={() => text !== value && commit(text)} onKeyDown={event => event.key === 'Enter' && event.currentTarget.blur()} />}</div>
}

const Metadata = ({ draft, change }: { draft: PartDraft, change: (mutate: () => void) => void }) => {
    const properties = draft.getProperties()
    const history    = draft.getHistory().reverse()
    const setRow     = (index: number, row: [string, string] | null) => change(() => draft.setProperties([...properties.slice(0, index), ...row ? [row] : [], ...properties.slice(index + 1)]))

    return (
        <div className="pe-page">
            <section className="sec">
                <h3>{t('Identificação')}</h3>
                {DRAFT_FIELDS.map(name => <Field key={name} label={LABELS[name]}><Text value={draft.getField(name)} area={name === 'description'} commit={text => change(() => draft.setField(name, text))} /></Field>)}
                <Field label="Tags"><Text value={draft.getTags().join(', ')} commit={text => change(() => draft.setTags(text.split(',')))} /></Field>
            </section>
            <section className="sec">
                <h3>{t('Propriedades')}<button className="btn sm" onClick={() => setRow(properties.length, [t('nova propriedade'), ''])}>{t('Nova propriedade')}</button></h3>
                {properties.map(([name, value], i) => (
                    <div key={`${i}-${name}`} className="pe-prop">
                        <Text value={name} commit={text => setRow(i, [text, value])} />
                        <Text value={value} commit={text => setRow(i, [name, text])} />
                        <button className="icon-btn" aria-label={t('Apagar {0}', name)} title={t('Apagar')} onClick={() => setRow(i, null)}><Icon name="close" /></button>
                    </div>
                ))}
            </section>
            <section className="sec">
                <h3>{t('Histórico de revisões')}</h3>
                {history.length ? (
                    <table className="tbl keys">
                        <thead><tr><th>{t('Data')}</th><th>{t('Autor')}</th><th>{t('Modo')}</th><th>{t('Alterações')}</th></tr></thead>
                        <tbody>
                            {history.map((entry, i) => (
                                <tr key={i}>
                                    <td className="num">{entry.date || '—'}</td>
                                    <td>{entry.author || '—'}</td>
                                    <td>{t(MODES[canonicalMode(entry.mode)][0])}</td>
                                    <td className="pe-text">{entry.description || <span className="muted">{t('sem texto')}</span>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : <p className="sub">{t('Nenhuma revisão registrada.')}</p>}
                <p className="sub" style={{ marginTop: 8 }}>{t('Ao gravar uma peça alterada, o editor pede o registro do que mudou (elemento <history> do .fzp).')}</p>
            </section>
        </div>
    )
}

// PEDIDO DE REGISTRO DA REVISÃO ANTES DE GRAVAR UMA PEÇA ALTERADA (SPEC 01 §8A.7)
const SaveGate = ({ gate, version, set, finish }: { gate: Gate, version: string, set: (gate: Gate) => void, finish: (choice: 'record' | 'skip' | 'cancel') => void }) => {
    const entry = (patch: Partial<HistoryEntry>) => set({ ...gate, entry: { ...gate.entry, ...patch } })

    return (
        <div className="modal" onKeyDown={event => event.key === 'Escape' && finish('cancel')}>
            <section className="card pe-gate" role="dialog" aria-label={t('Gravar peça')}>
                <div className="modal-head"><h2>{t('Gravar peça')}</h2></div>
                <p className="sub">{t('Você ainda não registrou o que mudou nesta revisão.')}</p>
                <div className="sec">
                    <Field label="Data"><div className="in"><input type="date" className="text" value={gate.entry.date} onChange={event => entry({ date: event.target.value })} /></div></Field>
                    <Field label="Autor"><div className="in"><input className="text" value={gate.entry.author} onChange={event => entry({ author: event.target.value })} /></div></Field>
                    <Field label="Modo">
                        <div className="in">
                            <select value={canonicalMode(gate.entry.mode)} onChange={event => entry({ mode: event.target.value })}>
                                {HISTORY_MODES.map(mode => <option key={mode} value={mode}>{t(MODES[mode][0])} — {t(MODES[mode][1])}</option>)}
                            </select>
                        </div>
                    </Field>
                    <Field label="O que mudou"><div className="in area"><textarea autoFocus value={gate.entry.description} onChange={event => entry({ description: event.target.value })} /></div></Field>
                    <label className="pe-check"><input type="checkbox" checked={gate.bump} onChange={event => set({ ...gate, bump: event.target.checked })} />{t('Subir a versão para {0}', bumpVersion(version))}</label>
                </div>
                <div className="pe-acts">
                    <button className="btn sm" onClick={() => finish('cancel')}>{t('Cancelar')}</button>
                    <button className="btn sm" onClick={() => finish('skip')}>{t('Gravar sem registro')}</button>
                    <button className="btn sm primary" disabled={!gate.entry.description.trim()} onClick={() => finish('record')}>{t('Registrar e gravar')}</button>
                </div>
            </section>
        </div>
    )
}

const Connectors = ({ draft, change }: { draft: PartDraft, change: (mutate: () => void) => void }) => {
    const connectors = draft.getConnectors()
    const views      = DRAFT_VIEWS.filter(view => view !== 'iconView' && draft.svgs[view])
    const missing    = Object.fromEntries(views.map(view => [view, draft.getAssignments(view).missing]))

    return (
        <div className="pe-page wide">
            <div className="field pe-count">
                <span>{t('Número de conectores')}</span>
                <div className="in"><input type="number" min={0} max={999} aria-label={t('Número de conectores')} value={connectors.length} onChange={event => change(() => draft.setCount(Math.max(0, Math.min(999, Number(event.target.value) || 0))))} /></div>
                <span className="sub">{t('novos conectores ganham o próximo número livre; diminuir apaga os de maior número')}</span>
            </div>
            <div className="pe-row">
                <span>{t('Definir todos como')}</span>
                <div className="seg tabs" role="tablist" aria-label={t('Definir todos como')}>{TYPE_NAMES.map(([type, label]) => <button key={type} className="tab" role="tab" aria-selected={connectors.length > 0 && connectors.every(connector => connector.type === type)} onClick={() => change(() => draft.setAllTypes(type))}>{t(label)}</button>)}</div>
                {draft.svgs.pcbView && <div className="seg tabs" role="tablist" aria-label={t('Montagem na PCB')}>{MOUNTS.map(([smd, label]) => <button key={label} className="tab" role="tab" aria-selected={draft.isSmd() === smd} onClick={() => draft.isSmd() !== smd && change(() => draft.setSmd(smd))}>{t(label)}</button>)}</div>}
            </div>
            <table className="tbl keys pe-table">
                <thead><tr><th>{t('Id')}</th><th>{t('Nome')}</th><th>{t('Descrição')}</th><th>{t('Tipo')}</th><th>{t('Vistas')}</th></tr></thead>
                <tbody>
                    {connectors.map(connector => (
                        <tr key={connector.id}>
                            <td className="num muted">{connector.id}</td>
                            <td><Text value={connector.name} commit={text => change(() => draft.setConnector(connector.id, { name: text }))} /></td>
                            <td><Text value={connector.description} commit={text => change(() => draft.setConnector(connector.id, { description: text }))} /></td>
                            <td><div className="in"><select value={connector.type} onChange={event => change(() => draft.setConnector(connector.id, { type: event.target.value }))}>{TYPES.map(type => <option key={type}>{type}</option>)}</select></div></td>
                            <td className="pe-views">{views.map(view => <span key={view} className={`pill ${missing[view].includes(connector.id) ? 'bad' : 'ok'}`} title={missing[view].includes(connector.id) ? t('sem elemento nesta vista') : t('atribuído')}>{t(TABS.find(([id]) => id === view)?.[2] ?? '')}</span>)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <Buses draft={draft} change={change} />
        </div>
    )
}

// CONEXÕES INTERNAS (BARRAMENTOS): CONECTORES LIGADOS DENTRO DA PEÇA, COMO OS PINOS GND DE UM ARDUINO (Set Internal Connections DO FRITZING)
const Buses = ({ draft, change }: { draft: PartDraft, change: (mutate: () => void) => void }) => {
    const buses             = draft.getBuses()
    const connectors        = draft.getConnectors()
    const [picked, setPick] = useState<string[]>([])
    const nameOf            = (id: string) => connectors.find(connector => connector.id === id)?.name || id
    const flip              = (id: string) => setPick(picked.includes(id) ? picked.filter(other => other !== id) : [...picked, id])

    return (
        <div className="pe-buses">
            <h3>{t('Conexões internas')}</h3>
            <p className="sub">{t('Conectores ligados por dentro da peça: o netlist os trata como um só nó.')}</p>
            {buses.map((bus, i) => (
                <div key={i} className="pe-bus">
                    <span>{bus.map(nameOf).join(' · ')}</span>
                    <button className="icon-btn" aria-label={t('Remover a conexão interna {0}', bus.map(nameOf).join(', '))} title={t('Remover')} onClick={() => change(() => draft.setBuses(buses.filter((_, j) => j !== i)))}><Icon name="close" /></button>
                </div>
            ))}
            <div className="pe-bus-pick">{connectors.map(connector => <label key={connector.id} className="pe-check"><input type="checkbox" checked={picked.includes(connector.id)} onChange={() => flip(connector.id)} />{connector.name || connector.id}</label>)}</div>
            <button className="btn sm" disabled={picked.length < 2} onClick={() => {
                change(() => draft.setBuses([...buses.filter(bus => !bus.some(id => picked.includes(id))), [...new Set([...buses.filter(bus => bus.some(id => picked.includes(id))).flat(), ...picked])]]))
                setPick([])
            }}>{t('Ligar os marcados')}</button>
        </div>
    )
}

// SVG DA VISTA EM LINHA (JÁ SANEADO NA CÓPIA): CLIQUE ESCOLHE O ELEMENTO, Alt+CLIQUE O GRUPO QUE O CONTÉM; ATRIBUÍDOS REALÇADOS E MARCA ARRASTÁVEL NO TERMINAL DO CONECTOR CORRENTE
const Stage = ({ text, assigned, current, terminal, filter, look, pick, drop }: { text: string, assigned: Map<string, string>, current: string | null, terminal: string | null, filter: string | undefined, look: Look, pick: (index: string, force: boolean) => void, drop: (client: Point) => void }) => {
    const ref             = useRef<HTMLDivElement>(null)
    const dragRef         = useRef<{ pointer: Point, origin: Point, box: DOMRect } | null>(null)
    const [mark, setMark] = useState<Point | null>(null)

    const elementOf = (host: HTMLElement) => [...assigned].filter(([, connector]) => connector === current).map(([index]) => host.querySelector(`[data-pe="${index}"]`)).find(element => element) ?? null

    useLayoutEffect(() => {
        const host = ref.current

        if (!host)
            return

        host.innerHTML = text
        assigned.forEach((connector, index) => host.querySelector(`[data-pe="${index}"]`)?.classList.add(connector === current ? 'pe-current' : 'pe-pin'))
        look.hidden.forEach(layer => host.querySelectorAll<SVGElement>(`[id="${layer}"]`).forEach(element => element.style.display = 'none'))

        const svg    = host.querySelector('svg')
        const inches = svg ? parseFloat(svg.getAttribute('width') ?? '') / (svg.getAttribute('width')?.endsWith('mm') ? 25.4 : 1) : 0
        const step   = svg && inches > 0 ? svg.getBoundingClientRect().width / inches * GRID : 0
        host.style.backgroundImage = look.grid && step > 4 ? 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)' : ''
        host.style.backgroundSize  = `${step}px ${step}px`

        const target = (terminal ? host.querySelector(`[id="${terminal}"]`) : null) ?? elementOf(host)
        const frame  = host.getBoundingClientRect()
        const box    = target?.getBoundingClientRect()
        setMark(box ? [box.left + box.width / 2 - frame.left, box.top + box.height / 2 - frame.top] : null)
    }, [text, assigned, current, terminal, look])

    const onClick = (event: MouseEvent<HTMLDivElement>) => {
        const element = (event.target as Element).closest('[data-pe]')
        const chosen  = event.altKey ? element?.parentElement?.closest('[data-pe]') ?? element : element

        if (chosen && chosen.tagName.toLowerCase() !== 'svg')
            pick(chosen.getAttribute('data-pe') ?? '', event.shiftKey)
    }

    // A MARCA ANDA PRESA À CAIXA DO ELEMENTO NA TELA; COM Shift, SÓ NO EIXO DO MAIOR DESLOCAMENTO
    const onMark = (event: PointerEvent<HTMLSpanElement>) => {
        const host  = ref.current
        const frame = host?.getBoundingClientRect()
        const drag  = dragRef.current

        if (event.type === 'pointerdown') {
            const box = host && mark && frame ? elementOf(host)?.getBoundingClientRect() : undefined
            event.currentTarget.setPointerCapture(event.pointerId)
            dragRef.current = box && mark && frame ? { pointer: [event.clientX, event.clientY], origin: [frame.left + mark[0], frame.top + mark[1]], box } : null
            return
        }

        if (!drag || !frame)
            return

        const [dx, dy]      = [event.clientX - drag.pointer[0], event.clientY - drag.pointer[1]]
        const [mx, my]      = !event.shiftKey ? [dx, dy] : Math.abs(dx) >= Math.abs(dy) ? [dx, 0] : [0, dy]
        const client: Point = [Math.min(drag.box.right, Math.max(drag.box.left, drag.origin[0] + mx)), Math.min(drag.box.bottom, Math.max(drag.box.top, drag.origin[1] + my))]
        setMark([client[0] - frame.left, client[1] - frame.top])

        if (event.type === 'pointerup') {
            dragRef.current = null
            drop(client)
        }
    }

    return (
        <div className="pe-frame">
            <div ref={ref} className="pe-stage" style={{ filter, width: `${look.zoom * 100}%`, height: `${look.zoom * 100}%` }} onClick={onClick} />
            {mark && <span className="pe-mark" title={t('Arraste para mudar o ponto terminal')} style={{ left: mark[0], top: mark[1] }} onPointerDown={onMark} onPointerMove={onMark} onPointerUp={onMark} />}
        </div>
    )
}

const sidePoint = (box: DOMRect, side: Side): Point => side === 'N' ? [box.x + box.width / 2, box.y] :
                                                      side === 'S' ? [box.x + box.width / 2, box.y + box.height] :
                                                      side === 'W' ? [box.x, box.y + box.height / 2] :
                                                      side === 'E' ? [box.x + box.width, box.y + box.height / 2] : [box.x + box.width / 2, box.y + box.height / 2]

// RETÂNGULO DO TERMINAL NUM PONTO DA CAIXA LOCAL DO ELEMENTO, LEVADO PARA O PAI PELA TRANSFORMAÇÃO DO PRÓPRIO ELEMENTO (O RETÂNGULO É IRMÃO DELE)
const terminalRect = (element: SVGGraphicsElement, local: Point): [number, number, number, number] => {
    const box    = element.getBBox()
    const matrix = element.transform.baseVal.consolidate()?.matrix
    const [x, y] = matrix ? [matrix.a * local[0] + matrix.c * local[1] + matrix.e, matrix.b * local[0] + matrix.d * local[1] + matrix.f] : local
    const [w, h] = [box.width / MARK, box.height / MARK]
    return [x - w / 2, y - h / 2, w, h]
}

const ViewTab = ({ draft, view, version, change }: { draft: PartDraft, view: DraftView, version: number, change: (mutate: () => void) => void }) => {
    const connectors            = draft.getConnectors()
    const [look, setLook]       = useState<Look>({ zoom: 1, grid: false, background: '', hidden: [] })
    const layers                = draft.layerIds(view)
    const theme                 = useStore(state => state.theme)
    const [current, setCurrent] = useState<string | null>(connectors[0]?.id ?? null)
    const [sides, setSides]     = useState<Record<string, Side>>({})
    const fileRef               = useRef<HTMLInputElement>(null)
    const text                  = useMemo(() => draft.getSvgText(view, true), [draft, view, version])
    const { assigned, missing } = useMemo(() => draft.getAssignments(view), [draft, view, version])
    const pin                   = connectors.find(connector => connector.id === current)?.pins[view]?.[0]
    const side                  = current && pin?.terminalId ? sides[current] ?? null : 'center'

    const pick = (index: string, force: boolean) => {
        const owner = draft.findConnector(view, index)

        if (owner && owner !== current && !force)
            return setCurrent(owner)

        if (current)
            change(() => draft.assign(view, current, index))
    }

    const elementOf = () => current && pin?.svgId ? document.querySelector(`.pe-stage [id="${pin.svgId}"]`) as SVGGraphicsElement | null : null

    const place = (chosen: Side) => {
        const element = elementOf()

        if (!current)
            return

        setSides({ ...sides, [current]: chosen })
        change(() => draft.setTerminal(view, current, chosen === 'center' || !element ? null : terminalRect(element, sidePoint(element.getBBox(), chosen))))
    }

    // MARCA SOLTA NA TELA: O PONTO VOLTA À CAIXA LOCAL DO ELEMENTO PELA INVERSA DA SUA TRANSFORMAÇÃO NA TELA
    const drop = ([x, y]: Point) => {
        const element = elementOf()
        const inverse = element?.getScreenCTM()?.inverse()

        if (!current || !element || !inverse)
            return

        const box          = element.getBBox()
        const local: Point = [Math.min(box.x + box.width, Math.max(box.x, inverse.a * x + inverse.c * y + inverse.e)), Math.min(box.y + box.height, Math.max(box.y, inverse.b * x + inverse.d * y + inverse.f))]
        setSides({ ...sides, [current]: 'free' })
        change(() => draft.setTerminal(view, current, terminalRect(element, local)))
    }

    const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        event.target.value = ''

        if (!file)
            return

        const svg  = RASTER.test(file.type) ? await rasterSvg(file) : await file.text()
        const root = parseXml(svg)

        if (!root || tagOf(root) !== 'svg')
            return useStore.setState({ message: t('{0}: SVG inválido', file.name) })

        change(() => draft.setSvg(view, svg))
    }

    const reuse = (other: DraftView) => change(() => draft.setSvg(view, draft.getSvgText(other)))

    const exportView = () => download(`${prefixOf(draft.getField('title'))}_${view.replace('View', '')}.svg`, strToU8(draft.getSvgText(view)), 'image/svg+xml')

    const zoomBy = (step: number) => setLook({ ...look, zoom: ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, ZOOMS.indexOf(look.zoom) + step))] })

    return (
        <div className="pe-view">
            <div className="pe-well" style={{ background: look.background || undefined }}>
                <div className="pe-tools" role="toolbar" aria-label={t('Vista do editor')}>
                    <button className="icon-btn sm" aria-label={t('Diminuir zoom')} title={t('Diminuir zoom')} onClick={() => zoomBy(-1)}><Icon name="minus" /></button>
                    <button className="btn sm num" title={t('Ajustar à área')} onClick={() => setLook({ ...look, zoom: 1 })}>{Math.round(look.zoom * 100)}%</button>
                    <button className="icon-btn sm" aria-label={t('Aumentar zoom')} title={t('Aumentar zoom')} onClick={() => zoomBy(1)}><Icon name="plus" /></button>
                    <label className="pe-check"><input type="checkbox" checked={look.grid} onChange={event => setLook({ ...look, grid: event.target.checked })} />{t('Grade de 0,1 in')}</label>
                    <input type="color" aria-label={t('Cor de fundo')} title={t('Cor de fundo')} value={look.background || '#ffffff'} onChange={event => setLook({ ...look, background: event.target.value })} />
                    {look.background && <button className="link" onClick={() => setLook({ ...look, background: '' })}>{t('Padrão')}</button>}
                    {layers.map(layer => <button key={layer} className="pill" aria-pressed={!look.hidden.includes(layer)} title={t(look.hidden.includes(layer) ? 'Mostrar {0}' : 'Ocultar {0}', layer)} onClick={() => setLook({ ...look, hidden: look.hidden.includes(layer) ? look.hidden.filter(other => other !== layer) : [...look.hidden, layer] })}>{layer}</button>)}
                </div>
                {text ? <Stage text={text} assigned={assigned} current={current} terminal={pin?.terminalId || null} filter={view === 'schematicView' && theme === 'dark' && !look.background ? INVERTED : undefined} look={look} pick={pick} drop={drop} /> : <p className="pe-empty">{t('Esta vista não tem desenho. Carregue um SVG.')}</p>}
            </div>
            <aside className="pe-side">
                <div className="pe-side-head">
                    <button className="btn sm full" onClick={() => fileRef.current?.click()}><Icon name="open" />{t('Carregar SVG…')}</button>
                    <input ref={fileRef} type="file" accept=".svg,image/svg+xml,.png,image/png,.jpg,.jpeg,image/jpeg" hidden onChange={onFile} />
                    {view === 'iconView' && DRAFT_VIEWS.filter(other => other !== view && draft.svgs[other]).map(other => <button key={other} className="btn sm full" onClick={() => reuse(other)}>{t('Usar a imagem da vista {0}', t(TABS.find(([id]) => id === other)?.[2] ?? ''))}</button>)}
                    {view !== 'iconView' && draft.svgs[view] && <button className="btn sm full" onClick={() => change(() => draft.onlyView(view))}>{t('Só nesta vista')}</button>}
                    {draft.svgs[view] && <button className="btn sm full" onClick={exportView}><Icon name="save" />{t('Baixar o SVG da vista')}</button>}
                    {view !== 'iconView' && <p className="sub">{t('Escolha um conector e clique no elemento do desenho que é o pino dele (Alt+clique pega o grupo). Clicar num elemento já atribuído escolhe o conector dele; Shift+clique o passa para o conector escolhido.')}</p>}
                </div>
                {view !== 'iconView' && (
                    <>
                        <ul className="pe-pins">
                            {connectors.map(connector => (
                                <li key={connector.id}>
                                    <button className="pe-pin-btn" aria-pressed={connector.id === current} onClick={() => setCurrent(connector.id)}>
                                        <span className={`dot ${missing.includes(connector.id) ? 'bad' : 'ok'}`} />
                                        <span className="name">{connector.name || connector.id}</span>
                                        <span className="num muted">{connector.id}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                        {current && (
                            <div className="pe-side-foot">
                                <h3 className="sub">{t('Ponto terminal')}</h3>
                                <div className="seg tabs pe-sides" role="tablist" aria-label={t('Ponto terminal')}>
                                    {SIDES.map(([value, label]) => <button key={value} className="tab" role="tab" aria-selected={value === side} disabled={missing.includes(current)} onClick={() => place(value)}>{t(label)}</button>)}
                                </div>
                                <p className="sub">{missing.includes(current) ? t('Atribua um elemento antes do terminal.') : side === 'center' ? t('O fio liga no centro do elemento.') : t('Terminal em {0}.', pin?.terminalId ?? '')} {!missing.includes(current) && t('Arraste a marca vermelha para qualquer ponto do elemento (Shift trava um eixo).')}</p>
                            </div>
                        )}
                    </>
                )}
            </aside>
        </div>
    )
}

// EDITOR DE PEÇAS: CÓPIA DE TRABALHO DA PEÇA EM ABAS, GRAVADA COMO PEÇA NOVA EM MEUS ITENS (SPEC 01 §8A)
const EditorWindow = ({ moduleId, modelIndex }: Editing) => {
    const library                 = useStore(state => state.library)
    const catalog                 = useStore(state => state.catalog)
    const [draft, setDraft]       = useState<PartDraft | null>(null)
    const [version, setVersion]   = useState(0)
    const [tab, setTab]           = useState<Tab>('metadata')
    const [replace, setReplace]   = useState(true)
    const [saving, setSaving]     = useState(false)
    const [saved, setSaved]       = useState(0)
    const [gate, setGate]         = useState<Gate | null>(null)
    const [past, setPast]         = useState<DraftSnapshot[]>([])
    const [future, setFuture]     = useState<DraftSnapshot[]>([])
    const own                     = useStore(state => state.mine.includes(moduleId) || state.userBins.some(bin => bin.moduleIds.includes(moduleId)))
    const { editPart, installPart } = useStore.getState()

    useEffect(() => {
        let live = true

        const load = async () => {
            const fzp  = await library.getFzpText(moduleId)
            const svgs = await Promise.all(DRAFT_VIEWS.map(async view => [view, await library.getImageText(moduleId, view)] as const))
            const made = fzp ? new PartDraft(fzp, Object.fromEntries(svgs.filter(([, text]) => text))) : null
            made?.update()

            if (live)
                setDraft(made)

            if (live && !made)
                useStore.setState({ message: t('não foi possível ler a peça'), editing: null })
        }

        void load()
        return () => {
            live = false
        }
    }, [library, moduleId])

    // CADA MUDANÇA GUARDA O ESTADO DE ANTES: DESFAZER E REFAZER NO EDITOR (O undoStack DO pemainwindow.cpp)
    const change = (mutate: () => void) => {
        const before = draft?.snapshot()

        if (before)
            setPast(steps => [...steps.slice(1 - STEPS), before])

        setFuture([])
        mutate()
        setVersion(value => value + 1)
    }

    const travel = (from: DraftSnapshot[], to: DraftSnapshot[], setFrom: (steps: DraftSnapshot[]) => void, setTo: (steps: DraftSnapshot[]) => void) => {
        if (!draft || !from.length)
            return

        setTo([...to, draft.snapshot()])
        draft.restore(from[from.length - 1])
        setFrom(from.slice(0, -1))
        setVersion(value => value + 1)
    }

    const undo = () => travel(past, future, setPast, setFuture)

    const redo = () => travel(future, past, setFuture, setPast)

    const steps   = useRef({ undo, redo })
    steps.current = { undo, redo }

    // Ctrl+Z E Ctrl+Y DESFAZEM NO EDITOR, NÃO NO SKETCH: CAPTURA NA JANELA, ANTES DO TECLADO DO APP; NOS CAMPOS DE TEXTO FICA O DESFAZER DO CAMPO
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const key = `${event.ctrlKey || event.metaKey ? 'ctrl+' : ''}${event.shiftKey ? 'shift+' : ''}${event.key.toLowerCase()}`

            if ((event.target as HTMLElement).closest?.('input:not([type=checkbox]), textarea, select') || !['ctrl+z', 'ctrl+y', 'ctrl+shift+z'].includes(key))
                return

            event.preventDefault()
            event.stopPropagation()
            void (key === 'ctrl+z' ? steps.current.undo() : steps.current.redo())
        }

        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
    }, [])

    const close = () => (version === saved || window.confirm(t('Fechar o editor de peças e descartar as alterações?'))) && editPart(null)

    const build = async () => {
        if (!draft)
            return null

        const family = draft.getProperties().find(([name]) => name.toLowerCase() === 'family')?.[1] ?? ''
        const taken  = family ? (await catalog.family(family)).map(entry => entry.properties.variant ?? '') : []
        draft.ensureVariant(taken)
        return draft.export(`${prefixOf(draft.getField('title'))}_${crypto.randomUUID().replaceAll('-', '')}_1`)
    }

    // GRAVAR SOBRE A PEÇA PRÓPRIA (Save) OU COMO PEÇA NOVA (Save as new part); PEÇA DO ACERVO SÓ COMO NOVA
    const save = async (copy: boolean) => {
        setSaving(true)
        const files = copy ? await build() : draft?.export(moduleId)

        if (files)
            await installPart(files, replace ? modelIndex : null, copy ? undefined : moduleId)

        setSaving(false)
    }

    const exportFile = async () => {
        const files = await build()

        if (files)
            download(`${files[0].name.slice('part.'.length, -'.fzp'.length)}.fzpz`, zipSync(Object.fromEntries(files.map(file => [file.name, strToU8(file.text)]))), 'application/zip')
    }

    const perform = (action: Gate['action']) => action === 'export' ? exportFile() : save(action === 'copy' || !own)

    // COM ALTERAÇÕES NÃO GRAVADAS, GRAVAR PASSA ANTES PELO REGISTRO DA REVISÃO (SPEC 01 §8A.7)
    const request = (action: Gate['action']) => {
        if (draft && version !== saved)
            return setGate({ action, entry: draft.getSeed(localDate()), bump: false })

        void perform(action)
    }

    const finish = (choice: 'record' | 'skip' | 'cancel') => {
        setGate(null)

        if (!gate || !draft || choice === 'cancel')
            return

        change(() => draft.record(choice === 'record' ? { ...gate.entry, description: gate.entry.description.trim() } : null, gate.bump, localDate()))
        setSaved(version + 1)
        void perform(gate.action)
    }

    const title = draft?.getField('title') || library.getPart(moduleId)?.title || moduleId

    return (
        <div className="modal">
            <section className="card pe-window" role="dialog" aria-label={t('Editor de peças')}>
                <header className="pe-head">
                    <div className="pe-title">
                        <h2>{t('Editor de peças')}</h2>
                        <p className="sub">{title} · {own ? t('peça sua: gravar a substitui em Meus itens') : t('a peça original não muda; gravar cria uma peça nova em Meus itens')}{version !== saved ? ` · ${t('alterações não gravadas')}` : ''}</p>
                    </div>
                    {modelIndex && <label className="pe-check"><input type="checkbox" checked={replace} onChange={event => setReplace(event.target.checked)} />{t('Trocar a peça do sketch pela nova')}</label>}
                    <button className="icon-btn" aria-label={t('Desfazer')} title={`${t('Desfazer')} (Ctrl+Z)`} disabled={!past.length} onClick={undo}><Icon name="undo" /></button>
                    <button className="icon-btn" aria-label={t('Refazer')} title={`${t('Refazer')} (Ctrl+Y)`} disabled={!future.length} onClick={redo}><Icon name="redo" /></button>
                    <button className="btn sm" disabled={!draft} onClick={() => request('export')}>{t('Baixar .fzpz')}</button>
                    <button className="btn sm" onClick={close}>{t('Cancelar')}</button>
                    {own && <button className="btn sm" disabled={!draft || saving} onClick={() => request('copy')}>{t('Gravar como nova')}</button>}
                    <button className="btn sm primary" disabled={!draft || saving} onClick={() => request('save')}>{saving ? t('Gravando…') : t('Gravar peça')}</button>
                </header>
                <div className="pe-main">
                    <nav className="pe-tabs" role="tablist" aria-orientation="vertical" aria-label={t('Partes da peça')}>
                        {TABS.map(([id, icon, label]) => <button key={id} className="tab" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}><Icon name={icon} />{t(label)}</button>)}
                    </nav>
                    <div className="pe-content">
                        {!draft && <p className="pe-empty">{t('carregando a peça…')}</p>}
                        {draft && tab === 'metadata' && <Metadata draft={draft} change={change} />}
                        {draft && tab === 'connectors' && <Connectors draft={draft} change={change} />}
                        {draft && tab !== 'metadata' && tab !== 'connectors' && <ViewTab key={tab} draft={draft} view={tab} version={version} change={change} />}
                    </div>
                </div>
            </section>
            {gate && draft && <SaveGate gate={gate} version={draft.getField('version')} set={setGate} finish={finish} />}
        </div>
    )
}

export const PartEditor = () => {
    const editing = useStore(state => state.editing)
    return editing ? <EditorWindow key={`${editing.moduleId}/${editing.modelIndex}`} {...editing} /> : null
}
