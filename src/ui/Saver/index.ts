import type { SaveRequest } from '../../workers/Saver'
import { Supervisor } from '../Supervisor'

const SAVE_IDLE = 60000    // MS SEM RESPOSTA DO WORKER QUE MONTA O .fzz

export const createSaver = () => new Supervisor<SaveRequest>(() => new Worker(new URL('../../workers/Saver/index.ts', import.meta.url), { type: 'module' }), SAVE_IDLE)
