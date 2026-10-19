import type { Run } from '../../core/Ngspice'

const TIMEOUT = 15000    // MS ATÉ CONSIDERAR O NGSPICE TRAVADO (SPEC 04 §6)

// CLIENTE DO WORKER DO NGSPICE: UMA SIMULAÇÃO POR VEZ, COM TEMPO-LIMITE QUE RECRIA O WORKER
export class Simulator {
    worker: Worker | null = null
    next = 0

    start() {
        if (!this.worker)
            this.worker = new Worker(new URL('../../workers/Simulator/index.ts', import.meta.url), { type: 'module' })

        return this.worker
    }

    stop() {
        this.worker?.terminate()
        this.worker = null
    }

    run(deck: string) {
        const worker = this.start()
        const id     = this.next++

        return new Promise<Run>(resolve => {
            const timer = setTimeout(() => {
                this.stop()
                resolve({ vectors: {}, log: [], error: `a simulação passou de ${TIMEOUT / 1000} s e foi interrompida` })
            }, TIMEOUT)

            const listen = ({ data }: MessageEvent) => {
                if (data.id !== id)
                    return

                clearTimeout(timer)
                worker.removeEventListener('message', listen)
                resolve(data)
            }

            worker.addEventListener('message', listen)
            worker.postMessage({ id, deck })
        })
    }
}
