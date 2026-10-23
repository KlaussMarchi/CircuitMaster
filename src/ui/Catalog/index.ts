import { findSvg, type PartLocation, type Source } from '../../core/Library'
import type { BinTab, Found } from '../../workers/Indexer'
import { Supervisor } from '../Supervisor'

export type IndexerStatus = { type: 'progress', done: number, total: number } | { type: 'ready', count: number, total: number } | { type: 'bin', bins: BinTab[] }

// ESCOLHE NA FAMÍLIA A PEÇA COM O VALOR PEDIDO E O MAIOR NÚMERO DE OUTRAS PROPRIEDADES IGUAIS (SPEC 01 §8.1)
export const pickSwap = (family: Found[], current: Record<string, string>, name: string, value: string) => family.filter(entry => entry.properties[name] === value).map(entry => [entry, Object.entries(current).filter(([key, other]) => key !== name && entry.properties[key] === other).length] as const).sort((a, b) => b[1] - a[1])[0]?.[0]

// ARQUIVO SERVIDO PELO APP; SEM REDE (TypeError DO fetch) OU SEM O ARQUIVO VOLTA NULO
export const fetchBytes = async (url: string) => {
    try {
        const response = await fetch(url)
        return response.ok ? new Uint8Array(await response.arrayBuffer()) : null
    } catch (error) {
        if (error instanceof TypeError)
            return null

        throw error
    }
}

export const fetchText = async (url: string) => {
    const bytes = await fetchBytes(url)
    return bytes ? new TextDecoder().decode(bytes) : null
}

const INDEX_IDLE = 60000    // MS SEM NOTÍCIA DO INDEXADOR COM PEDIDO EM ABERTO (ELE AVISA O PROGRESSO A CADA 100 PEÇAS)

// CLIENTE DO WORKER INDEXADOR E FONTE DOS ARQUIVOS DO ACERVO SERVIDOS EM /fritzing; PEDIDO QUE FALHA DEVOLVE VAZIO
export class Catalog implements Source {
    supervisor: Supervisor<Record<string, unknown>>
    svgs = new Set<string>()

    constructor(listen: (status: IndexerStatus) => void) {
        this.supervisor = new Supervisor<Record<string, unknown>>(() => new Worker(new URL('../../workers/Indexer/index.ts', import.meta.url), { type: 'module' }), INDEX_IDLE, listen)
    }

    async start() {
        if (this.supervisor.worker)
            return

        this.supervisor.start()
        this.svgs = new Set(JSON.parse(await fetchText('/fritzing/svg.json') ?? '[]'))
    }

    request<T>(message: Record<string, unknown>, empty: T) {
        return this.supervisor.request<T>(message).then(result => result ?? empty)
    }

    search = (text: string) => this.request<Found[]>({ type: 'search', text }, [])

    entries = (moduleIds: string[]) => this.request<Found[]>({ type: 'entries', moduleIds }, [])

    family = (family: string) => this.request<Found[]>({ type: 'family', family }, [])

    locate = (moduleIds: string[]) => this.request<Record<string, PartLocation>>({ type: 'locate', moduleIds }, {})

    read = (root: string, path: string) => fetchText(root.startsWith('kicad-') ? `/kicad/${root.slice(6)}/${path}` : `/fritzing/${root}/${path}`)    // AS BIBLIOTECAS DO KICAD (kicad-symbols, kicad-footprints) VÊM DE /kicad

    has = (root: string, path: string) => this.svgs.has(`${root}/${path}`)

    getIcon(entry: Found) {
        const found = entry.icon ? findSvg(this.has, entry.root, entry.icon) : undefined
        return found ? `/fritzing/${found[0]}/${found[1]}` : null
    }
}
