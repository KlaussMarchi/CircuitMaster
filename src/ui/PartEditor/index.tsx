import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { strToU8, zipSync } from 'fflate'
import { DRAFT_FIELDS, DRAFT_VIEWS, HISTORY_MODES, PartDraft, bumpVersion, canonicalMode, type DraftView, type HistoryEntry } from '../../core/PartDraft'
import { download } from '../Export'
import { Icon, type IconName } from '../Icon'
import { useStore } from '../Store'

type Tab   = 'metadata' | 'connectors' | DraftView
type Side  = 'center' | 'N' | 'S' | 'E' | 'W' | 'free'
type Point = [number, number]
type Gate  = { action: 'save' | 'export', entry: HistoryEntry, bump: boolean }

const TABS: [Tab, IconName, string][] = [['metadata', 'project', 'Metadados'], ['connectors', 'chip', 'Conectores'], ['breadboardView', 'breadboard', 'Protoboard'], ['schematicView', 'schematic', 'Esquemático'], ['pcbView', 'pcb', 'PCB'], ['iconView', 'note', 'Ícone']]
const LABELS: Record<typeof DRAFT_FIELDS[number], string> = { title: 'Título', label: 'Rótulo (prefixo)', author: 'Autor', version: 'Versão', date: 'Data', url: 'URL', description: 'Descrição' }
const SIDES: [Side, string][] = [['center', 'Centro'], ['N', 'Topo'], ['S', 'Base'], ['W', 'Esquerda'], ['E', 'Direita']]
const MODES: Record<string, [string, string]> = { optional: ['opcional', 'oferecida quando faz diferença'], recommended: ['recomendada', 'perguntada a cada carga'], required: ['obrigatória', 'aplicada sem perguntar'] }
const TYPES = ['male', 'female', 'pad']
const FIELD = 'w-full min-w-0 rounded-md border border-control bg-surface px-2 py-1 text-xs outline-none transition-colors focus:border-accent'
const MARK  = 500    // O RETÂNGULO DO TERMINAL TEM 1/500 DA CAIXA DO ELEMENTO (SPEC 01 §8A.4)
const STAGE = `.pe-stage svg{width:100%;height:100%;max-height:100%}.pe-stage [data-pe]:not(svg):not(g){cursor:pointer}.pe-stage [data-pe]:not(svg):not(g):hover{stroke:#2563eb!important;stroke-width:2px!important;vector-effect:non-scaling-stroke}.pe-stage .pe-pin{fill:rgba(16,185,129,.45)!important;stroke:#059669!important;stroke-width:1.5px!important;vector-effect:non-scaling-stroke}.pe-stage .pe-current{fill:rgba(37,99,235,.55)!important;stroke:#1d4ed8!important;stroke-width:2px!important;vector-effect:non-scaling-stroke}`

const prefixOf = (title: string) => title.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'peca'

const localDate = () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const Field = ({ label, children }: { label: string, children: ReactNode }) => (
    <label className="grid grid-cols-[9rem_1fr] items-start gap-3 py-1 text-xs text-soft">
        <span className="pt-1.5">{label}</span>
        {children}
    </label>
)

// TEXTO QUE SÓ GRAVA AO SAIR DO CAMPO OU COM Enter (UMA ALTERAÇÃO POR EDIÇÃO, NÃO POR TECLA)
const Text = ({ value, commit, area = false }: { value: string, commit: (text: string) => void, area?: boolean }) => {
    const [text, setText] = useState(value)

    useEffect(() => setText(value), [value])

    return area ? <textarea className={`${FIELD} h-20 resize-y`} value={text} onChange={event => setText(event.target.value)} onBlur={() => text !== value && commit(text)} /> : <input className={FIELD} value={text} onChange={event => setText(event.target.value)} onBlur={() => text !== value && commit(text)} onKeyDown={event => event.key === 'Enter' && event.currentTarget.blur()} />
}

const Metadata = ({ draft, change }: { draft: PartDraft, change: (mutate: () => void) => void }) => {
    const properties = draft.getProperties()
    const history    = draft.getHistory().reverse()
    const setRow     = (index: number, row: [string, string] | null) => change(() => draft.setProperties([...properties.slice(0, index), ...row ? [row] : [], ...properties.slice(index + 1)]))

    return (
        <div className="mx-auto max-w-3xl space-y-6 p-6">
            <section>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Identificação</h3>
                {DRAFT_FIELDS.map(name => <Field key={name} label={LABELS[name]}><Text value={draft.getField(name)} area={name === 'description'} commit={text => change(() => draft.setField(name, text))} /></Field>)}
                <Field label="Tags"><Text value={draft.getTags().join(', ')} commit={text => change(() => draft.setTags(text.split(',')))} /></Field>
            </section>
            <section>
                <header className="mb-2 flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Propriedades</h3>
                    <button className="rounded-md border border-control px-2 py-0.5 text-[11px] text-soft hover:bg-raised" onClick={() => setRow(properties.length, ['nova propriedade', ''])}>+ propriedade</button>
                </header>
                <div className="space-y-1">
                    {properties.map(([name, value], i) => (
                        <div key={`${i}-${name}`} className="grid grid-cols-[12rem_1fr_auto] items-center gap-2">
                            <Text value={name} commit={text => setRow(i, [text, value])} />
                            <Text value={value} commit={text => setRow(i, [name, text])} />
                            <button className="rounded p-1 text-muted hover:bg-raised hover:text-negative" title="Apagar" onClick={() => setRow(i, null)}><Icon name="close" className="h-3.5 w-3.5" /></button>
                        </div>
                    ))}
                </div>
            </section>
            <section>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Histórico de revisões</h3>
                {history.length ? (
                    <table className="w-full text-xs">
                        <thead className="text-left text-[11px] text-muted"><tr><th className="py-1 pr-3 font-medium">data</th><th className="pr-3 font-medium">autor</th><th className="pr-3 font-medium">modo</th><th className="font-medium">alterações</th></tr></thead>
                        <tbody>
                            {history.map((entry, i) => (
                                <tr key={i} className="border-t border-border align-top text-soft">
                                    <td className="whitespace-nowrap py-1 pr-3 font-mono text-[11px]">{entry.date || '—'}</td>
                                    <td className="pr-3">{entry.author || '—'}</td>
                                    <td className="pr-3">{MODES[canonicalMode(entry.mode)][0]}</td>
                                    <td className="whitespace-pre-wrap py-1 text-soft">{entry.description || <span className="text-muted">sem texto</span>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : <p className="text-xs text-muted">Nenhuma revisão registrada.</p>}
                <p className="mt-2 text-[11px] text-muted">Ao gravar uma peça alterada, o editor pede o registro do que mudou (elemento &lt;history&gt; do .fzp).</p>
            </section>
        </div>
    )
}

// PEDIDO DE REGISTRO DA REVISÃO ANTES DE GRAVAR UMA PEÇA ALTERADA (SPEC 01 §8A.7)
const SaveGate = ({ gate, version, set, finish }: { gate: Gate, version: string, set: (gate: Gate) => void, finish: (choice: 'record' | 'skip' | 'cancel') => void }) => {
    const entry = (patch: Partial<HistoryEntry>) => set({ ...gate, entry: { ...gate.entry, ...patch } })

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--scrim)] p-4" onKeyDown={event => event.key === 'Escape' && finish('cancel')}>
            <section className="w-full max-w-lg rounded-lg bg-surface shadow-[var(--shadow-float)] border border-border">
                <header className="border-b border-border px-5 py-4">
                    <h3 className="text-sm font-semibold text-text">Gravar peça</h3>
                    <p className="mt-1 text-xs text-warning">Você ainda não registrou o que mudou nesta revisão.</p>
                </header>
                <div className="space-y-1 px-5 py-3">
                    <Field label="Data"><input type="date" className={FIELD} value={gate.entry.date} onChange={event => entry({ date: event.target.value })} /></Field>
                    <Field label="Autor"><input className={FIELD} value={gate.entry.author} onChange={event => entry({ author: event.target.value })} /></Field>
                    <Field label="Modo">
                        <select className={FIELD} value={canonicalMode(gate.entry.mode)} onChange={event => entry({ mode: event.target.value })}>
                            {HISTORY_MODES.map(mode => <option key={mode} value={mode}>{MODES[mode][0]} — {MODES[mode][1]}</option>)}
                        </select>
                    </Field>
                    <Field label="O que mudou"><textarea autoFocus className={`${FIELD} h-24 resize-y`} value={gate.entry.description} onChange={event => entry({ description: event.target.value })} /></Field>
                    <label className="flex items-center gap-2 pt-1 text-xs text-soft"><input type="checkbox" className="accent-accent" checked={gate.bump} onChange={event => set({ ...gate, bump: event.target.checked })} />Subir a versão para {bumpVersion(version)}</label>
                </div>
                <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
                    <button className="rounded-md px-3 py-1.5 text-xs text-soft hover:bg-raised" onClick={() => finish('cancel')}>Cancelar</button>
                    <button className="rounded-md border border-control px-3 py-1.5 text-xs text-soft hover:bg-raised" onClick={() => finish('skip')}>Gravar sem registro</button>
                    <button className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-ink hover:opacity-90 disabled:opacity-40" disabled={!gate.entry.description.trim()} onClick={() => finish('record')}>Registrar e gravar</button>
                </footer>
            </section>
        </div>
    )
}

const Connectors = ({ draft, change }: { draft: PartDraft, change: (mutate: () => void) => void }) => {
    const connectors = draft.getConnectors()
    const views      = DRAFT_VIEWS.filter(view => view !== 'iconView' && draft.svgs[view])
    const missing    = Object.fromEntries(views.map(view => [view, draft.getAssignments(view).missing]))

    return (
        <div className="mx-auto max-w-4xl p-6">
            <div className="mb-4 flex items-center gap-3 text-xs text-soft">
                <span>Número de conectores</span>
                <input type="number" min={0} max={999} className={`${FIELD} w-24`} value={connectors.length} onChange={event => change(() => draft.setCount(Math.max(0, Math.min(999, Number(event.target.value) || 0))))} />
                <span className="text-muted">novos conectores ganham o próximo número livre; diminuir apaga os de maior número</span>
            </div>
            <table className="w-full text-xs">
                <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
                    <tr><th className="py-1 pr-2 font-medium">id</th><th className="pr-2 font-medium">nome</th><th className="pr-2 font-medium">descrição</th><th className="pr-2 font-medium">tipo</th><th className="font-medium">vistas</th></tr>
                </thead>
                <tbody>
                    {connectors.map(connector => (
                        <tr key={connector.id} className="border-t border-border">
                            <td className="py-1 pr-2 font-mono text-muted">{connector.id}</td>
                            <td className="w-40 pr-2"><Text value={connector.name} commit={text => change(() => draft.setConnector(connector.id, { name: text }))} /></td>
                            <td className="pr-2"><Text value={connector.description} commit={text => change(() => draft.setConnector(connector.id, { description: text }))} /></td>
                            <td className="w-24 pr-2"><select className={FIELD} value={connector.type} onChange={event => change(() => draft.setConnector(connector.id, { type: event.target.value }))}>{TYPES.map(type => <option key={type}>{type}</option>)}</select></td>
                            <td className="whitespace-nowrap">{views.map(view => <span key={view} className={`mr-1 rounded px-1.5 py-0.5 text-[10px] ${missing[view].includes(connector.id) ? 'bg-[var(--pill-bad-bg)] text-negative' : 'bg-[var(--pill-ok-bg)] text-positive'}`} title={missing[view].includes(connector.id) ? 'sem elemento nesta vista' : 'atribuído'}>{TABS.find(([id]) => id === view)?.[2]}</span>)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

// SVG DA VISTA EM LINHA (JÁ SANEADO NA CÓPIA): CLIQUE ESCOLHE O ELEMENTO, Alt+CLIQUE O GRUPO QUE O CONTÉM; ATRIBUÍDOS REALÇADOS E MARCA ARRASTÁVEL NO TERMINAL DO CONECTOR CORRENTE
const Stage = ({ text, assigned, current, terminal, pick, drop }: { text: string, assigned: Map<string, string>, current: string | null, terminal: string | null, pick: (index: string, force: boolean) => void, drop: (client: Point) => void }) => {
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

        const target = (terminal ? host.querySelector(`[id="${terminal}"]`) : null) ?? elementOf(host)
        const frame  = host.getBoundingClientRect()
        const box    = target?.getBoundingClientRect()
        setMark(box ? [box.left + box.width / 2 - frame.left, box.top + box.height / 2 - frame.top] : null)
    }, [text, assigned, current, terminal])

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
        <div className="relative h-full w-full">
            <div ref={ref} className="pe-stage h-full w-full" onClick={onClick} />
            {mark && <span className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-move touch-none rounded-full border-2 border-rose-500 bg-rose-500/20 shadow" title="Arraste para mudar o ponto terminal" style={{ left: mark[0], top: mark[1] }} onPointerDown={onMark} onPointerMove={onMark} onPointerUp={onMark} />}
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

        if (file && !draft.setSvg(view, await file.text()))
            return useStore.setState({ message: `${file.name}: SVG inválido` })

        change(() => {})
    }

    return (
        <div className="flex h-full min-h-0">
            <div className="relative min-w-0 flex-1 bg-[conic-gradient(#f5f5f5_25%,#fff_0_50%,#f5f5f5_0_75%,#fff_0)] bg-[length:16px_16px] p-8">
                {text ? <Stage text={text} assigned={assigned} current={current} terminal={pin?.terminalId || null} pick={pick} drop={drop} /> : <p className="flex h-full items-center justify-center text-sm text-muted">Esta vista não tem desenho. Carregue um SVG.</p>}
            </div>
            <aside className="flex w-72 shrink-0 flex-col border-l border-control bg-surface">
                <div className="border-b border-border p-3">
                    <button className="flex w-full items-center justify-center gap-1.5 rounded-md border border-control py-1.5 text-xs text-soft hover:bg-raised" onClick={() => fileRef.current?.click()}><Icon name="open" className="h-3.5 w-3.5" />Carregar SVG…</button>
                    <input ref={fileRef} type="file" accept=".svg,image/svg+xml" hidden onChange={onFile} />
                    {view !== 'iconView' && <p className="mt-2 text-[11px] leading-relaxed text-muted">Escolha um conector e clique no elemento do desenho que é o pino dele (Alt+clique pega o grupo). Clicar num elemento já atribuído escolhe o conector dele; Shift+clique o passa para o conector escolhido.</p>}
                </div>
                {view !== 'iconView' && (
                    <>
                        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
                            {connectors.map(connector => (
                                <li key={connector.id}>
                                    <button className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${connector.id === current ? 'bg-raised text-text' : 'text-soft hover:bg-raised'}`} onClick={() => setCurrent(connector.id)}>
                                        <span className={`h-2 w-2 shrink-0 rounded-full ${missing.includes(connector.id) ? 'bg-negative' : 'bg-positive'}`} />
                                        <span className="min-w-0 flex-1 truncate">{connector.name || connector.id}</span>
                                        <span className="font-mono text-[10px] text-muted">{connector.id}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                        {current && (
                            <div className="border-t border-border p-3 text-xs">
                                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Ponto terminal</p>
                                <div className="grid grid-cols-3 gap-1">
                                    {SIDES.map(([value, label]) => <button key={value} className={`rounded-md border px-1 py-1 text-[11px] disabled:opacity-40 ${value === side ? 'border-primary bg-primary text-primary-ink' : 'border-control text-soft hover:bg-raised'}`} disabled={missing.includes(current)} onClick={() => place(value)}>{label}</button>)}
                                </div>
                                <p className="mt-2 text-[11px] text-muted">{missing.includes(current) ? 'Atribua um elemento antes do terminal.' : side === 'center' ? 'O fio liga no centro do elemento.' : `Terminal em ${pin?.terminalId}.`} {!missing.includes(current) && 'Arraste a marca vermelha para qualquer ponto do elemento (Shift trava um eixo).'}</p>
                            </div>
                        )}
                    </>
                )}
            </aside>
        </div>
    )
}

// EDITOR DE PEÇAS: CÓPIA DE TRABALHO DA PEÇA EM ABAS, GRAVADA COMO PEÇA NOVA EM MEUS ITENS (SPEC 01 §8A)
const EditorWindow = ({ modelIndex }: { modelIndex: string }) => {
    const doc                     = useStore(state => state.doc)
    const library                 = useStore(state => state.library)
    const catalog                 = useStore(state => state.catalog)
    const [draft, setDraft]       = useState<PartDraft | null>(null)
    const [version, setVersion]   = useState(0)
    const [tab, setTab]           = useState<Tab>('metadata')
    const [replace, setReplace]   = useState(true)
    const [saving, setSaving]     = useState(false)
    const [saved, setSaved]       = useState(0)
    const [gate, setGate]         = useState<Gate | null>(null)
    const { editPart, installPart } = useStore.getState()
    const moduleId                = doc.instances[modelIndex]?.moduleIdRef ?? ''

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
                useStore.setState({ message: 'não foi possível ler a peça', editing: null })
        }

        void load()
        return () => {
            live = false
        }
    }, [library, moduleId])

    const change = (mutate: () => void) => {
        mutate()
        setVersion(value => value + 1)
    }

    const build = async () => {
        if (!draft)
            return null

        const family = draft.getProperties().find(([name]) => name.toLowerCase() === 'family')?.[1] ?? ''
        const taken  = family ? (await catalog.family(family)).map(entry => entry.properties.variant ?? '') : []
        draft.ensureVariant(taken)
        return draft.export(`${prefixOf(draft.getField('title'))}_${crypto.randomUUID().replaceAll('-', '')}_1`)
    }

    const save = async () => {
        setSaving(true)
        const files = await build()

        if (files)
            await installPart(files, replace ? modelIndex : null)

        setSaving(false)
    }

    const exportFile = async () => {
        const files = await build()

        if (files)
            download(`${files[0].name.slice('part.'.length, -'.fzp'.length)}.fzpz`, zipSync(Object.fromEntries(files.map(file => [file.name, strToU8(file.text)]))), 'application/zip')
    }

    const perform = (action: Gate['action']) => action === 'save' ? save() : exportFile()

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4">
            <style>{STAGE}</style>
            <section className="flex h-full max-h-[56rem] w-full max-w-7xl flex-col overflow-hidden rounded-lg bg-surface shadow-[var(--shadow-float)] border border-border">
                <header className="flex h-14 shrink-0 items-center gap-3 border-b border-control px-5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-ink"><Icon name="chip" className="h-5 w-5" /></span>
                    <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold text-text">Editor de peças</h2>
                        <p className="truncate text-[11px] text-muted">{title} · a peça original não muda; gravar cria uma peça nova em Meus itens{version !== saved ? ' · alterações não gravadas' : ''}</p>
                    </div>
                    <label className="ml-auto flex items-center gap-2 text-xs text-soft"><input type="checkbox" className="accent-accent" checked={replace} onChange={event => setReplace(event.target.checked)} />Trocar a peça do sketch pela nova</label>
                    <button className="rounded-md border border-control px-3 py-1.5 text-xs text-soft hover:bg-raised disabled:opacity-40" disabled={!draft} onClick={() => request('export')}>Baixar .fzpz</button>
                    <button className="rounded-md px-3 py-1.5 text-xs text-soft hover:bg-raised" onClick={() => editPart(null)}>Cancelar</button>
                    <button className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-ink hover:opacity-90 disabled:opacity-40" disabled={!draft || saving} onClick={() => request('save')}>{saving ? 'Gravando…' : 'Gravar peça'}</button>
                </header>
                <div className="flex min-h-0 flex-1">
                    <nav className="flex w-44 shrink-0 flex-col gap-1 border-r border-border bg-ground p-2">
                        {TABS.map(([id, icon, label]) => (
                            <button key={id} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ${tab === id ? 'bg-surface font-semibold text-text' : 'text-soft hover:bg-raised'}`} onClick={() => setTab(id)}>
                                <Icon name={icon} className="h-4 w-4" />{label}
                            </button>
                        ))}
                    </nav>
                    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                        {!draft && <p className="flex h-full items-center justify-center text-sm text-muted">carregando a peça…</p>}
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
    return editing ? <EditorWindow key={editing} modelIndex={editing} /> : null
}
