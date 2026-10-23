import { t } from '../../core/Text'

const DB_NAME    = 'circuitmaster-user'
const DB_VERSION = 2    // 2: ARQUIVOS RECENTES

export const PARTS  = 'parts'       // ARQUIVOS DAS PEÇAS DE PACOTE E DO EDITOR, PELO NOME DO ARQUIVO
export const SAVES  = 'autosave'    // VERSÕES DO SKETCH GRAVADAS SOZINHAS, PELO id
export const RECENT = 'recent'      // CÓPIA DOS ÚLTIMOS ARQUIVOS ABERTOS OU SALVOS, PELO NOME

const STORES = [PARTS, SAVES, RECENT]

const settle = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror   = () => reject(request.error)
})

const reason = (error: unknown) => error instanceof DOMException ? (error.name === 'QuotaExceededError' ? t('o armazenamento do navegador está cheio') : `${error.name}: ${error.message}`) : String(error)

// DADOS DO USUÁRIO NO INDEXEDDB, QUE CABE MUITO MAIS QUE OS 5 MB DO localStorage; FALHA DE ARMAZENAMENTO (COTA, BLOQUEIO, ABA PRIVADA) VOLTA COMO MOTIVO, NUNCA COMO EXCEÇÃO
export class Vault {
    db: Promise<IDBDatabase | null> | null = null
    failure = ''

    connect() {
        if (this.db)
            return this.db

        const opening = new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION)
            request.onupgradeneeded = () => STORES.filter(store => !request.result.objectStoreNames.contains(store)).forEach(store => request.result.createObjectStore(store))
            request.onsuccess       = () => {
                request.result.onversionchange = () => {    // OUTRA ABA ABRIU UMA VERSÃO NOVA DO BANCO: ESTA SOLTA A SUA E RECONECTA NO PRÓXIMO USO
                    request.result.close()
                    this.db = null
                }
                resolve(request.result)
            }
            request.onerror         = () => reject(request.error)
            request.onblocked       = () => reject(new DOMException(t('outra aba segura uma versão antiga do banco'), 'BlockedError'))
        })

        this.db = opening.catch(error => {
            this.failure = reason(error)
            return null
        })

        return this.db
    }

    async load<T>(store: string): Promise<T[]> {
        const db = await this.connect()

        try {
            return db ? await settle(db.transaction(store, 'readonly').objectStore(store).getAll()) as T[] : []
        } catch (error) {
            this.failure = reason(error)
            return []
        }
    }

    // GRAVA E APAGA NUMA TRANSAÇÃO SÓ; DEVOLVE O MOTIVO SE NÃO GRAVOU
    async save(store: string, entries: [IDBValidKey, unknown][], removed: IDBValidKey[] = []) {
        const db = await this.connect()

        if (!db)
            return this.failure || t('o armazenamento do navegador está indisponível')

        try {
            const transaction = db.transaction(store, 'readwrite')
            const done        = new Promise<void>((resolve, reject) => {
                transaction.oncomplete = () => resolve()
                transaction.onabort    = () => reject(transaction.error)
                transaction.onerror    = () => reject(transaction.error)
            })
            entries.forEach(([key, value]) => transaction.objectStore(store).put(value, key))
            removed.forEach(key => transaction.objectStore(store).delete(key))
            await done
            return null
        } catch (error) {
            return reason(error)
        }
    }
}
