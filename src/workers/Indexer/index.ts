import { readPart, type Kind } from '../../core/Part'
import { readBin } from '../../core/Sketch'
import { alternativesOf, haystackOf, prepare, rankParts, termsOf, type Words } from '../../core/Search'
import { GENERATED_ROOT, generateFzp } from '../../core/Generator'
import { CATEGORIES, MISC, OTHERS, categoryOf, familyName } from '../../core/Category'
import { KICAD_SYMBOLS, kicadId, symbolPath } from '../../core/KicadPart'
import { scope, serve } from '../Serve'

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
export type BinTab     = { title: string, file: string, sections: BinSection[] }

type Cached = { size: number, mtime: number, entry: Entry | null }

const DB_NAME      = 'circuitmaster'
const DB_VERSION   = 3
const STORE        = 'parts'
const CONCURRENCY  = 4       // LEITURAS AO MESMO TEMPO: O NAVEGADOR ABRE 6 CONEXÕES POR HOST E 2 FICAM LIVRES PARA A PEÇA QUE O USUÁRIO PÕE DURANTE A INDEXAÇÃO
const PROGRESS     = 100
const BATCH        = 1000    // PEÇAS LIDAS POR GRAVAÇÃO DO CACHE: RECARREGAR NO MEIO DA PRIMEIRA INDEXAÇÃO NÃO PERDE O QUE JÁ FOI LIDO
const SEARCH_MAX   = 300
const CANDIDATES   = 300     // SÍMBOLOS QUE PASSAM PELO FILTRO SIMPLES E ENTRAM NA NOTA, OS DE NOME MAIS PARECIDO PRIMEIRO
const KICAD_BATCH  = 2000    // SÍMBOLOS MONTADOS POR VEZ: ENTRE UM LOTE E OUTRO O WORKER ATENDE A BUSCA EM CURSO
const FEW          = 3       // FAMÍLIA COM MENOS PEÇAS QUE ISSO VAI PARA "Diversos" DA CATEGORIA: SEM UMA LISTA DE GRUPOS DE UMA PEÇA SÓ
const KICAD_DELAY  = 1500    // ms DEPOIS DO ACERVO PRONTO: A PRIMEIRA BUSCA DE QUEM ACABOU DE ABRIR NÃO DIVIDE O WORKER COM A CARGA DOS SÍMBOLOS
const BINS         = [['Core', 'bins/core.fzb'], ['Simulador', 'bins/more/sim.fzb']]    // À FRENTE, NESTA ORDEM; OS OUTROS BINS DO ACERVO SEGUEM PELO TÍTULO
const ENGINE_FAULT = 'InternalError'
const FETCH_MS     = 15000    // LEITURA PRESA NO SERVIDOR VIRA UMA SEGUNDA TENTATIVA EM VEZ DE PRENDER A INDEXAÇÃO

let entries: Entry[] = []
let byId = new Map<string, Entry>()
const early = new Map<string, Entry>()    // PEÇAS JÁ LIDAS DURANTE A INDEXAÇÃO: PÔR UMA PEÇA DO CORE NÃO ESPERA O ACERVO INTEIRO
const waiting: (() => void)[] = []
let words = new Map<string, Words>()
let inBins: Set<string>[] = []

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
    transaction.onabort = () => resolve()    // TRANSAÇÃO ABORTADA SEM ERRO NÃO DISPARA complete: SEM ISSO A INDEXAÇÃO FICAVA PRESA
})

// O SPIDERMONKEY ACUSA "too much recursion" NUMA REGEX INTERROMPIDA DENTRO DO WORKER, COM A PILHA RASA E SOB CARGA; A SEGUNDA TENTATIVA PASSA
const again = <T>(work: () => T): T => {
    try {
        return work()
    } catch (error) {
        if (error instanceof Error && error.name === ENGINE_FAULT)
            return work()

        throw error
    }
}

const toEntry = ({ root, path }: Listing, text: string): Entry | null => {
    const part = again(() => readPart(text, root === 'app'))

    if (!part)
        return null

    return { moduleId: part.moduleId, root, path, title: part.title, family: part.properties.family ?? '', label: part.label, kind: part.kind, icon: part.views.iconView?.image ?? '', obsolete: path.startsWith('obsolete/'), properties: part.properties, haystack: haystackOf(part) }
}

const fetchText = async (url: string, tries = 2): Promise<string | null> => {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS) })
        return response.ok ? await response.text() : null
    } catch (error) {
        if (error instanceof DOMException && error.name === 'TimeoutError')
            return tries > 1 ? fetchText(url, tries - 1) : null

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

            if (found[i] && !early.has(found[i]?.moduleId ?? ''))
                early.set(found[i]?.moduleId ?? '', found[i] as Entry)

            if (waiting.length)
                waiting.splice(0).forEach(check => check())

            if (++done % PROGRESS === 0)
                scope.postMessage({ type: 'progress', done, total: listings.length })

            if (db && fresh.length >= BATCH)
                void writeCache(db, fresh.splice(0))
        }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, work))

    byId    = new Map(found.filter((entry): entry is Entry => entry !== null).reverse().map(entry => [entry.moduleId, entry]))
    entries = [...byId.values()].sort((a, b) => a.title.localeCompare(b.title))
    words   = new Map(entries.map(entry => [entry.moduleId, prepare(entry)]))
    waiting.length = 0    // OS PEDIDOS QUE AINDA ESPERAVAM SAEM PELO ÍNDICE PRONTO
    scope.postMessage({ type: 'ready', count: entries.length, total: listings.length })

    if (db && fresh.length)
        void writeCache(db, fresh)    // A GRAVAÇÃO DO CACHE NÃO SEGURA OS PEDIDOS
}

// BINS DO ACERVO DEPOIS DO ÍNDICE: AS ABAS E AS PEÇAS GERADAS QUE SÓ OS BINS CITAM ENTRAM NUMA SEGUNDA LEVA, SEM SEGURAR A BUSCA
const readBins = async () => {
    const files = (JSON.parse(await fetchText('/fritzing/bins.json') ?? '[]') as string[]).filter(file => !BINS.some(([, fixed]) => fixed === file))
    const read  = await Promise.all([...BINS, ...files.map(file => ['', file])].map(async ([title, file]) => [title, file, readBin(await fetchText(`/fritzing/parts/${file}`) ?? '')] as const))
    const made  = read.flatMap(([, , bin]) => bin?.entries ?? []).filter(({ moduleIdRef }) => !byId.has(moduleIdRef)).flatMap(({ moduleIdRef }) => {
        const text  = generateFzp(moduleIdRef)
        const entry = text ? toEntry({ root: GENERATED_ROOT, path: moduleIdRef, size: 0, mtime: 0 }, text) : null
        return entry ? [[moduleIdRef, entry] as const] : []
    })

    if (made.length) {
        byId    = new Map([...byId, ...made])
        entries = [...byId.values()].sort((a, b) => a.title.localeCompare(b.title))
        words   = new Map(entries.map(entry => [entry.moduleId, prepare(entry)]))
    }

    const bins = read.flatMap(([title, file, bin]) => {
        const sections = new Map<string, Found[]>()

        bin?.entries.forEach(({ moduleIdRef, section }) => {
            const entry = byId.get(moduleIdRef)

            if (entry)
                sections.set(section, [...sections.get(section) ?? [], strip(entry)])
        })

        return sections.size ? [{ title: title || bin?.title || file, file, sections: [...sections].map(([name, items]) => ({ title: name, entries: items })) }] : []
    })
    bins.splice(BINS.length, Infinity, ...bins.slice(BINS.length).sort((a, b) => a.title.localeCompare(b.title)))

    inBins = bins.map(bin => new Set(bin.sections.flatMap(section => section.entries.map(entry => entry.moduleId))))
    scope.postMessage({ type: 'bin', bins })
}

const kicad: Entry[] = []
let symbols: Promise<void> | null = null

const kicadEntry = (row: string): Entry => {
    const [library, name, description, keywords] = row.split('\t')
    return { moduleId: kicadId(library, name), root: KICAD_SYMBOLS, path: symbolPath(library, name), title: name, family: library.replaceAll('_', ' '), label: '', kind: 'part', icon: '', obsolete: false, properties: { description, keywords }, haystack: `${library} ${name} ${description} ${keywords}`.toLowerCase() }
}

// SÍMBOLOS DAS BIBLIOTECAS DO KICAD NO CATÁLOGO: O RESUMO QUE O SERVIDOR MONTA, EM LOTES (SPEC 08 §5)
const readKicad = async () => {
    const rows: string[] = JSON.parse(await fetchText('/kicad/symbols-index.json') ?? '[]')

    for (let start = 0; start < rows.length; start += KICAD_BATCH) {
        kicad.push(...rows.slice(start, start + KICAD_BATCH).map(kicadEntry))
        await new Promise(resolve => setTimeout(resolve))
    }
}

// SÍMBOLOS COM TODOS OS TERMOS (OU UM SINÔNIMO): O FILTRO SIMPLES QUE CABE NOS 22.905; OS DE NOME IGUAL AO PRIMEIRO TERMO E OS QUE COMEÇAM POR ELE FICAM, SE PASSAREM DO LIMITE
const candidatesOf = (terms: string[]) => {
    const options = terms.map(alternativesOf)
    const rank    = (entry: Entry) => entry.title.toLowerCase() === terms[0] ? 0 : entry.title.toLowerCase().startsWith(terms[0]) ? 1 : 2
    const found   = terms.length ? kicad.filter(entry => options.every(list => list.some(option => entry.haystack.includes(option)))) : []
    return found.length > CANDIDATES ? found.sort((a, b) => rank(a) - rank(b) || a.title.length - b.title.length).slice(0, CANDIDATES) : found
}

type Family = { name: string, entries: Entry[] }

let catalog: Map<string, Map<string, Family>> | null = null

// CATÁLOGO COM TODAS AS PEÇAS, DE QUALQUER ORIGEM, EM CATEGORIAS E FAMÍLIAS: FAMÍLIA DE MESMO NOME É UM GRUPO SÓ; OS FIOS FICAM DE FORA (SPEC 08 §6)
const getCatalog = async () => {
    await loadKicad()
    if (catalog)
        return catalog

    catalog = [...entries.filter(entry => !entry.obsolete && entry.kind !== 'wire'), ...kicad].reduce((table, entry) => {
        const category = categoryOf(entry.family, `${entry.title} ${entry.properties.description ?? ''}`)
        const families = table.get(category) ?? new Map<string, Family>()
        const key      = familyName(entry.family).toLowerCase()
        const family   = families.get(key) ?? { name: familyName(entry.family), entries: [] }
        family.entries.push(entry)
        return table.set(category, families.set(key, family))
    }, new Map<string, Map<string, Family>>())
    catalog.forEach(families => {
        const few = [...families].filter(([, family]) => family.entries.length < FEW)
        few.forEach(([key]) => families.delete(key))

        if (few.length)
            families.set(MISC.toLowerCase(), { name: MISC, entries: few.flatMap(([, family]) => family.entries) })
    })
    return catalog
}

// AS CATEGORIAS NA ORDEM DA TABELA, CADA UMA COM AS FAMÍLIAS EM ORDEM ALFABÉTICA E QUANTAS PEÇAS TÊM
const getTree = (table: Map<string, Map<string, Family>>) => [...CATEGORIES.map(([name]) => name), OTHERS].flatMap(name => table.has(name) ? [[name, [...table.get(name)?.values() ?? []].map(family => [family.name, family.entries.length]).sort((a, b) => Number(a[0] === MISC) - Number(b[0] === MISC) || String(a[0]).localeCompare(String(b[0])))]] : [])

// BUSCA NUMA LISTA SÓ: TODA PEÇA DO CATÁLOGO PELA MESMA NOTA DE core/Search (AS SUGERIDAS E AS DOS BINS CORE E SIMULADOR À FRENTE)
const search = (text: string) => {
    const candidates = candidatesOf(termsOf(text))
    candidates.forEach(entry => words.has(entry.moduleId) || words.set(entry.moduleId, prepare(entry)))
    return again(() => rankParts([...entries.filter(entry => !entry.obsolete), ...candidates], words, text, inBins)).slice(0, SEARCH_MAX).map(strip)
}

const indexed = index()

indexed.catch(() => {})    // A FALHA DO ÍNDICE CHEGA A CADA PEDIDO PELO await, NÃO COMO REJEIÇÃO SEM DONO
indexed.then(readBins).catch(() => {})
// CARGA DOS SÍMBOLOS, UMA VEZ: PELO RELÓGIO DEPOIS DO ACERVO PRONTO OU NA HORA, SE O CATÁLOGO PEDE ANTES; A BUSCA NÃO A ESPERA E, QUANDO TERMINA, O PAINEL REFAZ A BUSCA EM CURSO
const loadKicad = () => symbols ??= readKicad().then(() => scope.postMessage({ type: 'symbols', count: kicad.length })).catch(() => {})

indexed.then(() => setTimeout(loadKicad, KICAD_DELAY)).catch(() => {})

// PEDIDO QUE ESPERA AS PEÇAS APARECEREM NA LEITURA; O ÍNDICE PRONTO TAMBÉM O LIBERA (PEÇA GERADA OU INEXISTENTE)
const arrival = (moduleIds: string[]) => new Promise<void>(resolve => {
    const check = () => moduleIds.every(id => early.has(id)) ? resolve() : void waiting.push(check)
    check()
})

const locations = (moduleIds: string[], table: Map<string, Entry>) => Object.fromEntries(moduleIds.flatMap(id => table.has(id) && table.get(id)?.root !== GENERATED_ROOT ? [[id, { root: table.get(id)?.root, path: table.get(id)?.path }]] : []))

serve<{ type: string, text: string, category: string, family: string, moduleIds: string[] }>(async data => {
    if (data.type === 'locate') {
        await Promise.race([arrival(data.moduleIds), indexed])
        return locations(data.moduleIds, byId.size ? byId : early)
    }

    await indexed

    if (data.type === 'search')
        return search(data.text)

    if (data.type === 'catalog')
        return getTree(await getCatalog())

    if (data.type === 'catalog-family')
        return [...(await getCatalog()).get(data.category)?.get(familyName(data.family).toLowerCase())?.entries ?? []].sort((a, b) => a.title.localeCompare(b.title)).map(strip)

    if (data.type === 'family')
        return entries.filter(entry => !entry.obsolete && entry.family.toLowerCase() === data.family.toLowerCase()).map(strip)

    if (data.type === 'entries')
        return data.moduleIds.flatMap(moduleId => byId.has(moduleId) ? [strip(byId.get(moduleId) as Entry)] : [])

    return locations(data.moduleIds, byId)
})
