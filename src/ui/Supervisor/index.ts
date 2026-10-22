type Pending = { resolve: (result: unknown) => void, progress: (progress: never) => void }

export type Reply = { id?: number, result?: unknown, progress?: unknown, error?: string }

// WORKER VIGIADO: CRIADO NO PRIMEIRO PEDIDO E CASADO PELO id; ERRO DO TRABALHO, MORTE OU SILÊNCIO DO WORKER RESOLVEM OS PEDIDOS EM ABERTO COM NULO (A CAUSA FICA EM failure) E O PEDIDO SEGUINTE O RECRIA, PORQUE O MOTOR PODE TER FICADO INCONSISTENTE
export class Supervisor<M extends object = object> {
    worker: Worker | null = null
    pending = new Map<number, Pending>()
    next = 0
    failure = ''
    timer: ReturnType<typeof setTimeout> | undefined = undefined
    create: () => Worker
    idle: number
    listen: (data: never) => void

    constructor(create: () => Worker, idle: number, listen: (data: never) => void = () => {}) {
        this.create = create
        this.idle   = idle
        this.listen = listen
    }

    start() {
        if (this.worker)
            return this.worker

        const worker = this.create()
        worker.onmessage      = ({ data }) => this.receive(data)
        worker.onmessageerror = () => this.stop('o processo de fundo mandou uma resposta ilegível')
        worker.onerror        = event => {
            event.preventDefault()
            this.stop(`o processo de fundo falhou (${event.message || 'sem mensagem'})`)
        }
        this.worker = worker
        return worker
    }

    // TODA MENSAGEM PROVA QUE O WORKER ESTÁ VIVO; A SEM id É DO PRÓPRIO WORKER (PROGRESSO DO ÍNDICE, BINS)
    receive(data: Reply) {
        const pending = data.id === undefined ? undefined : this.pending.get(data.id)
        const done    = pending !== undefined && data.progress === undefined

        if (done)
            this.pending.delete(data.id as number)

        this.watch()

        if (data.id === undefined)
            return this.listen(data as never)

        if (!pending)
            return

        if (!done)
            return pending.progress(data.progress as never)

        if (data.error !== undefined) {
            pending.resolve(null)
            return this.stop(`o processo de fundo falhou (${data.error})`)
        }

        pending.resolve(data.result)
    }

    watch() {
        clearTimeout(this.timer)

        if (this.pending.size)
            this.timer = setTimeout(() => this.stop(`o processo de fundo ficou ${this.idle / 1000} s sem responder e foi reiniciado`), this.idle)
    }

    stop(reason = '') {
        const pending = [...this.pending.values()]
        clearTimeout(this.timer)
        this.worker?.terminate()
        this.worker  = null
        this.failure = reason
        this.pending.clear()
        pending.forEach(item => item.resolve(null))
    }

    request<T>(message: M, progress: (progress: never) => void = () => {}) {
        const worker = this.start()
        const id     = this.next++

        return new Promise<T | null>(resolve => {
            this.pending.set(id, { resolve: resolve as (result: unknown) => void, progress })
            this.watch()
            worker.postMessage({ ...message, id })
        })
    }
}
