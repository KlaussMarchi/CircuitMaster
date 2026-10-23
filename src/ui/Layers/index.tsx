import { useState } from 'react'
import { Icon } from '../Icon'
import { useStore, type View } from '../Store'
import { t } from '../../core/Text'

// PCB COM AS CORES DO ALTIUM, SÓ NA TELA (O ARQUIVO E AS EXPORTAÇÕES GUARDAM AS DO FRITZING): COBRE DE CIMA VERMELHO, DE BAIXO AZUL, PAD PASSANTE PRATA, SERIGRAFIA AMARELA, PLACA PRETA
export const ALTIUM: Record<string, string> = { copper1: '#ff3030', copper0: '#3d5cff', silkscreen: '#ffff00', silkscreen0: '#9a9a00', groundplane1: '#a81c1c', groundplane: '#25349e', board: '#000000' }

type Group = [string, string, string[], string]

const SOFT = 'var(--soft)'    // FORA DA PCB A CAMADA NÃO TEM COR PRÓPRIA NA TELA

// GRUPOS DE CAMADAS DE CADA VISTA NA LEGENDA E NO MENU, COM AS CAMADAS DO FRITZING DE CADA UM E A COR DA TELA (View › ‹nome› Layer)
export const LAYER_GROUPS: Record<View, Group[]> = {
    breadboardView: [
        ['board', 'Protoboards', ['breadboardbreadboard'], SOFT],
        ['parts', 'Peças', ['breadboard'], SOFT],
        ['wires', 'Fios', ['breadboardWire'], SOFT],
        ['labels', 'Rótulos das peças', ['breadboardLabel'], SOFT],
        ['rats', 'Ratsnest', ['breadboardRatsnest'], SOFT],
        ['notes', 'Notas', ['breadboardNote'], SOFT],
        ['rulers', 'Réguas', ['breadboardRuler'], SOFT]
    ],
    schematicView: [
        ['frame', 'Moldura', ['schematicframe'], SOFT],
        ['parts', 'Peças', ['schematic'], SOFT],
        ['text', 'Texto', ['schematicText'], SOFT],
        ['wires', 'Fios', ['schematicWire', 'schematicTrace'], SOFT],
        ['labels', 'Rótulos das peças', ['schematicLabel'], SOFT],
        ['rats', 'Ratsnest', ['schematicRatsnest'], SOFT],
        ['notes', 'Notas', ['schematicNote'], SOFT],
        ['rulers', 'Réguas', ['schematicRuler'], SOFT]
    ],
    pcbView: [
        ['top', 'Cobre de cima', ['copper1', 'copper1trace', 'groundplane1'], ALTIUM.copper1],
        ['bottom', 'Cobre de baixo', ['copper0', 'copper0trace', 'groundplane'], ALTIUM.copper0],
        ['silk', 'Serigrafia de cima', ['silkscreen', 'silkscreenLabel'], ALTIUM.silkscreen],
        ['silk0', 'Serigrafia de baixo', ['silkscreen0', 'silkscreen0Label'], ALTIUM.silkscreen0],
        ['board', 'Placa', ['board'], ALTIUM.board],
        ['image', 'Imagem das peças', ['partimage'], '#8a8a8a'],
        ['rats', 'Ratsnest', ['ratsnest'], '#9be7c4'],
        ['notes', 'Notas', ['pcbNote'], SOFT],
        ['rulers', 'Réguas', ['pcbRuler'], SOFT]
    ]
}

// CAMADA QUE LEVA OS RÓTULOS E A DO RATSNEST EM CADA VISTA (NA PCB O RÓTULO É SERIGRAFIA)
export const LABEL_PLANE: Record<View, string> = { breadboardView: 'breadboardLabel', schematicView: 'schematicLabel', pcbView: 'silkscreen' }
export const RAT_PLANE: Record<View, string>   = { breadboardView: 'breadboardRatsnest', schematicView: 'schematicRatsnest', pcbView: 'ratsnest' }

// CAMADAS DO FRITZING OCULTAS PELOS GRUPOS DESLIGADOS DA VISTA
export const hiddenPlanes = (view: View, groups: string[]) => new Set(LAYER_GROUPS[view].filter(([id]) => groups.includes(id)).flatMap(([, , layers]) => layers))

// LEGENDA DAS CAMADAS NO CANTO DO QUADRO: UM CLIQUE NA CAMADA LIGA OU DESLIGA, SEM DIÁLOGO; FORA DA PCB COMEÇA RECOLHIDA
export const Layers = () => {
    const view            = useStore(state => state.view)
    const hidden          = useStore(state => state.hiddenLayers[state.view]) ?? []
    const [open, setOpen] = useState(view === 'pcbView')
    const { toggleLayer } = useStore.getState()
    const groups          = LAYER_GROUPS[view]

    return (
        <div className="layers-legend" role="group" aria-label={t('Camadas')}>
            <button className="layers-head" aria-expanded={open} title={open ? t('Recolher a legenda') : t('Mostrar a legenda das camadas')} onClick={() => setOpen(!open)}><Icon name="layers" /><span>{t('Camadas')}</span>{hidden.length > 0 && <span className="muted num">{groups.length - hidden.length}/{groups.length}</span>}</button>
            {open && groups.map(([id, label, , color]) => (
                <button key={id} className="layer" aria-pressed={!hidden.includes(id)} title={t(hidden.includes(id) ? 'Mostrar {0}' : 'Ocultar {0}', t(label).toLowerCase())} onClick={() => toggleLayer(id)}>
                    <span className="dot-s" style={{ background: hidden.includes(id) ? 'transparent' : color, borderColor: color }} />{t(label)}
                </button>
            ))}
        </div>
    )
}
