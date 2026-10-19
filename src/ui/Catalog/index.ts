import { findSvg, type PartLocation, type Source } from '../../core/Library'
import type { BinTab, Found } from '../../workers/Indexer'

export type IndexerStatus = { type: 'progress', done: number, total: number } | { type: 'ready', count: number, total: number } | { type: 'bin', bins: BinTab[] }

// ESCOLHE NA FAMÍLIA A PEÇA COM O VALOR PEDIDO E O MAIOR NÚMERO DE OUTRAS PROPRIEDADES IGUAIS (SPEC 01 §8.1)
export const pickSwap = (family: Found[], current: Record<string, string>, name: string, value: string) => family.filter(entry => entry.properties[name] === value).map(entry => [entry, Object.entries(current).filter(([key, other]) => key !== name && entry.properties[key] === other).length] as const).sort((a, b) => b[1] - a[1])[0]?.[0]

export const fetchText = async (url: string) => {
    const response = await fetch(url)
    return response.ok ? response.text() : null
}

// CLIENTE DO WORKER INDEXADOR E FONTE DOS ARQUIVOS DO ACERVO SERVIDOS EM /fritzing
export class Catalog implements Source {
    worker: Worker | null = null
    svgs = new Set<string>()
    requests = new Map<number, (result: never) => void>()
    next = 0
    listen: (status: IndexerStatus) => void

    constructor(listen: (status: IndexerStatus) => void) {
        this.listen = listen
    }

    async start() {
        if (this.worker)
            return

        this.worker = new Worker(new URL('../../workers/Indexer/index.ts', import.meta.url), { type: 'module' })
        this.worker.onmessage = ({ data }) => 'id' in data ? this.requests.get(data.id)?.(data.result as never) : this.listen(data)
        this.svgs = new Set(JSON.parse(await fetchText('/fritzing/svg.json') ?? '[]'))
    }

    request<T>(message: Record<string, unknown>) {
        const id = this.next++

        return new Promise<T>(resolve => {
            this.requests.set(id, result => {
                this.requests.delete(id)
                resolve(result)
            })
            this.worker?.postMessage({ ...message, id })
        })
    }

    search = (text: string) => this.request<Found[]>({ type: 'search', text })

    entries = (moduleIds: string[]) => this.request<Found[]>({ type: 'entries', moduleIds })

    family = (family: string) => this.request<Found[]>({ type: 'family', family })

    locate = (moduleIds: string[]) => this.request<Record<string, PartLocation>>({ type: 'locate', moduleIds })

    read = (root: string, path: string) => fetchText(`/fritzing/${root}/${path}`)

    has = (root: string, path: string) => this.svgs.has(`${root}/${path}`)

    getIcon(entry: Found) {
        const found = entry.icon ? findSvg(this.has, entry.root, entry.icon) : undefined
        return found ? `/fritzing/${found[0]}/${found[1]}` : null
    }
}
