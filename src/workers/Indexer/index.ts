import { readPart, type Kind } from '../../core/Part'
import { readBin } from '../../core/Sketch'

type Listing = { root: string, path: string, size: number, mtime: number }

export type Entry = {
    moduleId: string
    root: string
    path: string
    title: string
    family: string
    label: string
    kind: Kind
    icon: string
    obsolete: boolean
    properties: Record<string, string>
    haystack: string
}

export type Found = Omit<Entry, 'haystack'>

export type BinSection = { title: string, entries: Found[] }
export type BinTab     = { title: string, sections: BinSection[] }

type Cached = { size: number, mtime: number, entry: Entry | null }

const DB_NAME     = 'circuitmaster'
const DB_VERSION  = 3
const STORE       = 'parts'
const CONCURRENCY = 16
const PROGRESS    = 100
const SEARCH_MAX  = 300
const BINS        = [['Core', 'core.fzb'], ['Simulador', 'more/sim.fzb']]

const scope = self as unknown as { postMessage: (message: unknown) => void, onmessage: ((event: MessageEvent) => void) | null }

let entries: Entry[] = []
let byId = new Map<string, Entry>()

const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
        if (request.result.objectStoreNames.contains(STORE))
            request.result.deleteObjectStore(STORE)

        request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
})

const readCache = (db: IDBDatabase) => new Promise<Map<string, Cached>>((resolve, reject) => {
    const store   = db.transaction(STORE, 'readonly').objectStore(STORE)
    const keys    = store.getAllKeys()
    const values  = store.getAll()
    values.onsuccess = () => resolve(new Map(keys.result.map((key, i) => [String(key), values.result[i] as Cached])))
    values.onerror = () => reject(values.error)
})

const writeCache = (db: IDBDatabase, records: [string, Cached][]) => new Promise<void>(resolve => {
    const transaction = db.transaction(STORE, 'readwrite')
    records.forEach(([key, value]) => transaction.objectStore(STORE).put(value, key))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => resolve()
})

const toEntry = ({ root, path }: Listing, text: string): Entry | null => {
    const part = readPart(text, root === 'app')

    if (!part)
        return null

    const fields = [part.title, part.description.replace(/<[^>]*>/g, ' '), part.url, part.author, part.moduleId, ...part.tags, ...Object.entries(part.properties).flat()]
    return { moduleId: part.moduleId, root, path, title: part.title, family: part.properties.family ?? '', label: part.label, kind: part.kind, icon: part.views.iconView?.image ?? '', obsolete: path.startsWith('obsolete/'), properties: part.properties, haystack: fields.join('\n').toLowerCase() }
}

const fetchText = async (url: string) => {
    try {
        const response = await fetch(url)
        return response.ok ? await response.text() : null
    } catch (error) {
        return error instanceof TypeError ? null : Promise.reject(error)
    }
}

const strip = ({ haystack, ...entry }: Entry): Found => entry

const index = async () => {
    const listings: Listing[] = JSON.parse(await fetchText('/fritzing/fzp.json') ?? '[]')
    const db      = await openDb().catch(() => null)
    const cached  = db ? await readCache(db).catch(() => new Map<string, Cached>()) : new Map<string, Cached>()
    const fresh: [string, Cached][] = []
    const found: (Entry | null)[]   = new Array(listings.length).fill(null)
    let next = 0
    let done = 0

    const work = async () => {
        while (next < listings.length) {
            const i       = next++
            const listing = listings[i]
            const key     = `${listing.root}/${listing.path}`
            const hit     = cached.get(key)

            if (hit && hit.size === listing.size && hit.mtime === listing.mtime) {
                found[i] = hit.entry
            } else {
                const text = await fetchText(`/fritzing/${key}`)
                found[i]   = text ? toEntry(listing, text) : null
                fresh.push([key, { size: listing.size, mtime: listing.mtime, entry: found[i] }])
            }

            if (++done % PROGRESS === 0)
                scope.postMessage({ type: 'progress', done, total: listings.length })
        }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, work))

    if (db && fresh.length)
        await writeCache(db, fresh)

    byId    = new Map(found.filter((entry): entry is Entry => entry !== null).reverse().map(entry => [entry.moduleId, entry]))
    entries = [...byId.values()].sort((a, b) => a.title.localeCompare(b.title))
    scope.postMessage({ type: 'ready', count: entries.length, total: listings.length })

    const bins = await Promise.all(BINS.map(async ([title, file]) => {
        const bin      = readBin(await fetchText(`/fritzing/parts/bins/${file}`) ?? '')
        const sections = new Map<string, Found[]>()

        bin?.entries.forEach(({ moduleIdRef, section }) => {
            const entry = byId.get(moduleIdRef)

            if (entry)
                sections.set(section, [...sections.get(section) ?? [], strip(entry)])
        })

        return { title, sections: [...sections].map(([name, items]) => ({ title: name, entries: items })) }
    }))

    scope.postMessage({ type: 'bin', bins })
}

// TÍTULOS QUE CONTÊM TODOS OS TERMOS PRIMEIRO; A ORDENAÇÃO ESTÁVEL MANTÉM A ORDEM ALFABÉTICA DENTRO DE CADA GRUPO
const search = (text: string) => {
    const terms   = text.toLowerCase().split(/\s+/).filter(Boolean)
    const found   = entries.filter(entry => !entry.obsolete && terms.every(term => entry.haystack.includes(term)))
    const inTitle = (entry: Entry) => terms.every(term => entry.title.toLowerCase().includes(term)) ? 0 : 1
    return found.sort((a, b) => inTitle(a) - inTitle(b)).slice(0, SEARCH_MAX).map(strip)
}

const indexed = index()

scope.onmessage = async ({ data }) => {
    await indexed

    if (data.type === 'search')
        return scope.postMessage({ id: data.id, result: search(data.text) })

    if (data.type === 'family')
        return scope.postMessage({ id: data.id, result: entries.filter(entry => !entry.obsolete && entry.family.toLowerCase() === String(data.family).toLowerCase()).map(strip) })

    if (data.type === 'entries')
        return scope.postMessage({ id: data.id, result: (data.moduleIds as string[]).flatMap(moduleId => byId.has(moduleId) ? [strip(byId.get(moduleId) as Entry)] : []) })

    if (data.type === 'locate')
        return scope.postMessage({ id: data.id, result: Object.fromEntries((data.moduleIds as string[]).flatMap(id => byId.has(id) ? [[id, { root: byId.get(id)?.root, path: byId.get(id)?.path }]] : [])) })
}
