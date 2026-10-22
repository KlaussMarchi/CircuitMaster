import type { Run } from '../../core/Ngspice'
import { Supervisor } from '../Supervisor'

const TIMEOUT = 15000    // MS ATÉ CONSIDERAR O NGSPICE TRAVADO (SPEC 04 §6)

// WORKER DO NGSPICE VIGIADO: UMA SIMULAÇÃO POR VEZ; TEMPO-LIMITE, ERRO OU MORTE DO WORKER VIRAM O ERRO DA SIMULAÇÃO E O PRÓXIMO PEDIDO O RECRIA
export class Simulator {
    supervisor = new Supervisor<{ deck: string }>(() => new Worker(new URL('../../workers/Simulator/index.ts', import.meta.url), { type: 'module' }), TIMEOUT)

    async run(deck: string): Promise<Run> {
        const run = await this.supervisor.request<Run>({ deck })
        return run ?? { vectors: {}, log: [], error: this.supervisor.failure ? `simulação interrompida: ${this.supervisor.failure}` : 'simulação cancelada' }
    }
}
