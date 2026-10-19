import { useEffect, useState } from 'react'
import type { Found } from '../../workers/Indexer'
import { useStore } from '../Store'

export const PART_MIME = 'application/x-circuitmaster-part'

const icons = new Map<string, string>()

const bundleIcon = (entry: Found) => {
    const text = entry.root === 'bundle' ? useStore.getState().library.findBundled(entry.icon)?.text : undefined

    if (text && !icons.has(entry.icon))
        icons.set(entry.icon, URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' })))

    return icons.get(entry.icon) ?? null
}

const PartTile = ({ entry, icon, place }: { entry: Found, icon: string | null, place: (entry: Found) => void }) => (
    <button className="flex flex-col items-center gap-0.5 rounded border border-transparent p-1 hover:border-blue-400 hover:bg-blue-50" title={`${entry.title}\n${entry.family}`} draggable onDragStart={event => event.dataTransfer.setData(PART_MIME, entry.moduleId)} onDoubleClick={() => place(entry)}>
        <span className="flex h-10 w-10 items-center justify-center">
            {icon ? <img className="max-h-full max-w-full" src={icon} alt="" loading="lazy" draggable={false} /> : <span className="text-[9px] text-neutral-400">{entry.label}</span>}
        </span>
        <span className="line-clamp-2 w-full text-center text-[10px] leading-tight text-neutral-600">{entry.title}</span>
    </button>
)

export const PartsBin = () => {
    const catalog           = useStore(state => state.catalog)
    const bins              = useStore(state => state.bins)
    const indexed           = useStore(state => state.indexed)
    const ready             = useStore(state => state.ready)
    const mine              = useStore(state => state.mine)
    const imported          = useStore(state => state.imported)
    const [text, setText]   = useState('')
    const [found, setFound] = useState<Found[]>([])
    const [owned, setOwned] = useState<Found[]>([])
    const [tab, setTab]     = useState('Core')

    useEffect(() => {
        let live = true

        if (ready && text.trim())
            catalog.search(text).then(result => live && setFound(result))

        return () => {
            live = false
        }
    }, [text, catalog, ready])

    useEffect(() => {
        let live = true

        if (ready && mine.length)
            catalog.entries(mine).then(result => live && setOwned(result))

        return () => {
            live = false
        }
    }, [mine, catalog, ready])

    const place = (entry: Found) => {
        const { view, viewports, size, addPart } = useStore.getState()
        const vp = viewports[view] ?? { x: 0, y: 0, zoom: 1 }
        addPart(entry.moduleId, [vp.x + size[0] / 2 / vp.zoom, vp.y + size[1] / 2 / vp.zoom])
    }

    const tabs  = [...bins.map(bin => bin.title), 'Meus itens']
    const shown = text.trim()          ? [{ title: `${found.length} resultados`, entries: found }] :
                  tab === 'Meus itens' ? [{ title: owned.length + imported.length ? 'Meus itens' : 'Vazio: use "Adicionar ao bin" no menu da peça ou abra um .fzpz', entries: [...owned, ...imported.filter(entry => !owned.some(other => other.moduleId === entry.moduleId))] }] : bins.find(bin => bin.title === tab)?.sections ?? []

    return (
        <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-300 bg-white">
            <input className="m-2 rounded border border-neutral-300 px-2 py-1 outline-none focus:border-blue-500" placeholder="Buscar peças" value={text} onChange={event => setText(event.target.value)} />
            {!indexed.ready && <p className="px-2 pb-1 text-xs text-neutral-500">indexando acervo {indexed.done}/{indexed.total || '…'}</p>}
            <nav className="flex border-b border-neutral-200 px-1 text-xs">
                {tabs.map(name => <button key={name} className={`px-2 py-1 ${name === tab && !text.trim() ? 'border-b-2 border-emerald-600 font-semibold text-emerald-700' : 'text-neutral-500 hover:text-neutral-800'}`} onClick={() => setTab(name)}>{name}</button>)}
            </nav>
            <div className="min-h-0 flex-1 overflow-y-auto">
                {shown.map((section, i) => (
                    <section key={i}>
                        <h3 className="sticky top-0 z-10 border-y border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-semibold uppercase text-neutral-600">{section.title || tab}</h3>
                        <div className="grid grid-cols-4 gap-0.5 p-1">
                            {section.entries.map(entry => <PartTile key={`${entry.root}/${entry.path}`} entry={entry} icon={catalog.getIcon(entry) ?? bundleIcon(entry)} place={place} />)}
                        </div>
                    </section>
                ))}
            </div>
        </aside>
    )
}
