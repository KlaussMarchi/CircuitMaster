import { describe, expect, it } from 'vitest'
import { emptyDoc, keyOf } from '../src/core/Document'
import { VIEWS } from '../src/core/Layer'
import type { Point } from '../src/core/Geometry'
import { createInstance, createWire, deleteItems, flipInstances, moveInstances, rotateInstances, setProperty, setTitle } from '../src/engine/Edit'
import { describeChange } from '../src/engine/History'
import { HAS_FRITZING, makeLibrary } from './Fixtures'

const everywhere = (point: Point) => Object.fromEntries(VIEWS.map(view => [view, point])) as Record<typeof VIEWS[number], Point>

describe.skipIf(!HAS_FRITZING)('rótulos do histórico de desfazer (fase 1)', () => {
    it('nomeia adicionar, ligar, mover, mudar valor, renomear e apagar', async () => {
        const library = makeLibrary()
        await library.load(['ResistorModuleID', 'WireModuleID'])
        const one     = createInstance(emptyDoc(), library, 'ResistorModuleID', everywhere([0, 0]))
        const two     = createInstance(one, library, 'ResistorModuleID', everywhere([300, 0]))
        const wired   = createWire(two, library, 'breadboardView', keyOf('1', 'connector1'), keyOf('2', 'connector0'))
        const moved   = moveInstances(wired, library, 'breadboardView', ['2'], 40, 0)
        const valued  = setProperty(moved, '1', 'resistance', '4.7kΩ')
        const titled  = setTitle(valued, '1', 'Rcarga')
        const gone    = deleteItems(titled, library, 'breadboardView', ['2'], false)

        expect(describeChange(emptyDoc(), one)).toBe('adicionou R1')
        expect(describeChange(two, wired)).toBe('desenhou fio')
        expect(describeChange(wired, moved)).toBe('moveu R2')
        expect(describeChange(moved, valued)).toBe('mudou resistência de R1')
        expect(describeChange(valued, titled)).toBe('renomeou R1 para Rcarga')
        expect(describeChange(titled, gone)).toBe('apagou R2')
        expect(describeChange(gone, rotateInstances(gone, library, 'schematicView', ['1'], 90))).toBe('girou Rcarga')
        expect(describeChange(gone, flipInstances(gone, library, 'schematicView', ['1'], true))).toBe('espelhou Rcarga')
        expect(describeChange(titled, { ...titled, settings: { breadboardView: { gridSize: '0.2in' } } })).toBe('mudou ajustes do projeto')
    })
})
