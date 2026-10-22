import { SAVES, type Vault } from '../Vault'
import { t } from '../../core/Text'

export type Version = { id: string, session: string, sheet?: string, name: string, time: number, dirty: boolean, count: number, bytes: Uint8Array }
export type Snapshot = Omit<Version, 'id' | 'session' | 'sheet' | 'time'>

const DELAY_MS   = 1500         // DEPOIS DA ÚLTIMA MUDANÇA, ANTES DE GRAVAR
const VERSION_MS = 60000        // UMA VERSÃO NOVA NO HISTÓRICO A CADA MINUTO DE EDIÇÃO; ENTRE ELAS A MAIS RECENTE É REGRAVADA
const KEEP       = 20           // VERSÕES GUARDADAS NO TOTAL
const LOCK       = 'circuitmaster-session-'

const streamOf = (version: Version) => `${version.session}/${version.sheet ?? ''}`

// SALVAMENTO AUTOMÁTICO NO INDEXEDDB: CADA ABA DO NAVEGADOR É UMA SESSÃO QUE SEGURA UM WEB LOCK ENQUANTO VIVE, COM UMA SEQUÊNCIA DE VERSÕES POR SKETCH ABERTO; SÓ O TRABALHO NÃO SALVO DE SESSÕES MORTAS É OFERECIDO PARA RECUPERAR
export class Autosave {
    vault: Vault
    session = crypto.randomUUID()
    timer: ReturnType<typeof setTimeout> | undefined = undefined
    pending = new Map<string, () => Promise<Snapshot | string>>()
    current = new Map<string, { version: Version, since: number }>()
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

    schedule(sheet: string, snapshot: () => Promise<Snapshot | string>) {
        clearTimeout(this.timer)
        this.pending.set(sheet, snapshot)
        this.timer = setTimeout(() => void this.flush(), DELAY_MS)
    }

    // GRAVA JÁ O QUE ESTÁ AGENDADO (ABA ESCONDIDA OU FECHANDO), UM SKETCH POR VEZ; A MESMA FALHA SÓ É AVISADA UMA VEZ; DEVOLVE O MOTIVO SE NÃO GRAVOU
    async flush() {
        const pending = [...this.pending]
        clearTimeout(this.timer)
        this.pending.clear()
        let failed = ''

        for (const [sheet, snapshot] of pending)
            failed = await this.write(sheet, await snapshot()) || failed

        if (failed && failed !== this.failure)
            this.report(t('salvamento automático parado: {0}; salve o arquivo para não perder o trabalho', failed))

        this.failure = pending.length ? failed : this.failure
        return failed || null
    }

    // UMA VERSÃO NOVA POR MINUTO DE EDIÇÃO DE CADA SKETCH; ENTRE ELAS A MAIS RECENTE É REGRAVADA
    async write(sheet: string, taken: Snapshot | string) {
        if (typeof taken === 'string')
            return taken

        const time    = Date.now()
        const last    = this.current.get(sheet)
        const recent  = last && time - last.since < VERSION_MS ? last : null
        const id      = recent?.version.id ?? `${String(time).padStart(15, '0')}-${this.session}-${sheet}`
        const kept    = [...this.own.filter(other => other !== id), id]
        const removed = kept.slice(0, Math.max(0, kept.length - KEEP))
        const version = { ...taken, id, session: this.session, sheet, time }
        const failed  = await this.vault.save(SAVES, [[id, version]], removed)

        if (!failed) {
            this.current.set(sheet, { version, since: recent?.since ?? time })
            this.own = kept.slice(removed.length)
        }

        return failed
    }

    // SKETCH FECHADO DE PROPÓSITO: O QUE ESTAVA AGENDADO SAI E A ÚLTIMA VERSÃO FICA NO HISTÓRICO SEM SER OFERECIDA PARA RECUPERAR
    async close(sheet: string) {
        const last = this.current.get(sheet)?.version
        this.pending.delete(sheet)
        this.current.delete(sheet)
        return last?.dirty ? this.vault.save(SAVES, [[last.id, { ...last, dirty: false }]], []) : null
    }

    async getVersions() {
        return (await this.vault.load<Version>(SAVES)).sort((a, b) => b.time - a.time)
    }

    // VERSÕES DAS SESSÕES MORTAS CUJA ÚLTIMA GRAVAÇÃO FICOU COM ALTERAÇÕES NÃO SALVAS, A MAIS NOVA PRIMEIRO
    async getRecoverable() {
        const versions = await this.getVersions()
        const held     = await navigator.locks?.query().then(state => new Set((state.held ?? []).map(lock => lock.name)), () => new Set<string>()) ?? new Set<string>()
        const latest   = new Map<string, Version>()
        versions.forEach(version => latest.has(streamOf(version)) || latest.set(streamOf(version), version))
        const dead     = [...latest.values()].filter(version => version.session !== this.session && version.dirty && !held.has(`${LOCK}${version.session}`)).map(streamOf)
        return versions.filter(version => dead.includes(streamOf(version)) && version.bytes.length)
    }

    // SESSÕES MORTAS RECUPERADAS OU DESCARTADAS: A VERSÃO MAIS NOVA DE CADA UMA PASSA A LIMPA E NÃO É MAIS OFERECIDA; O QUE PASSA DAS KEEP MAIS NOVAS É APAGADO
    async dismiss(versions: Version[]) {
        const all     = await this.getVersions()
        const ended   = new Set(versions.map(streamOf))
        const latest  = all.filter(version => ended.has(streamOf(version))).filter((version, i, list) => list.findIndex(other => streamOf(other) === streamOf(version)) === i)
        const removed = all.slice(KEEP).map(version => version.id)
        return this.vault.save(SAVES, latest.map(version => [version.id, { ...version, dirty: false }]), removed)
    }
}
