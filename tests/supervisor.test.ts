import { afterEach, describe, expect, it, vi } from 'vitest'
import { Supervisor, type Reply } from '../src/ui/Supervisor'

const IDLE = 1000

// WORKER FALSO: GUARDA O QUE RECEBE E RESPONDE QUANDO O TESTE MANDA
class FakeWorker {
    sent: { id: number }[] = []
    terminated = false
    onmessage: ((event: { data: Reply }) => void) | null = null
    onerror: ((event: { message: string, preventDefault: () => void }) => void) | null = null
    onmessageerror: (() => void) | null = null

    postMessage(message: { id: number }) {
        this.sent.push(message)
    }

    terminate() {
        this.terminated = true
    }

    reply(data: Reply) {
        this.onmessage?.({ data })
    }
}

const setup = () => {
    const workers: FakeWorker[] = []
    const heard: unknown[]      = []
    const supervisor            = new Supervisor<{ type: string }>(() => {
        workers.push(new FakeWorker())
        return workers[workers.length - 1] as unknown as Worker
    }, IDLE, data => heard.push(data))
    return { workers, heard, supervisor }
}

afterEach(() => vi.useRealTimers())

describe('supervisor dos workers (fase 1, seção 7)', () => {
    it('casa a resposta pelo id, repassa o progresso e as mensagens sem id', async () => {
        const { workers, heard, supervisor } = setup()
        const progress: unknown[]            = []
        const first                          = supervisor.request<string>({ type: 'a' }, value => progress.push(value))
        const second                         = supervisor.request<string>({ type: 'b' })
        const [a, b]                         = workers[0].sent

        workers[0].reply({ type: 'progress' } as Reply)
        workers[0].reply({ id: a.id, progress: 1 })
        workers[0].reply({ id: b.id, result: 'segundo' })
        workers[0].reply({ id: a.id, result: 'primeiro' })

        expect(workers).toHaveLength(1)
        expect(await first).toBe('primeiro')
        expect(await second).toBe('segundo')
        expect(progress).toEqual([1])
        expect(heard).toEqual([{ type: 'progress' }])
    })

    it('erro do trabalho devolve nulo com a causa, encerra o worker e o pedido seguinte cria outro', async () => {
        const { workers, supervisor } = setup()
        const failed                  = supervisor.request({ type: 'a' })
        workers[0].reply({ id: workers[0].sent[0].id, error: 'RuntimeError: unreachable' })

        expect(await failed).toBeNull()
        expect(supervisor.failure).toContain('RuntimeError: unreachable')
        expect(workers[0].terminated).toBe(true)

        const again = supervisor.request<number>({ type: 'b' })
        workers[1].reply({ id: workers[1].sent[0].id, result: 7 })
        expect(await again).toBe(7)
    })

    it('erro do próprio worker resolve todos os pedidos em aberto', async () => {
        const { workers, supervisor } = setup()
        const pending                 = [supervisor.request({ type: 'a' }), supervisor.request({ type: 'b' })]
        const prevented               = vi.fn()
        workers[0].onerror?.({ message: 'out of memory', preventDefault: prevented })

        expect(await Promise.all(pending)).toEqual([null, null])
        expect(supervisor.failure).toContain('out of memory')
        expect(prevented).toHaveBeenCalled()
        expect(supervisor.worker).toBeNull()
    })

    it('silêncio além do limite reinicia o worker; progresso e mensagens sem id contam como vida', async () => {
        vi.useFakeTimers()
        const { workers, supervisor } = setup()
        const slow                    = supervisor.request({ type: 'a' })
        const { id }                  = workers[0].sent[0]

        vi.advanceTimersByTime(IDLE - 1)
        workers[0].reply({ id, progress: 1 })
        vi.advanceTimersByTime(IDLE - 1)
        workers[0].reply({ type: 'ready' } as Reply)
        vi.advanceTimersByTime(IDLE - 1)
        expect(workers[0].terminated).toBe(false)

        vi.advanceTimersByTime(1)
        expect(await slow).toBeNull()
        expect(workers[0].terminated).toBe(true)
        expect(supervisor.failure).toContain('sem responder')
    })

    it('sem pedido em aberto não há vigia; parar cancela com a causa vazia e é idempotente', async () => {
        vi.useFakeTimers()
        const { workers, supervisor } = setup()
        supervisor.start()
        vi.advanceTimersByTime(10 * IDLE)
        expect(workers[0].terminated).toBe(false)

        const canceled = supervisor.request({ type: 'a' })
        supervisor.stop()
        supervisor.stop()
        expect(await canceled).toBeNull()
        expect(supervisor.failure).toBe('')
        workers[0].reply({ id: workers[0].sent[0].id, result: 'tarde' })
        expect(supervisor.pending.size).toBe(0)
    })
})
