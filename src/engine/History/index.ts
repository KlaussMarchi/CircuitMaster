import type { Doc } from '../../core/Document'
import type { Instance } from '../../core/Sketch'
import { nameOf } from '../../core/Properties'

const WIRE  = 'WireModuleID'
const NAMED = 3    // TÍTULOS NO RÓTULO ANTES DE "+N"

const names = (instances: Instance[]) => `${instances.slice(0, NAMED).map(instance => instance.title).join(', ')}${instances.length > NAMED ? ` +${instances.length - NAMED}` : ''}`

const parts = (instances: Instance[]) => instances.filter(instance => instance.moduleIdRef !== WIRE)

const wires = (instances: Instance[]) => instances.filter(instance => instance.moduleIdRef === WIRE)

const transforms = (instance: Instance) => Object.values(instance.views).map(state => state.geometry.transform ?? [1, 0, 0, 1, 0, 0])

const handedness = ([a, b, c, d]: number[]) => Math.sign(a * d - b * c)

const mirrored = (old: Instance, next: Instance) => {
    const after = transforms(next)
    return transforms(old).some((matrix, i) => handedness(matrix) !== handedness(after[i] ?? matrix))
}

// RÓTULO DE UM PASSO DO HISTÓRICO DE DESFAZER PELA DIFERENÇA ENTRE OS DOIS DOCUMENTOS (O DOCK UNDO HISTORY DO FRITZING NOMEIA CADA AÇÃO)
export const describeChange = (before: Doc, after: Doc) => {
    const ids      = [...new Set([...Object.keys(before.instances), ...Object.keys(after.instances)])]
    const added    = ids.filter(id => !before.instances[id]).map(id => after.instances[id])
    const removed  = ids.filter(id => !after.instances[id]).map(id => before.instances[id])
    const changed  = ids.filter(id => before.instances[id] && after.instances[id] && before.instances[id] !== after.instances[id]).map(id => [before.instances[id], after.instances[id]] as const)
    const renamed  = changed.find(([old, next]) => old.title !== next.title)
    const property = changed.flatMap(([old, next]) => Object.keys({ ...old.properties, ...next.properties }).filter(key => old.properties[key] !== next.properties[key]).map(key => [key, next] as const))[0]
    const moved    = parts(changed.map(([, next]) => next))
    const turned   = changed.filter(([old, next]) => next.moduleIdRef !== WIRE && JSON.stringify(transforms(old)) !== JSON.stringify(transforms(next)))

    if (parts(added).length)
        return `adicionou ${names(parts(added))}`

    if (parts(removed).length)
        return `apagou ${names(parts(removed))}`

    if (wires(added).length)
        return wires(removed).length ? 'refez fios' : 'desenhou fio'

    if (wires(removed).length)
        return 'apagou fio'

    if (renamed)
        return `renomeou ${renamed[0].title} para ${renamed[1].title}`

    if (property)
        return `mudou ${nameOf(property[0]).toLowerCase()} de ${property[1].title}`

    if (turned.length)
        return `${turned.some(([old, next]) => mirrored(old, next)) ? 'espelhou' : 'girou'} ${names(turned.map(([, next]) => next))}`

    if (moved.length)
        return `moveu ${names(moved)}`

    if (changed.length)
        return 'ajustou fio'

    if (before.edges !== after.edges)
        return 'mudou ligações'

    if (before.probes !== after.probes)
        return after.probes.length > before.probes.length ? 'pôs ponta de prova' : after.probes.length < before.probes.length ? 'tirou ponta de prova' : 'moveu ponta de prova'

    return 'mudou ajustes do projeto'
}
