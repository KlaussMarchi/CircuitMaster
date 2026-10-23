import { useEffect, useMemo, useState } from 'react'
import { fitsFilters } from '../../core/KicadDraw'
import type { Part } from '../../core/Part'
import { Entry } from '../Inspector'
import { useStore } from '../Store'
import { t } from '../../core/Text'

// FOOTPRINT DA PEÇA DO KICAD: OS DA BIBLIOTECA QUE CASAM COM OS FILTROS DO SÍMBOLO; ESCOLHER UM TROCA A PEÇA PELA MESMA COM ESSE FOOTPRINT, MANTENDO OS FIOS (KP-146, SPEC 08 §4)
export const FootprintField = ({ modelIndex, part }: { modelIndex: string, part: Part }) => {
    const [all, setAll] = useState<string[]>([])
    const filters       = part.properties['footprint filters'] ?? ''
    const options       = useMemo(() => all.filter(field => fitsFilters(field, filters)), [all, filters])

    useEffect(() => {
        let live = true
        void useStore.getState().catalog.footprints().then(list => live && setAll(list))
        return () => {
            live = false
        }
    }, [])

    const choose = (text: string) => {
        const field = text.trim()

        if (!all.includes(field))
            return useStore.setState({ message: t('{0}: footprint não encontrado na biblioteca', field) })

        void useStore.getState().swap(modelIndex, `${part.moduleId.replace(/@.*$/, '')}@${field}`)
    }

    return <Entry value={part.properties.footprint ?? ''} options={options} numeric={false} commit={choose} />
}
