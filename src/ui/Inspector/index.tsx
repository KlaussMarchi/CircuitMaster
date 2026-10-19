import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { splitKey } from '../../core/Document'
import { VIEW_LABELS } from '../../core/Layer'
import { formatSi, getPropertyDefs, parseSi } from '../../core/Properties'
import { Scene } from '../../engine/Scene'
import { setProperty, setTitle } from '../../engine/Edit'
import type { Found } from '../../workers/Indexer'
import { pickSwap } from '../Catalog'
import { useStore } from '../Store'

const FIELD  = 'w-full min-w-0 rounded border border-neutral-300 bg-white px-1 py-0.5 text-xs outline-none focus:border-blue-500'
const HIDDEN = new Set(['family', 'sticky', 'mn', 'mpn', 'part number'])

const Rows = ({ title, rows }: { title: string, rows: [string, string][] }) => (
    <section className="border-b border-neutral-200 px-3 py-2">
        <h3 className="mb-1 text-[11px] font-semibold uppercase text-neutral-500">{title}</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
            {rows.filter(([, value]) => value).map(([key, value]) => [<dt key={`${key}-k`} className="text-neutral-500">{key}</dt>, <dd key={`${key}-v`} className="break-all">{value}</dd>])}
        </dl>
    </section>
)

// CAMPO QUE SÓ GRAVA AO CONFIRMAR (Enter OU SAIR DO CAMPO); Escape DESFAZ A DIGITAÇÃO
const Field = ({ value, options, commit }: { value: string, options: string[], commit: (text: string) => void }) => {
    const [text, setText] = useState(value)
    const list            = useId()

    useEffect(() => setText(value), [value])

    const onBlur = () => {
        if (text !== value)
            commit(text)
    }

    const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter')
            event.currentTarget.blur()

        if (event.key === 'Escape')
            setText(value)
    }

    return (
        <>
            <input className={FIELD} value={text} list={options.length ? list : undefined} onChange={event => setText(event.target.value)} onBlur={onBlur} onKeyDown={onKey} />
            {options.length > 0 && <datalist id={list}>{options.map(option => <option key={option} value={option} />)}</datalist>}
        </>
    )
}

const PartEditor = ({ modelIndex }: { modelIndex: string }) => {
    const doc                 = useStore(state => state.doc)
    const library             = useStore(state => state.library)
    const catalog             = useStore(state => state.catalog)
    const [family, setFamily] = useState<Found[]>([])
    const { edit, swap }      = useStore.getState()
    const instance            = doc.instances[modelIndex]
    const part                = library.getPart(instance?.moduleIdRef ?? '')
    const name                = part?.properties.family ?? ''

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
    const keys   = [...new Set([...Object.keys(merged), ...defs.map(item => item.name)])].filter(key => !HIDDEN.has(key) && (merged[key] || defs.some(item => item.name === key)))

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

    const editor = (key: string) => {
        const values = [...new Set(family.map(entry => entry.properties[key]).filter(Boolean))].sort()
        const def    = defs.find(item => item.name === key)

        if (values.length > 1 && !def?.editable)
            return (
                <select className={FIELD} value={merged[key] ?? ''} onChange={event => swapTo(key, event.target.value)}>
                    {[...new Set([merged[key] ?? '', ...values])].map(value => <option key={value} value={value}>{value}</option>)}
                </select>
            )

        if (def)
            return <Field value={merged[key] ?? def.value} options={def.values.map(value => def.numeric ? formatSi(Number(value), def.symbol) : value)} commit={text => commitValue(key, text)} />

        return <span className="break-all">{merged[key]}</span>
    }

    return (
        <section className="border-b border-neutral-200 px-3 py-2">
            <h3 className="mb-1 text-[11px] font-semibold uppercase text-neutral-500">Peça</h3>
            <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 text-xs">
                <span className="text-neutral-500">título</span>
                <Field value={instance.title} options={[]} commit={text => edit(current => setTitle(current, modelIndex, text.trim() || instance.title))} />
                <span className="text-neutral-500">peça</span><span>{part.title}</span>
                <span className="text-neutral-500">família</span><span>{name}</span>
                {keys.map(key => [<span key={`${key}-k`} className="text-neutral-500">{key}</span>, <div key={`${key}-v`}>{editor(key)}</div>])}
                <span className="text-neutral-500">moduleId</span><span className="break-all text-neutral-400">{part.moduleId}</span>
            </div>
        </section>
    )
}

export const Inspector = () => {
    const doc       = useStore(state => state.doc)
    const library   = useStore(state => state.library)
    const netlist   = useStore(state => state.netlist)
    const selection = useStore(state => state.selection)
    const hover     = useStore(state => state.hover)
    const view      = useStore(state => state.view)
    const name      = useStore(state => state.name)

    const instances = Object.values(doc.instances)
    const wires     = instances.filter(instance => instance.moduleIdRef === 'WireModuleID').length
    const chosen    = selection.length === 1 ? selection[0] : null
    const owner     = hover ? doc.instances[splitKey(hover)[0]] : undefined
    const connector = hover ? new Scene(doc, library, view).getConnector(hover) : undefined
    const net       = hover && netlist ? netlist.getNet(view, hover) : []

    const documentRows: [string, string][]  = [['arquivo', name], ['peças', String(instances.length - wires)], ['fios', String(wires)], ['conexões', String(doc.edges.length)], ['selecionados', selection.length > 1 ? String(selection.length) : ''], ['Fritzing', doc.fritzingVersion]]
    const connectorRows: [string, string][] = connector && owner ? [['peça', owner.title], ['nome', connector.name], ['id', connector.id], ['tipo', connector.type], ['descrição', connector.description], [`net (${VIEW_LABELS[view]})`, `${net.length} conectores`]] : []

    return (
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-neutral-300 bg-white">
            <Rows title="Documento" rows={documentRows} />
            {chosen && <PartEditor key={chosen} modelIndex={chosen} />}
            {connectorRows.length > 0 && <Rows title="Conector" rows={connectorRows} />}
        </aside>
    )
}
