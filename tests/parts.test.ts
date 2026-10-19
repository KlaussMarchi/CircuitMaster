import { describe, expect, it } from 'vitest'
import { readPart } from '../src/core/Part'
import { readBin } from '../src/core/Sketch'
import { HAS_FRITZING, listParts, readText } from './Fixtures'

describe.skipIf(!HAS_FRITZING)('acervo de peças', () => {
    const files = listParts()
    const parts = files.map(file => readPart(readText(file.root, file.path), file.root === 'app'))

    it('lê todos os .fzp sem erro', () => {
        expect(files.length).toBe(2619)
        expect(parts.filter(Boolean).length).toBe(files.length)
    })

    it('reproduz o censo de conectores e barramentos da spec 01 §2.1', () => {
        const connectors = parts.reduce((sum, part) => sum + (part?.connectors.length ?? 0), 0)
        const buses      = parts.reduce((sum, part) => sum + (part?.buses.length ?? 0), 0)
        expect(connectors).toBe(47890)
        expect(buses).toBe(3805)
    })

    it('normaliza cobre THT e SMD', () => {
        const resistor = parts.find(part => part?.moduleId === 'ResistorModuleID')
        const pins     = resistor?.connectors[0].views.pcbView?.map(pin => pin.layer)
        expect(resistor?.views.pcbView?.layers).toEqual(['copper0', 'copper1', 'silkscreen', 'silkscreen0'])
        expect(pins).toEqual(['copper0', 'copper1'])
        expect(parts.filter(part => part?.flippedSMD).length).toBeGreaterThan(0)
    })

    it('lê o bin principal com seções', () => {
        const bin = readBin(readText('parts', 'bins/core.fzb'))
        expect(bin?.title).toBe('Core Parts')
        expect(bin?.entries[0]).toEqual({ moduleIdRef: 'ResistorModuleID', section: 'Basic' })
    })
})
