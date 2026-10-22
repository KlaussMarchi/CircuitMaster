export const scope = self as unknown as { postMessage: (message: unknown, transfer?: Transferable[]) => void, onmessage: ((event: MessageEvent) => void) | null }

// CADA PEDIDO RESPONDE PELO SEU id COM O RESULTADO, O PROGRESSO OU O ERRO DO TRABALHO (WASM ABORTADO, MOTOR QUE FALHA): NENHUM PEDIDO FICA SEM RESPOSTA
export const serve = <T,>(handle: (data: T, progress: (progress: unknown) => void) => unknown, transferOf: (result: never) => Transferable[] = () => []) => {
    scope.onmessage = async ({ data }) => {
        const id = (data as { id: number }).id

        try {
            const result = await handle(data as T, progress => scope.postMessage({ id, progress }))
            scope.postMessage({ id, result }, transferOf(result as never))
        } catch (error) {
            scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
        }
    }
}
