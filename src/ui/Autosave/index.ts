import { SAVES, type Vault } from '../Vault'

export type Version = { id: string, session: string, name: string, time: number, dirty: boolean, count: number, bytes: Uint8Array }
export type Snapshot = Omit<Version, 'id' | 'session' | 'time'>

const DELAY_MS   = 1500         // DEPOIS DA ÚLTIMA MUDANÇA, ANTES DE GRAVAR
const VERSION_MS = 60000        // UMA VERSÃO NOVA NO HISTÓRICO A CADA MINUTO DE EDIÇÃO; ENTRE ELAS A MAIS RECENTE É REGRAVADA
const KEEP       = 20           // VERSÕES GUARDADAS NO TOTAL
const LOCK       = 'circuitmaster-session-'

// SALVAMENTO AUTOMÁTICO NO INDEXEDDB: CADA ABA É UMA SESSÃO QUE SEGURA UM WEB LOCK ENQUANTO VIVE; SÓ O TRABALHO NÃO SALVO DE SESSÕES MORTAS É OFERECIDO PARA RECUPERAR
export class Autosave {
    vault: Vault
    session = crypto.randomUUID()
    timer: ReturnType<typeof setTimeout> | undefined = undefined
    snapshot: (() => Promise<Snapshot | string>) | null = null
    current: { id: string, time: number } | null = null
    own: string[] = []
    failure = ''
    report: (message: string) => void

    constructor(vault: Vault, report: (message: string) => void) {
        this.vault  = vault
        this.report = report
    }

    setup() {
        void navigator.locks?.request(`${LOCK}${this.session}`, () => new Promise(() => {}))
    }

    schedule(snapshot: () => Promise<Snapshot | string>) {
        clearTimeout(this.timer)
        this.snapshot = snapshot
        this.timer    = setTimeout(() => void this.flush(), DELAY_MS)
    }

    // GRAVA JÁ O QUE ESTÁ AGENDADO (ABA ESCONDIDA OU FECHANDO); A MESMA FALHA SÓ É AVISADA UMA VEZ; DEVOLVE O MOTIVO SE NÃO GRAVOU
    async flush() {
        const snapshot = this.snapshot
        clearTimeout(this.timer)
        this.snapshot = null

        if (!snapshot)
            return null

        const taken   = await snapshot()
        const time    = Date.now()
        const recent  = this.current && time - this.current.time < VERSION_MS ? this.current : null
        const id      = recent?.id ?? `${String(time).padStart(15, '0')}-${this.session}`
        const kept    = [...this.own.filter(other => other !== id), id]
        const removed = kept.slice(0, Math.max(0, kept.length - KEEP))
        const failed  = typeof taken === 'string' ? taken : await this.vault.save(SAVES, [[id, { ...taken, id, session: this.session, time }]], removed) ?? ''

        if (typeof taken !== 'string') {
            this.current = recent ?? { id, time }
            this.own     = kept.slice(removed.length)
        }

        if (failed && failed !== this.failure)
            this.report(`salvamento automático parado: ${failed}; salve o arquivo para não perder o trabalho`)

        this.failure = failed
        return failed || null
    }

    async getVersions() {
        return (await this.vault.load<Version>(SAVES)).sort((a, b) => b.time - a.time)
    }

    // VERSÕES DAS SESSÕES MORTAS CUJA ÚLTIMA GRAVAÇÃO FICOU COM ALTERAÇÕES NÃO SALVAS, A MAIS NOVA PRIMEIRO
    async getRecoverable() {
        const versions = await this.getVersions()
        const held     = await navigator.locks?.query().then(state => new Set((state.held ?? []).map(lock => lock.name)), () => new Set<string>()) ?? new Set<string>()
        const latest   = new Map<string, Version>()
        versions.forEach(version => latest.has(version.session) || latest.set(version.session, version))
        const dead     = [...latest.values()].filter(version => version.session !== this.session && version.dirty && !held.has(`${LOCK}${version.session}`)).map(version => version.session)
        return versions.filter(version => dead.includes(version.session) && version.bytes.length)
    }

    // SESSÕES MORTAS RECUPERADAS OU DESCARTADAS: A VERSÃO MAIS NOVA DE CADA UMA PASSA A LIMPA E NÃO É MAIS OFERECIDA; O QUE PASSA DAS KEEP MAIS NOVAS É APAGADO
    async dismiss(versions: Version[]) {
        const all     = await this.getVersions()
        const ended   = new Set(versions.map(version => version.session))
        const latest  = all.filter(version => ended.has(version.session)).filter((version, i, list) => list.findIndex(other => other.session === version.session) === i)
        const removed = all.slice(KEEP).map(version => version.id)
        return this.vault.save(SAVES, latest.map(version => [version.id, { ...version, dirty: false }]), removed)
    }
}
