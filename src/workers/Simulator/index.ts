import createNgspice from './ngspice/ngspice.js'
import { Ngspice, type Run } from '../../core/Ngspice'
import { serve } from '../Serve'

const session = createNgspice().then(module => {
    const ngspice = new Ngspice(module)
    ngspice.setup()
    return ngspice
})

session.catch(() => {})    // A FALHA AO CARREGAR CHEGA A CADA PEDIDO PELO await, NÃO COMO REJEIÇÃO SEM DONO

serve<{ deck: string }>(async ({ deck }) => (await session).run(deck), (run: Run) => Object.values(run.vectors).map(vector => vector.buffer))
