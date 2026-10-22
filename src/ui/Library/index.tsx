import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { FEATURED, FEATURED_GROUPS, type Featured } from '../../core/Featured'
import { GENERATED_ROOT, generateSvg } from '../../core/Generator'
import type { Found } from '../../workers/Indexer'
import { Icon } from '../Icon'
import { promptBin } from '../Menus'
import { useStore } from '../Store'
import { t } from '../../core/Text'

export const PART_MIME = 'application/x-circuitmaster-part'

type Tab = 'core' | 'sim' | 'mine'

const TABS: [Tab, string][] = [['core', 'Core'], ['sim', 'Simulador'], ['mine', 'Meus itens']]
const MINE = 'Meus itens'

const icons = new Map<string, string>()

// ÍCONE DE PEÇA SEM ARQUIVO NO ACERVO: DE PACOTE OU GERADA (DIP, BARRA DE PINOS…)
const ownIcon = (entry: Found) => {
    const text = entry.root === 'bundle' ? useStore.getState().library.findBundled(entry.icon)?.text : entry.root === GENERATED_ROOT ? generateSvg(entry.icon) : undefined

    if (text && !icons.has(entry.icon))
        icons.set(entry.icon, URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' })))

    return icons.get(entry.icon) ?? null
}

const iconOf = (entry: Found) => useStore.getState().catalog.getIcon(entry) ?? ownIcon(entry)

const Glyph = ({ item }: { item: Featured }) => (
    <svg viewBox="0 0 64 64" aria-hidden>
        <path d={item.glyph} />
        {item.text && <text x="32" y="36" textAnchor="middle" fontSize="13" stroke="none" fill="currentColor" fontFamily="var(--font)">{item.text}</text>}
    </svg>
)

// PEÇA NO CENTRO DA VISTA (DUPLO CLIQUE NA BIBLIOTECA)
const placeCentered = (moduleId: string) => {
    const { view, viewports, size, addPart, setPlacing } = useStore.getState()
    const vp = viewports[view] ?? { x: 0, y: 0, zoom: 1 }
    setPlacing(null)
    void addPart(moduleId, [vp.x + size[0] / 2 / vp.zoom, vp.y + size[1] / 2 / vp.zoom])
}

// CLIQUE ESCOLHE A PEÇA PARA POSICIONAR NO QUADRO; ARRASTAR SOLTA ONDE CAIR; DUPLO CLIQUE PÕE NO CENTRO
const usePick = (moduleId: string) => {
    const placing = useStore(state => state.placing)
    return {
        'aria-pressed': placing === moduleId,
        draggable: true,
        onDragStart: (event: DragEvent) => event.dataTransfer.setData(PART_MIME, moduleId),
        onClick: () => {
            useStore.getState().setPlacing(placing === moduleId ? null : moduleId)
            document.querySelector<HTMLElement>('.canvas')?.focus()    // O FOCO VAI AO QUADRO: SETAS E Enter POSICIONAM PELO TECLADO
        },
        onDoubleClick: () => placeCentered(moduleId)
    }
}

const FeaturedTile = ({ item }: { item: Featured }) => {
    const pick = usePick(item.moduleId)
    return (
        <button className="part" title={`${t(item.name)}${item.nosim ? ` (${t('sem modelo de simulação')})` : ''}: ${t('clique e depois clique no quadro, arraste ou dê duplo clique')}`} {...pick}>
            <Glyph item={item} /><span>{t(item.name)}</span>{item.nosim && <i className="nosim" />}
        </button>
    )
}

const PartTile = ({ entry }: { entry: Found }) => {
    const icon = iconOf(entry)
    const pick = usePick(entry.moduleId)
    return (
        <button className="part" title={`${entry.title}\n${entry.family}`} {...pick}>
            {icon ? <img src={icon} alt="" loading="lazy" draggable={false} /> : <svg viewBox="0 0 64 64" aria-hidden><rect x="14" y="14" width="36" height="36" rx="4" /></svg>}
            <span>{entry.title}</span>
        </button>
    )
}

const ResultRow = ({ entry }: { entry: Found }) => {
    const featured = FEATURED.find(item => item.moduleId === entry.moduleId)
    const icon     = featured ? null : iconOf(entry)
    const pick     = usePick(entry.moduleId)
    return (
        <li>
            <button className="result" title={`${entry.title}\n${entry.family}`} {...pick}>
                {featured ? <span className="glyph"><Glyph item={featured} /></span> : icon ? <img src={icon} alt="" loading="lazy" draggable={false} /> : <span className="glyph" />}
                <span className="grow"><span className="t">{featured?.name ?? entry.title}</span><span className="f">{featured ? entry.title : entry.family}</span></span>
            </button>
        </li>
    )
}

const Section = ({ title, count, open, flip, children }: { title: string, count: number, open: boolean, flip: () => void, children: ReactNode }) => (
    <div className="parts-group">
        <h3><button className={open ? '' : 'closed'} aria-expanded={open} onClick={flip}><Icon name="chevronDown" />{title}<span className="n">{count}</span></button></h3>
        {open && children}
    </div>
)

const renameBin = (index: number) => {
    const title = window.prompt(t('Novo nome do bin'), useStore.getState().userBins[index]?.title)

    if (title !== null)
        useStore.getState().renameBin(index, title)
}

const removeBin = (index: number) => {
    if (window.confirm(t('Apagar o bin {0}? As peças continuam no acervo.', useStore.getState().userBins[index]?.title ?? '')))
        useStore.getState().deleteBin(index)
}

// PAINEL DE PEÇAS: BUSCA (ATALHO /), BÁSICOS SUGERIDOS PRIMEIRO E A BIBLIOTECA DO FRITZING EM SEÇÕES; MEUS ITENS E OS BINS DO USUÁRIO (DESIGN.md §5, SPEC 01 §7)
export const Library = () => {
    const catalog             = useStore(state => state.catalog)
    const bins                = useStore(state => state.bins)
    const indexed             = useStore(state => state.indexed)
    const ready               = useStore(state => state.ready)
    const mine                = useStore(state => state.mine)
    const userBins            = useStore(state => state.userBins)
    const imported            = useStore(state => state.imported)
    const input               = useRef<HTMLInputElement>(null)
    const [text, setText]     = useState('')
    const [found, setFound]   = useState<Found[]>([])
    const [owned, setOwned]   = useState<Found[]>([])
    const [tab, setTab]       = useState<Tab>('core')
    const [opened, setOpened] = useState<string[]>([])
    const query               = text.trim()

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === '/' && !(event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) {
                event.preventDefault()
                input.current?.focus()
            }
        }

        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    useEffect(() => {
        let live = true

        if (ready && query)
            catalog.search(query).then(result => live && setFound(result))

        return () => {
            live = false
        }
    }, [query, catalog, ready])

    const kept = useMemo(() => [...new Set([...mine, ...userBins.flatMap(bin => bin.moduleIds)])], [mine, userBins])

    useEffect(() => {
        let live = true

        if (ready && kept.length)
            catalog.entries(kept).then(result => live && setOwned(result))

        return () => {
            live = false
        }
    }, [kept, catalog, ready])

    const featured   = FEATURED.filter(item => tab === 'core' || !item.nosim)
    const sections   = tab === 'mine' ? [] : bins[tab === 'core' ? 0 : 1]?.sections ?? []
    const members    = (ids: string[]) => ids.flatMap(moduleId => owned.find(entry => entry.moduleId === moduleId) ?? imported.find(entry => entry.moduleId === moduleId) ?? [])
    const mineGroups = [[MINE, mine, -1] as const, ...userBins.map((bin, i) => [bin.title, bin.moduleIds, i] as const)]
    const total      = tab === 'mine' ? kept.length : featured.length + sections.reduce((sum, section) => sum + section.entries.length, 0)
    const flip       = (title: string) => setOpened(opened.includes(title) ? opened.filter(other => other !== title) : [...opened, title])
    const results    = query ? found : []

    return (
        <section className="lp" aria-label={t('Peças')}>
            <div className="lp-head">
                <label className="search">
                    <Icon name="search" />
                    <input ref={input} type="search" placeholder={t('Buscar peça')} aria-label={t('Buscar peça')} autoComplete="off" value={text} onChange={event => setText(event.target.value)} onKeyDown={event => event.key === 'Escape' && setText('')} />
                    {query ? <button className="icon-btn" style={{ width: 22, height: 22 }} aria-label={t('Limpar busca')} onClick={() => setText('')}><Icon name="close" /></button> : <kbd>/</kbd>}
                </label>
                <div className="tabs" role="tablist">
                    {TABS.map(([id, label]) => <button key={id} className="tab" role="tab" aria-selected={!query && tab === id} onClick={() => { setTab(id); setText('') }}>{t(label)}</button>)}
                </div>
                <p className="count">
                    {query ? t(results.length === 1 ? '{0} resultado' : '{0} resultados', results.length) : t('{0} peças', total)}
                    {!indexed.ready && <span className="num">· {t('indexando')} {indexed.done}/{indexed.total || '…'}</span>}
                </p>
            </div>
            <div className="lp-body">
                {query && (results.length ? <ul className="results">{results.map(entry => <ResultRow key={`${entry.root}/${entry.path}/${entry.moduleId}`} entry={entry} />)}</ul> : <div className="empty">{t('Nenhuma peça para “{0}”. Tente “resistor”, “fonte”, “LED” ou “555”.', query)}</div>)}
                {!query && tab !== 'mine' && FEATURED_GROUPS.map(group => {
                    const items = featured.filter(item => item.group === group)
                    return items.length > 0 && <div key={group} className="parts-group"><h3>{t(group)}</h3><div className="parts-grid">{items.map(item => <FeaturedTile key={item.moduleId} item={item} />)}</div></div>
                })}
                {!query && tab !== 'mine' && sections.length > 0 && <h3 className="h3">{tab === 'core' ? t('Biblioteca completa') : t('Biblioteca do simulador')}</h3>}
                {!query && tab !== 'mine' && sections.map(section => (
                    <Section key={section.title} title={section.title} count={section.entries.length} open={opened.includes(section.title)} flip={() => flip(section.title)}>
                        <div className="parts-grid">{section.entries.map(entry => <PartTile key={`${entry.root}/${entry.path}`} entry={entry} />)}</div>
                    </Section>
                ))}
                {!query && tab === 'mine' && mineGroups.map(([title, ids, index]) => (
                    <div key={`${title}-${index}`} className="parts-group">
                        <h3>{index < 0 ? t(title) : title}<span className="n muted">{ids.length}</span></h3>
                        <div className="bin-actions">
                            <button className="btn sm" disabled={!ids.length} onClick={() => index < 0 ? useStore.getState().exportMine() : useStore.getState().exportBin(index)}>{t('Exportar .fzbz')}</button>
                            {index >= 0 && <button className="btn sm" onClick={() => renameBin(index)}>{t('Renomear')}</button>}
                            {index >= 0 && <button className="btn sm" onClick={() => removeBin(index)}>{t('Apagar')}</button>}
                        </div>
                        {ids.length ? <div className="parts-grid">{members(ids).map(entry => <PartTile key={entry.moduleId} entry={entry} />)}</div> : <div className="empty">{t('Vazio. Use “Adicionar ao bin” no menu de uma peça ou abra um .fzpz/.fzbz.')}</div>}
                    </div>
                ))}
                {!query && tab === 'mine' && <button className="btn sm" style={{ marginTop: 12 }} onClick={() => promptBin([])}><Icon name="plus" />{t('Novo bin')}</button>}
            </div>
        </section>
    )
}
