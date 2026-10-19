import createNgspice from './ngspice/ngspice.js'
import { Ngspice } from '../../core/Ngspice'

const scope = self as unknown as { postMessage: (message: unknown, transfer: Transferable[]) => void, onmessage: ((event: MessageEvent) => void) | null }

const session = createNgspice().then(module => {
    const ngspice = new Ngspice(module)
    ngspice.setup()
    return ngspice
})

scope.onmessage = async ({ data }) => {
    const ngspice = await session
    const result  = ngspice.run(data.deck)
    scope.postMessage({ id: data.id, ...result }, Object.values(result.vectors).map(vector => vector.buffer))
}
