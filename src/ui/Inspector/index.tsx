import { lazy, Suspense, useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'
import { keyOf, splitKey } from '../../core/Document'
import { formatReading, formatSi, getPropertyDefs, nameOf, parseSi } from '../../core/Properties'
import { getNets, getSwitching, switchOf } from '../../core/Spice'
import { Scene } from '../../engine/Scene'
import { familyOf } from '../../engine/Simulation'
import { setLogoText, setProperty, setTitle } from '../../engine/Edit'
import { isResizableBoard } from '../../core/Generator'
import type { Part } from '../../core/Part'
import type { Found } from '../../workers/Indexer'
import { pickSwap } from '../Catalog'
import { Icon } from '../Icon'
import { probeColor } from '../Probe'
import { useStore } from '../Store'

// CARTÃO DIDÁTICO SÓ CARREGA COM A PRIMEIRA PEÇA SELECIONADA: OS TEXTOS FICAM FORA DO JAVASCRIPT INICIAL
const LessonCard = lazy(() => import('../Lesson').then(module => ({ default: module.LessonCard })))

const HIDDEN = new Set(['family', 'sticky', 'mn', 'mpn', 'part number', 'shape', 'svg', 'lastfilename', 'switch status'])

const PADS     = /(Copper0)?PadModuleID$/
const SIZED    = (part: Part) => part.kind === 'logo' || part.kind === 'blocker' || isResizableBoard(part.moduleId) || PADS.test(part.moduleId)
const DRILLS: Record<string, string[]> = { via: ['0.4mm,0.3mm', '0.9mm,0.508mm'], hole: ['2.2mm,0.0mm', '3.2mm,0.0mm', '4.2mm,0.0mm'], part: ['0.7mm,0.508mm', '1.0mm,0.508mm', '1.1mm,0.508mm', '1.5mm,0.508mm'] }

// PROPRIEDADES DE TEXTO LIVRE QUE O FRITZING EDITA NO INSPETOR, POR TIPO DE PEÇA, COM AS SUGESTÕES (SPEC 01 §8.9–§8.11)
const FREE: [string, (part: Part) => boolean, (part: Part) => string[]][] = [
    ['logo', part => part.kind === 'logo' && part.moduleId.endsWith('TextModuleID'), () => []],
    ['width', SIZED, () => []],
    ['height', SIZED, () => []],
    ['label', part => part.moduleId.endsWith('NetLabelModuleID'), () => []],
    ['chip label', part => 'chip label' in part.properties, () => []],
    ['connect', part => PADS.test(part.moduleId), () => ['center', 'north', 'south', 'east', 'west']],
    ['hole size', part => 'hole size' in part.properties || part.kind === 'via' || part.kind === 'hole', part => DRILLS[part.kind] ?? DRILLS.part]
]

export const Kv = ({ label, value }: { label: string, value: string }) => <div className="kv"><span>{label}</span><span className="num" title={value}>{value}</span></div>

// CAMPO QUE SÓ GRAVA AO CONFIRMAR (Enter OU SAIR DO CAMPO); Escape DESFAZ A DIGITAÇÃO
export const Entry = ({ value, options, numeric, commit }: { value: string, options: string[], numeric: boolean, commit: (text: string) => void }) => {
    const [text, setText] = useState(value)
    const list            = useId()

    useEffect(() => setText(value), [value])

    const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter')
            event.currentTarget.blur()

        if (event.key === 'Escape')
            setText(value)
    }

    return (
        <div className="in">
            <input className={numeric ? '' : 'text'} value={text} list={options.length ? list : undefined} onChange={event => setText(event.target.value)} onBlur={() => text !== value && commit(text)} onKeyDown={onKey} />
            {options.length > 0 && <datalist id={list}>{options.map(option => <option key={option} value={option} />)}</datalist>}
        </div>
    )
}

const TIME_UNITS: [string, number][] = [['s', 1], ['ms', 1e-3], ['µs', 1e-6], ['ns', 1e-9]]

const unitFor = (seconds: number, units: [string, number][]) => units.find(([, scale]) => Math.abs(seconds) >= scale * (1 - 1e-9)) ?? units[units.length - 1]

// TEMPO COM A UNIDADE À ESCOLHA: O NÚMERO GRAVA AO CONFIRMAR (Enter OU SAIR DO CAMPO) E TROCAR A UNIDADE MANTÉM O NÚMERO; Escape DESFAZ
export const TimeField = ({ value, commit, units = TIME_UNITS, label }: { value: number | null, commit: (seconds: number) => void, units?: [string, number][], label: string }) => {
    const [unit, setUnit] = useState(() => unitFor(value || 1e-3, units)[0])
    const [text, setText] = useState('')
    const scale           = (name: string) => units.find(([item]) => item === name)?.[1] ?? 1

    useEffect(() => {
        const [name, factor] = value ? unitFor(value, units) : [unit, scale(unit)]
        setUnit(name)
        setText(value === null ? '' : String(+(value / factor).toPrecision(4)))
    }, [value])

    const send = (raw: string, name: string) => {
        const number = Number(raw.replace(',', '.'))

        if (raw.trim() && Number.isFinite(number) && number >= 0 && Math.abs(number * scale(name) - (value ?? NaN)) > 1e-15)
            commit(number * scale(name))
    }

    const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter')
            event.currentTarget.blur()

        if (event.key === 'Escape')
            setText(value === null ? '' : String(+(value / scale(unit)).toPrecision(4)))
    }

    return (
        <div className="in time">
            <input inputMode="decimal" aria-label={label} value={text} placeholder="auto" onChange={event => setText(event.target.value)} onBlur={() => send(text, unit)} onKeyDown={onKey} />
            <select aria-label={`Unidade de ${label.toLowerCase()}`} value={unit} onChange={event => { setUnit(event.target.value); send(text, event.target.value) }}>{units.map(([name]) => <option key={name} value={name}>{name}</option>)}</select>
        </div>
    )
}

// MEDIÇÃO DA PEÇA NO PASSO MOSTRADO: TENSÃO ENTRE OS DOIS PINOS, CORRENTE, POTÊNCIA E, NO RESISTOR, V = R·I E A DISSIPAÇÃO FRENTE À POTÊNCIA NOMINAL
const Reading = ({ modelIndex }: { modelIndex: string }) => {
    const simulation = useStore(state => state.simulation)
    const result     = simulation.enabled ? simulation.result : null
    const part       = result?.getPart(modelIndex)
    const step       = result ? Math.min(simulation.step, result.steps - 1) : 0
    const reading    = result?.getReading(modelIndex, step)

    if (!result || !part || !reading)
        return null

    const { voltage, current } = reading
    const [a, b]   = part.connectors.map(connector => keyOf(modelIndex, connector.id))
    const power    = Math.abs(voltage * current)
    const family   = familyOf(part)
    const resistor = family === 'resistor'
    const rating   = resistor ? result.getMax(modelIndex, 'power') : Infinity
    const peak     = resistor ? Math.max(...Array.from({ length: result.steps }, (_, i) => Math.abs(result.getBetween(a, b, i) * result.getCurrent(modelIndex, i)))) : 0
    const share    = Number.isFinite(rating) && rating > 0 ? peak / rating : null
    const title    = result.circuit.analysis.type === 'tran' ? `Medição em t = ${formatSi(result.getTime(step), 's', 3)}` : 'Ponto de operação (DC)'
    const ohms     = parseSi(result.doc.instances[modelIndex]?.properties.resistance ?? part.properties.resistance ?? '', 'Ω')

    return (
        <>
            <div className="sec">
                <h3>{title}</h3>
                <Kv label="Tensão" value={formatReading(voltage, 'V')} />
                <Kv label="Corrente" value={current ? formatReading(current, 'A') : '—'} />
                <Kv label="Potência" value={current ? formatReading(power, 'W') : '—'} />
                {resistor && ohms !== null && current !== 0 && <Kv label="V = R·I" value={`${formatReading(voltage, 'V')} = ${formatSi(ohms, 'Ω')} × ${formatReading(current, 'A')}`} />}
            </div>
            {share !== null && (
                <div className="sec">
                    <h3>Dissipação</h3>
                    <Kv label="Pico na janela" value={formatReading(peak, 'W')} />
                    <div className={`meter ${share > 1 ? 'over' : ''}`}><i style={{ width: `${Math.min(100, share * 100)}%` }} /></div>
                    <div className="meter-l"><span>{Math.round(share * 100)}% do limite no pico</span><span>limite {formatReading(rating, 'W')}</span></div>
                </div>
            )}
        </>
    )
}

export const switchText = (pressed: boolean, spdt: boolean) => spdt ? (pressed ? 'Posição 2' : 'Posição 1') : pressed ? 'Fechado' : 'Aberto'

// CHAVE: A POSIÇÃO (VALE NO DC E NO INÍCIO DO TRANSITÓRIO) E AS COMUTAÇÕES PROGRAMADAS NO TEMPO (SPEC 04 §8.10)
const SwitchEditor = ({ modelIndex }: { modelIndex: string }) => {
    const doc      = useStore(state => state.doc)
    const library  = useStore(state => state.library)
    const analysis = useStore(state => state.simulation.result?.circuit.analysis)
    const known    = switchOf(library.getPart(doc.instances[modelIndex]?.moduleIdRef ?? ''))
    const events   = getSwitching(doc)[modelIndex]?.events ?? []
    const { toggleSwitch, setSwitching } = useStore.getState()

    if (!known)
        return null

    const span   = analysis?.type === 'tran' ? analysis.t1 - analysis.t0 : 0.1
    const verbs  = known.spdt ? ['Ir para 1', 'Ir para 2'] : ['Abrir', 'Fechar']
    const change = (index: number, event: [number, boolean]) => void setSwitching(modelIndex, events.map((item, i) => i === index ? event : item))
    const last   = events[events.length - 1]
    const next: [number, boolean] = last ? [+(last[0] + span * 0.3).toPrecision(3), !last[1]] : [+(span * 0.1).toPrecision(3), !known.pressed]

    return (
        <div className="sec">
            <h3>Chave</h3>
            <div className="field">
                <label>Posição</label>
                <div className="seg tabs" role="tablist">{[false, true].map(pressed => <button key={String(pressed)} className="tab" role="tab" aria-selected={known.pressed === pressed} onClick={() => known.pressed !== pressed && void toggleSwitch(modelIndex)}>{switchText(pressed, known.spdt)}</button>)}</div>
            </div>
            <h3 style={{ marginTop: 10 }}>Comutação no tempo</h3>
            {events.map(([time, pressed], i) => (
                <div key={i} className="event">
                    <div className="in"><select aria-label="Ação" value={pressed ? '1' : '0'} onChange={event => change(i, [time, event.target.value === '1'])}>{verbs.map((verb, k) => <option key={verb} value={String(k)}>{verb}</option>)}</select><Icon name="chevronDown" /></div>
                    <span>em</span>
                    <TimeField label="Instante da comutação" value={time} commit={seconds => change(i, [seconds, pressed])} />
                    <button className="icon-btn" aria-label="Remover comutação" title="Remover" onClick={() => void setSwitching(modelIndex, events.filter((_, k) => k !== i))}><Icon name="close" /></button>
                </div>
            ))}
            <button className="btn sm" style={{ marginTop: 6 }} onClick={() => void setSwitching(modelIndex, [...events, next])}><Icon name="plus" />{events.length ? 'Adicionar comutação' : 'Programar comutação'}</button>
            <p className="sub" style={{ marginTop: 6 }}>{events.length ? 'No transitório a chave muda nesses instantes; antes do primeiro e no DC vale a posição acima.' : 'Escolha quando a chave fecha e abre para ver a resposta no transitório, como a carga e a descarga de um capacitor.'}</p>
        </div>
    )
}

const METER_MODES: [string, string, string][] = [['V', 'Voltmeter', 'V'], ['A', 'Ammeter', 'A'], ['Ω', 'Ohmmeter', 'Ω']]

// MULTÍMETRO: VISOR COM A LEITURA DO PASSO MOSTRADO E A TROCA DE FUNÇÃO (V, A, Ω) E DE ACOPLAMENTO (DC, AC) PELAS VARIANTES DO ACERVO (SPEC 04 §8.6)
const Meter = ({ modelIndex, variants }: { modelIndex: string, variants: Found[] }) => {
    const simulation = useStore(state => state.simulation)
    const instance   = useStore(state => state.doc.instances[modelIndex])
    const part       = useStore(state => state.library.getPart(instance?.moduleIdRef ?? ''))
    const result     = simulation.enabled ? simulation.result : null
    const variant    = part?.properties.variant ?? ''
    const ac         = variant.toLowerCase().includes('(ac)')
    const unit       = METER_MODES.find(([, prefix]) => variant.startsWith(prefix))?.[2] ?? ''
    const reading    = result?.circuit.simulated.includes(modelIndex) ? result.getEffect(modelIndex, Math.min(simulation.step, result.steps - 1)).display?.[0] ?? '' : ''

    const choose = (prefix: string, coupling: boolean) => {
        const name   = prefix === 'Ohmmeter' ? 'Ohmmeter' : `${prefix} (${coupling ? 'AC' : 'DC'})`
        const target = variants.find(entry => entry.properties.variant === name)

        if (target && target.moduleId !== instance?.moduleIdRef)
            void useStore.getState().swap(modelIndex, target.moduleId)
    }

    return (
        <div className="sec">
            <h3>Visor</h3>
            <div className="lcd num">{reading.trim() ? reading : '-----'}<small>{unit}</small></div>
            <div className="runrow" style={{ marginTop: 8, justifyContent: 'space-between' }}>
                <div className="seg tabs" role="tablist">{METER_MODES.map(([label, prefix]) => <button key={label} className="tab" role="tab" aria-selected={variant.startsWith(prefix)} onClick={() => choose(prefix, ac)}>{label}</button>)}</div>
                <div className="seg tabs" role="tablist">{[false, true].map(coupling => <button key={String(coupling)} className="tab" role="tab" disabled={unit === 'Ω'} aria-selected={unit !== 'Ω' && ac === coupling} onClick={() => choose(variant.startsWith('Ammeter') ? 'Ammeter' : 'Voltmeter', coupling)}>{coupling ? 'AC' : 'DC'}</button>)}</div>
            </div>
        </div>
    )
}

const PartEditor = ({ modelIndex }: { modelIndex: string }) => {
    const doc                 = useStore(state => state.doc)
    const library             = useStore(state => state.library)
    const catalog             = useStore(state => state.catalog)
    const netlist             = useStore(state => state.netlist)
    const [family, setFamily] = useState<Found[]>([])
    const { edit, swap }      = useStore.getState()
    const instance            = doc.instances[modelIndex]
    const part                = library.getPart(instance?.moduleIdRef ?? '')
    const name                = part?.properties.family ?? ''
    const icon                = part ? catalog.getIcon({ root: 'parts', path: '', moduleId: part.moduleId, title: part.title, family: name, label: part.label, kind: part.kind, icon: part.views.iconView?.image ?? part.views.breadboardView?.image ?? '', obsolete: false, properties: part.properties }) : null
    const nets                = useMemo(() => netlist ? getNets(netlist.doc, library, netlist) : [], [library, netlist])
    const netIndex            = useMemo(() => new Map(nets.flatMap((net, i) => net.map(key => [key, i] as const))), [nets])

    useEffect(() => {
        let live = true

        if (name)
            catalog.family(name).then(found => live && setFamily(found))

        return () => {
            live = false
        }
    }, [catalog, name])

    if (!instance || !part)
        return null

    const merged = { ...part.properties, ...instance.properties }
    const defs   = getPropertyDefs(part.moduleId)
    const free   = FREE.filter(([, accepts]) => accepts(part))
    const keys   = [...new Set([...Object.keys(merged), ...free.map(([key]) => key)])].filter(key => !HIDDEN.has(key) && (merged[key] || defs.some(item => item.name === key) || free.some(([item]) => item === key)))
    const netOf  = (key: string) => {
        const index = netIndex.get(key) ?? -1
        const others = index >= 0 ? nets[index].filter(other => other !== key && splitKey(other)[0] !== modelIndex) : []
        const peers  = others.slice(0, 2).map(other => `${doc.instances[splitKey(other)[0]]?.title}.${library.getPart(doc.instances[splitKey(other)[0]]?.moduleIdRef ?? '')?.connectors.find(connector => connector.id === splitKey(other)[1])?.name ?? ''}`)
        return index < 0 || nets[index].length < 2 ? 'sem conexão' : `${index === 0 ? 'GND' : `N${index}`}${peers.length ? ` · ${peers.join(' · ')}${others.length > 2 ? '…' : ''}` : ''}`
    }

    const commitValue = (key: string, text: string) => {
        const def    = defs.find(item => item.name === key)
        const number = def?.numeric ? parseSi(text, def.symbol) : null

        if (def?.numeric && (number === null || (def.min !== null && number < def.min) || (def.max !== null && number > def.max)))
            return useStore.setState({ message: `${key}: valor fora da faixa ${def.min ?? '-∞'}…${def.max ?? '∞'} ${def.symbol}` })

        edit(current => setProperty(current, modelIndex, key, number !== null && def ? formatSi(number, def.symbol) : text))
    }

    const swapTo = (key: string, value: string) => {
        const target = pickSwap(family, part.properties, key, value)

        if (target)
            void swap(modelIndex, target.moduleId)
    }

    const commitFree = (key: string, text: string) => {
        if ((key === 'width' || key === 'height') && !(Number(text.replace(',', '.')) > 0))
            return useStore.setState({ message: `${key}: informe uma medida positiva em mm` })

        if (key === 'logo')
            return edit(current => setLogoText(current, library, useStore.getState().view, modelIndex, text))

        edit(current => setProperty(current, modelIndex, key, key === 'width' || key === 'height' ? text.replace(',', '.') : text))
    }

    const editor = (key: string) => {
        const values = [...new Set(family.map(entry => entry.properties[key]).filter(Boolean))].sort()
        const def    = defs.find(item => item.name === key)
        const loose  = free.find(([item]) => item === key)

        if (loose)
            return <Entry value={merged[key] ?? ''} options={loose[2](part)} numeric={false} commit={text => commitFree(key, text.trim())} />

        if (values.length > 1 && !def?.editable)
            return (
                <div className="in">
                    <select value={merged[key] ?? ''} onChange={event => swapTo(key, event.target.value)}>
                        {[...new Set([merged[key] ?? '', ...values])].map(value => <option key={value} value={value}>{value}</option>)}
                    </select>
                </div>
            )

        if (def)
            return <Entry value={merged[key] ?? def.value} options={def.values.map(value => def.numeric ? formatSi(Number(value), def.symbol) : value)} numeric={def.numeric} commit={text => commitValue(key, text)} />

        return <span className="num" style={{ textAlign: 'right', overflowWrap: 'anywhere' }}>{merged[key]}</span>
    }

    return (
        <>
            <div className="ph">
                {icon && <img src={icon} alt="" />}
                <h2>{instance.title}</h2>
                <span className="pill neutral" title={name}>{part.title}</span>
            </div>
            <p className="sub">{[merged.package, `${part.connectors.length} ${part.connectors.length === 1 ? 'pino' : 'pinos'}`].filter(Boolean).join(' · ')}</p>
            <div className="sec">
                <h3>Valores</h3>
                <div className="field"><label>Nome</label><Entry value={instance.title} options={[]} numeric={false} commit={text => edit(current => setTitle(current, modelIndex, text.trim() || instance.title))} /></div>
                {keys.map(key => <div key={key} className="field"><label title={key}>{nameOf(key)}</label>{editor(key)}</div>)}
            </div>
            {familyOf(part) === 'multimeter' && <Meter modelIndex={modelIndex} variants={family} />}
            <SwitchEditor modelIndex={modelIndex} />
            <Reading modelIndex={modelIndex} />
            <Suspense fallback={null}><LessonCard modelIndex={modelIndex} part={part} properties={merged} /></Suspense>
            {part.connectors.length > 0 && part.connectors.length <= 16 && (
                <details className="sec">
                    <summary><h3>Pinos</h3></summary>
                    {part.connectors.map(connector => <Kv key={connector.id} label={connector.name} value={netOf(keyOf(modelIndex, connector.id))} />)}
                </details>
            )}
            <p className="sub" style={{ marginTop: 18, overflowWrap: 'anywhere' }}>{part.moduleId}</p>
        </>
    )
}

const PROBE_KINDS: Record<string, string> = { voltage: 'Ponta de tensão', current: 'Ponta de corrente', both: 'Tensão e corrente' }

// PONTA DE PROVA ESCOLHIDA: ONDE MEDE, A LEITURA DO PASSO MOSTRADO, O GRÁFICO E A REMOÇÃO
const ProbeCard = ({ id }: { id: string }) => {
    const doc        = useStore(state => state.doc)
    const simulation = useStore(state => state.simulation)
    const index      = doc.probes.findIndex(probe => probe.id === id)
    const probe      = doc.probes[index]
    const result     = simulation.enabled ? simulation.result : null
    const reading    = result && probe ? result.getProbe(probe.id) : null
    const at         = (series: ArrayLike<number> | null | undefined) => series ? series[Math.min(simulation.step, series.length - 1)] ?? 0 : null
    const owner      = probe ? doc.instances[splitKey(probe.key)[0]] : undefined
    const { removeProbes, setSimulation, setShow } = useStore.getState()

    if (!probe)
        return null

    return (
        <>
            <div className="ph"><span className="dot-s" style={{ background: probeColor(index) }} /><h2>{probe.id}</h2><span className="pill neutral">{PROBE_KINDS[probe.kind]}</span></div>
            <p className="sub">{owner?.moduleIdRef === 'WireModuleID' ? 'num fio' : `em ${owner?.title ?? '—'}`}</p>
            <div className="sec">
                <h3>Leitura</h3>
                {probe.kind !== 'current' && <Kv label="Tensão" value={at(reading?.voltage) === null ? 'aperte Simular' : formatReading(at(reading?.voltage) ?? 0, 'V')} />}
                {probe.kind !== 'voltage' && <Kv label="Corrente" value={at(reading?.current) === null ? 'aperte Simular' : formatReading(at(reading?.current) ?? 0, 'A')} />}
            </div>
            <div className="runrow">
                <button className="btn sm" onClick={() => { setSimulation({ focus: `p:${probe.id}:${probe.kind === 'current' ? 'i' : 'v'}` }); setShow({ chart: true }) }}>Ver medidas</button>
                <button className="btn sm stop" onClick={() => removeProbes([probe.id])}>Remover</button>
            </div>
        </>
    )
}

// ABA DE PROPRIEDADES: A PEÇA SELECIONADA, O FIO, A SELEÇÃO MÚLTIPLA OU O CONECTOR SOB O CURSOR; SEM SELEÇÃO, COMO USAR
export const Inspector = () => {
    const doc       = useStore(state => state.doc)
    const library   = useStore(state => state.library)
    const netlist   = useStore(state => state.netlist)
    const selection = useStore(state => state.selection)
    const hover     = useStore(state => state.hover)
    const view      = useStore(state => state.view)
    const probe     = useStore(state => state.probe)

    const chosen    = selection.length === 1 && doc.instances[selection[0]]?.moduleIdRef !== 'WireModuleID' ? selection[0] : null
    const wire      = selection.length === 1 && doc.instances[selection[0]]?.moduleIdRef === 'WireModuleID' ? doc.instances[selection[0]] : null
    const owner     = hover ? doc.instances[splitKey(hover)[0]] : undefined
    const connector = hover ? new Scene(doc, library, view).getConnector(hover) : undefined
    const net       = hover && netlist ? netlist.getNet(view, hover) : []

    if (chosen)
        return <PartEditor key={chosen} modelIndex={chosen} />

    if (probe && !selection.length)
        return <ProbeCard id={probe} />

    return (
        <>
            {wire && <><div className="ph"><h2>{wire.title}</h2><span className="pill neutral">Fio</span></div><div className="sec"><Kv label="Cor" value={wire.views[view]?.wire?.color ?? '—'} /><Kv label="Largura" value={`${(wire.views[view]?.wire?.mils ?? 0).toFixed(1)} mil`} /></div></>}
            {selection.length > 1 && <div className="nopart"><b>{selection.length} itens selecionados</b>Arraste para mover juntos; Delete apaga todos.</div>}
            {!selection.length && (
                <div className="nopart">
                    <b>Nada selecionado</b>
                    Clique numa peça para editar os valores e ver a medição ao vivo durante a simulação.
                    <ul className="tips">
                        <li><b>Fio:</b> clique num terminal, clique para cada dobra e clique no terminal de destino. Botão direito deixa a ponta solta.</li>
                        <li><b>Mover a vista:</b> arraste o fundo; a roda do mouse dá zoom.</li>
                        <li><b>Selecionar várias:</b> Shift + arrastar no fundo.</li>
                        <li><b>Medir:</b> escolha V, A ou V·A na barra e clique num fio ou terminal.</li>
                    </ul>
                </div>
            )}
            {connector && owner && (
                <div className="sec" style={{ marginTop: 18 }}>
                    <h3>Conector sob o cursor</h3>
                    <Kv label="Peça" value={owner.title} />
                    <Kv label="Nome" value={connector.name} />
                    <Kv label="Tipo" value={connector.type} />
                    {connector.description && <Kv label="Descrição" value={connector.description} />}
                    <Kv label="Net" value={`${net.length} conectores`} />
                </div>
            )}
        </>
    )
}
