import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react'
import { FEATURED, FEATURED_GROUPS, normalize, type Featured } from '../../core/Featured'
import { GENERATED_ROOT, generateSvg } from '../../core/Generator'
import type { Found } from '../../workers/Indexer'
import { Icon, type IconName } from '../Icon'
import { promptBin } from '../Menus'
import { ContextMenu, type MenuEntry } from '../ContextMenu'
import { entryOf, useStore } from '../Store'
import { t } from '../../core/Text'
import { centerOnSelection } from '../Navigation'
import { isKicad } from '../../core/Library'
import { INVERTED } from '../Canvas'

export const PART_MIME = 'application/x-circuitmaster-part'

type Tab = string    // ARQUIVO DO BIN DO ACERVO, MEUS ITENS OU O Temp

const CORE     = 'bins/core.fzb'
const MINE_TAB = 'mine'
const CATALOG  = 'catalog'
const TEMP     = 'temp'
const MINE     = 'Meus itens'

const TABS: [Tab, string][] = [[CORE, 'Básicos'], [CATALOG, 'Catálogo'], [MINE_TAB, MINE]]
const VIEWS: [boolean, IconName, string][] = [[false, 'grid', 'Bin em ícones'], [true, 'list', 'Bin em lista']]

const icons = new Map<string, string>()

// ÍCONE DE PEÇA SEM ARQUIVO NO ACERVO: DE PACOTE OU GERADA (DIP, BARRA DE PINOS…)
const ownIcon = (entry: Found) => {
    const text = entry.root === 'bundle' ? useStore.getState().library.findBundled(entry.icon)?.text : entry.root === GENERATED_ROOT ? generateSvg(entry.icon) : undefined

    if (text && !icons.has(entry.icon))
        icons.set(entry.icon, URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' })))

    return icons.get(entry.icon) ?? null
}

const iconOf = (entry: Found) => useStore.getState().catalog.getIcon(entry) ?? ownIcon(entry)

const SymbolIcon = lazy(() => import('../SymbolIcon').then(module => ({ default: module.SymbolIcon })))    // SÓ COM PEÇAS DAS BIBLIOTECAS DE SÍMBOLOS NA TELA

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

// MENU DA PEÇA NO BIN (EDITAR, EXPORTAR, REMOVER DO BIN DO USUÁRIO, LOCALIZAR NO SKETCH); owner -1 É MEUS ITENS
const binMenu = (moduleId: string, owner: number | null): MenuEntry[] => {
    const { doc, editModule, exportPart, removeFromBin, selectWhere } = useStore.getState()
    const used = Object.values(doc.instances).some(instance => instance.moduleIdRef === moduleId)
    return [
        { label: 'Editar peça (editor de peças)', apply: () => void editModule(moduleId) },
        { label: 'Exportar peça…', apply: () => void exportPart(moduleId) },
        ...owner !== null ? [{ label: 'Remover do bin', apply: () => removeFromBin(owner, moduleId) }] : [],
        null,
        { label: 'Localizar no sketch', disabled: !used, apply: () => {
            selectWhere(instance => instance.moduleIdRef === moduleId)
            centerOnSelection(useStore.getState())
        } }
    ]
}

type Menu = { x: number, y: number, items: MenuEntry[] }

const MenuContext = createContext<(menu: Menu) => void>(() => {})

const useMenu = (moduleId: string, owner: number | null) => {
    const open = useContext(MenuContext)
    return (event: MouseEvent) => {
        event.preventDefault()
        open({ x: event.clientX, y: event.clientY, items: binMenu(moduleId, owner) })
    }
}

// PEÇA NO BIN EM ÍCONE (GRADE) OU EM LINHA (LISTA), COMO NO Show Bin in Icon/List View DO FRITZING
const Item = ({ moduleId, art, name, sub, list, owner }: { moduleId: string, art: ReactNode, name: string, sub: string, list: boolean, owner: number | null }) => {
    const pick = usePick(moduleId)
    const menu = useMenu(moduleId, owner)

    if (list)
        return <li><button className="result" title={`${name}\n${sub}`} onContextMenu={menu} {...pick}>{art}<span className="grow"><span className="t">{name}</span><span className="f">{sub}</span></span></button></li>

    return <button className="part" title={`${name}\n${sub}`} onContextMenu={menu} {...pick}>{art}<span>{name}</span></button>
}

const artOf = (entry: Found, featured: Featured | undefined, list: boolean) => {
    const icon = featured || isKicad(entry.moduleId) ? null : iconOf(entry)

    if (isKicad(entry.moduleId))
        return <Suspense fallback={<span className="glyph" />}><SymbolIcon moduleId={entry.moduleId} filter={useStore.getState().theme === 'dark' ? INVERTED : undefined} /></Suspense>

    if (featured)
        return list ? <span className="glyph"><Glyph item={featured} /></span> : <Glyph item={featured} />

    if (icon)
        return <img src={icon} alt="" loading="lazy" draggable={false} />

    return list ? <span className="glyph" /> : <svg viewBox="0 0 64 64" aria-hidden><rect x="14" y="14" width="36" height="36" rx="4" /></svg>
}

const FoundItem = ({ entry, list, owner }: { entry: Found, list: boolean, owner: number | null }) => {
    const featured = FEATURED.find(item => item.moduleId === entry.moduleId)
    return <Item moduleId={entry.moduleId} art={artOf(entry, featured, list)} name={featured ? t(featured.name) : entry.title} sub={featured ? entry.title : entry.family} list={list} owner={owner} />
}

const FeaturedItem = ({ item, list }: { item: Featured, list: boolean }) => {
    const hint = [item.nosim ? t('sem modelo de simulação') : '', t('clique e depois clique no quadro, arraste ou dê duplo clique')].filter(Boolean).join(' · ')
    return <Item moduleId={item.moduleId} art={list ? <span className="glyph"><Glyph item={item} /></span> : <><Glyph item={item} />{item.nosim && <i className="nosim" />}</>} name={t(item.name)} sub={hint} list={list} owner={null} />
}

const Parts = ({ entries, list, owner = null }: { entries: Found[], list: boolean, owner?: number | null }) => {
    const items = entries.map(entry => <FoundItem key={`${entry.root}/${entry.path}/${entry.moduleId}`} entry={entry} list={list} owner={owner} />)
    return list ? <ul className="results">{items}</ul> : <div className="parts-grid">{items}</div>
}

const SKETCH_HITS = 8     // PEÇAS DO SKETCH MOSTRADAS NA BUSCA
const RESULTS     = 60    // RESULTADOS DESENHADOS POR VEZ: DESENHAR AS CENTENAS A CADA TECLA PESA NA PRIMEIRA BUSCA; O RESTO VEM EM "Mostrar mais"

const locate = (modelIndex: string) => {
    useStore.getState().select([modelIndex])
    centerOnSelection(useStore.getState())
}

// PEÇAS DO SKETCH QUE CASAM COM A BUSCA (RÓTULO, TÍTULO E PROPRIEDADES), ANTES DO ACERVO: CLIQUE SELECIONA E CENTRALIZA (LOCALIZAR PEÇA NO SKETCH)
const InSketch = ({ query }: { query: string }) => {
    const doc     = useStore(state => state.doc)
    const library = useStore(state => state.library)
    const hits    = useMemo(() => {
        const terms = normalize(query).split(/\s+/).filter(Boolean)
        return Object.values(doc.instances).filter(instance => instance.moduleIdRef !== 'WireModuleID').filter(instance => {
            const part = library.getPart(instance.moduleIdRef)
            const text = normalize([instance.title, part?.title ?? '', ...Object.values({ ...part?.properties, ...instance.properties })].join(' '))
            return terms.every(term => text.includes(term))
        })
    }, [doc, library, query])

    if (!hits.length)
        return null

    return (
        <>
            <h3 className="h3">{t('No sketch')}<span className="n muted">{hits.length}</span></h3>
            <ul className="results" aria-label={t('No sketch')}>
                {hits.slice(0, SKETCH_HITS).map(instance => (
                    <li key={instance.modelIndex}>
                        <button className="result" title={t('Selecionar e centralizar {0}', instance.title)} onClick={() => locate(instance.modelIndex)}>
                            <span className="glyph"><Icon name="search" /></span>
                            <span className="grow"><span className="t">{instance.title}</span><span className="f">{library.getPart(instance.moduleIdRef)?.title}</span></span>
                        </button>
                    </li>
                ))}
            </ul>
            <h3 className="h3">{t('No acervo')}</h3>
        </>
    )
}

const Section = ({ title, count, open, flip, children }: { title: string, count: number, open: boolean, flip: () => void, children: ReactNode }) => (
    <div className="parts-group">
        <h3><button className={open ? '' : 'closed'} aria-expanded={open} onClick={flip}><Icon name="chevronDown" />{title}<span className="n">{count}</span></button></h3>
        {open && children}
    </div>
)

// UMA FAMÍLIA DO CATÁLOGO: AS PEÇAS CHEGAM AO ABRIR (O CATÁLOGO TEM 25 MIL)
const Family = ({ category, family, count, open, flip, list }: { category: string, family: string, count: number, open: boolean, flip: () => void, list: boolean }) => {
    const [entries, setEntries] = useState<Found[]>([])

    useEffect(() => {
        let live = true

        if (open)
            void useStore.getState().catalog.members(category, family).then(found => live && setEntries(found))

        return () => {
            live = false
        }
    }, [open, category, family])

    return <Section title={t(family || 'Sem família')} count={count} open={open} flip={flip}><Parts entries={entries} list={list} /></Section>
}

const renameBin = (index: number) => {
    const title = window.prompt(t('Novo nome do bin'), useStore.getState().userBins[index]?.title)

    if (title !== null)
        useStore.getState().renameBin(index, title)
}

const removeBin = (index: number) => {
    if (window.confirm(t('Apagar o bin {0}? As peças continuam no acervo.', useStore.getState().userBins[index]?.title ?? '')))
        useStore.getState().deleteBin(index)
}

// PEÇAS DO SKETCH QUE NÃO SÃO DO ACERVO (VIERAM NO .fzz OU DO EDITOR), COMO O BIN Temp DO FRITZING; CHAVE TEXTUAL PARA O SELETOR NÃO RENDERIZAR A CADA MUDANÇA
const tempIds = ({ library, doc }: ReturnType<typeof useStore.getState>) => {
    const own = [...library.bundled.keys()].filter(moduleId => library.getPart(moduleId) === library.bundled.get(moduleId))

    if (!own.length)
        return ''

    const used = new Set(Object.values(doc.instances).map(instance => instance.moduleIdRef))
    return own.filter(moduleId => used.has(moduleId)).join('\n')
}

// PAINEL DE PEÇAS: BUSCA (ATALHO /), BÁSICOS SUGERIDOS PRIMEIRO, OS BINS DO ACERVO EM ABAS E SEÇÕES, MEUS ITENS, OS BINS DO USUÁRIO E O Temp (DESIGN.md §5, SPEC 01 §7)
export const Library = () => {
    const catalog             = useStore(state => state.catalog)
    const library             = useStore(state => state.library)
    const bins                = useStore(state => state.bins)
    const indexed             = useStore(state => state.indexed)
    const symbols             = useStore(state => state.indexed.symbols)
    const ready               = useStore(state => state.ready)
    const mine                = useStore(state => state.mine)
    const userBins            = useStore(state => state.userBins)
    const imported            = useStore(state => state.imported)
    const list                = useStore(state => state.preferences.binList)
    const temp                = useStore(tempIds)
    const input               = useRef<HTMLInputElement>(null)
    const [text, setText]     = useState('')
    const [found, setFound]   = useState<Found[]>([])
    const [owned, setOwned]   = useState<Found[]>([])
    const [tab, setTab]       = useState<Tab>(CORE)
    const [opened, setOpened] = useState<string[]>([])
    const [menu, setMenu]     = useState<Menu | null>(null)
    const [tree, setTree]     = useState<[string, [string, number][]][]>([])
    const [limit, setLimit]   = useState(RESULTS)
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

        setLimit(RESULTS)

        if (ready && query)
            catalog.search(query).then(result => live && setFound(result))

        return () => {
            live = false
        }
    }, [query, catalog, ready, symbols])

    useEffect(() => {
        let live = true

        if (tab === CATALOG && ready && !tree.length)
            void catalog.tree().then(found => live && setTree(found))

        return () => {
            live = false
        }
    }, [tab, ready, tree.length, catalog])

    const kept = useMemo(() => [...new Set([...mine, ...userBins.flatMap(bin => bin.moduleIds)])], [mine, userBins])

    useEffect(() => {
        let live = true

        if (ready && kept.length)
            catalog.entries(kept).then(result => live && setOwned(result))

        return () => {
            live = false
        }
    }, [kept, catalog, ready])

    const collections = bins.filter(other => other.file !== CORE)    // O BIN DO SIMULADOR E OS DE FABRICANTE: NO CATÁLOGO, EM VEZ DE ABAS
    const tempParts  = useMemo(() => temp ? temp.split('\n').flatMap(moduleId => library.bundled.get(moduleId) ?? []).map(entryOf) : [], [temp, library])
    const current    = tab === TEMP && !tempParts.length ? CORE : tab
    const bin        = bins.find(other => other.file === current)
    const featured   = current === CORE ? FEATURED : []
    const sections   = bin?.sections ?? []
    const members    = (ids: string[]) => ids.flatMap(moduleId => owned.find(entry => entry.moduleId === moduleId) ?? imported.find(entry => entry.moduleId === moduleId) ?? [])
    const mineGroups = [[MINE, mine, -1] as const, ...userBins.map((bin, i) => [bin.title, bin.moduleIds, i] as const)]
    const total      = current === MINE_TAB ? kept.length : current === TEMP ? tempParts.length : current === CATALOG ? tree.reduce((sum, [, families]) => sum + families.reduce((part, [, count]) => part + count, 0), 0) : featured.length + sections.reduce((sum, section) => sum + section.entries.length, 0)
    const flip       = (key: string) => setOpened(opened.includes(key) ? opened.filter(other => other !== key) : [...opened, key])
    const results    = query ? found : []
    const choose     = (id: Tab) => {
        setTab(id)
        setText('')
    }
    const tabs: [Tab, string][] = [...TABS, ...tempParts.length ? [[TEMP, 'Temp'] as [Tab, string]] : []]

    return (
        <section className="lp" aria-label={t('Peças')}>
            <div className="lp-head">
                <label className="search">
                    <Icon name="search" />
                    <input ref={input} id="part-search" type="search" placeholder={t('Buscar peça')} aria-label={t('Buscar peça')} autoComplete="off" value={text} onChange={event => setText(event.target.value)} onKeyDown={event => event.key === 'Escape' && setText('')} />
                    {query ? <button className="icon-btn" style={{ width: 22, height: 22 }} aria-label={t('Limpar busca')} onClick={() => setText('')}><Icon name="close" /></button> : <kbd>/</kbd>}
                </label>
                <div className="bin-tabs">
                    <div className="tabs" role="tablist">
                        {tabs.map(([id, label]) => <button key={id} className="tab" role="tab" aria-selected={!query && current === id} title={id === TEMP ? t('peças do sketch que não estão no acervo') : undefined} onClick={() => choose(id)}>{t(label)}</button>)}
                    </div>
                </div>
                <p className="count">
                    {query ? t(results.length === 1 ? '{0} resultado' : '{0} resultados', results.length) : t('{0} peças', total)}
                    {!indexed.ready && <span className="num">· {t('indexando')} {indexed.done}/{indexed.total || '…'}</span>}
                    <span className="grow" />
                    {VIEWS.map(([value, icon, label]) => <button key={label} className="icon-btn sm" aria-label={t(label)} aria-pressed={list === value} title={t(label)} onClick={() => useStore.getState().setPreferences({ binList: value })}><Icon name={icon} /></button>)}
                </p>
            </div>
            <MenuContext value={setMenu}>
                <div className="lp-body">
                    {query && <InSketch query={query} />}
                    {query && (results.length ? <Parts entries={results.slice(0, limit)} list /> : <div className="empty">{t('Nenhuma peça para “{0}”. Tente “resistor”, “fonte”, “LED” ou “555”.', query)}</div>)}
                    {query && results.length > limit && <button className="btn sm full" onClick={() => setLimit(limit + RESULTS)}>{t('Mostrar mais ({0})', results.length - limit)}</button>}
                    {!query && FEATURED_GROUPS.map(group => {
                        const items = featured.filter(item => item.group === group).map(item => <FeaturedItem key={item.moduleId} item={item} list={list} />)
                        return items.length > 0 && <div key={group} className="parts-group"><h3>{t(group)}</h3>{list ? <ul className="results">{items}</ul> : <div className="parts-grid">{items}</div>}</div>
                    })}
                    {!query && featured.length > 0 && sections.length > 0 && <h3 className="h3">{t('Mais peças')}</h3>}
                    {!query && sections.map(section => section.title ? (
                        <Section key={section.title} title={section.title} count={section.entries.length} open={opened.includes(`${current}/${section.title}`)} flip={() => flip(`${current}/${section.title}`)}>
                            <Parts entries={section.entries} list={list} />
                        </Section>
                    ) : <Parts key="" entries={section.entries} list={list} />)}
                    {!query && current === TEMP && <Parts entries={tempParts} list={list} />}
                    {!query && current === CATALOG && collections.length > 0 && (
                        <Section title={t('Coleções')} count={collections.length} open={opened.includes(`${CATALOG}/bins`)} flip={() => flip(`${CATALOG}/bins`)}>
                            <div className="families">{collections.map(other => (
                                <Section key={other.file} title={other.title} count={other.sections.reduce((sum, section) => sum + section.entries.length, 0)} open={opened.includes(`${CATALOG}/bins/${other.file}`)} flip={() => flip(`${CATALOG}/bins/${other.file}`)}>
                                    {other.sections.map(section => <Parts key={section.title} entries={section.entries} list={list} />)}
                                </Section>
                            ))}</div>
                        </Section>
                    )}
                    {!query && current === CATALOG && tree.map(([category, families]) => (
                        <Section key={category} title={t(category)} count={families.reduce((sum, [, count]) => sum + count, 0)} open={opened.includes(`${CATALOG}/${category}`)} flip={() => flip(`${CATALOG}/${category}`)}>
                            <div className="families">{families.map(([family, count]) => <Family key={family} category={category} family={family} count={count} open={opened.includes(`${CATALOG}/${category}/${family}`)} flip={() => flip(`${CATALOG}/${category}/${family}`)} list={list} />)}</div>
                        </Section>
                    ))}
                    {!query && current === MINE_TAB && mineGroups.map(([title, ids, index]) => (
                        <div key={`${title}-${index}`} className="parts-group">
                            <h3>{index < 0 ? t(title) : title}<span className="n muted">{ids.length}</span></h3>
                            <div className="bin-actions">
                                <button className="btn sm" disabled={!ids.length} onClick={() => index < 0 ? useStore.getState().exportMine() : useStore.getState().exportBin(index)}>{t('Exportar .fzbz')}</button>
                                {index >= 0 && <button className="btn sm" onClick={() => renameBin(index)}>{t('Renomear')}</button>}
                                {index >= 0 && <button className="btn sm" onClick={() => removeBin(index)}>{t('Apagar')}</button>}
                            </div>
                            {ids.length ? <Parts entries={members(ids)} list={list} owner={index} /> : <div className="empty">{t('Vazio. Use “Adicionar ao bin” no menu de uma peça ou abra um .fzpz/.fzbz.')}</div>}
                        </div>
                    ))}
                    {!query && current === MINE_TAB && <button className="btn sm" style={{ marginTop: 12 }} onClick={() => promptBin([])}><Icon name="plus" />{t('Novo bin')}</button>}
                </div>
            </MenuContext>
            {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} close={() => setMenu(null)} />}
        </section>
    )
}
