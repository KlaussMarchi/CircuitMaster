import { useState } from 'react'
import { Icon } from '../Icon'
import { useStore } from '../Store'
import { t } from '../../core/Text'

// PCB COM AS CORES DO ALTIUM, SÓ NA TELA (O ARQUIVO E AS EXPORTAÇÕES GUARDAM AS DO FRITZING): COBRE DE CIMA VERMELHO, DE BAIXO AZUL, PAD PASSANTE PRATA, SERIGRAFIA AMARELA, PLACA PRETA
export const ALTIUM: Record<string, string> = { copper1: '#ff3030', copper0: '#3d5cff', silkscreen: '#ffff00', silkscreen0: '#9a9a00', groundplane1: '#a81c1c', groundplane: '#25349e', board: '#000000' }

// GRUPOS DE CAMADAS DA PCB NA LEGENDA, COM AS CAMADAS DO FRITZING DE CADA UM E A COR DA TELA
export const LAYER_GROUPS: [string, string, string[], string][] = [
    ['top', 'Cobre de cima', ['copper1', 'copper1trace', 'groundplane1'], ALTIUM.copper1],
    ['bottom', 'Cobre de baixo', ['copper0', 'copper0trace', 'groundplane'], ALTIUM.copper0],
    ['silk', 'Serigrafia de cima', ['silkscreen', 'silkscreenLabel'], ALTIUM.silkscreen],
    ['silk0', 'Serigrafia de baixo', ['silkscreen0', 'silkscreen0Label'], ALTIUM.silkscreen0],
    ['board', 'Placa', ['board'], ALTIUM.board],
    ['image', 'Imagem das peças', ['partimage'], '#8a8a8a'],
    ['rats', 'Ratsnest', ['ratsnest'], '#9be7c4']
]

// CAMADAS DO FRITZING OCULTAS PELOS GRUPOS DESLIGADOS
export const hiddenPlanes = (groups: string[]) => new Set(LAYER_GROUPS.filter(([id]) => groups.includes(id)).flatMap(([, , layers]) => layers))

// LEGENDA DAS CAMADAS NO CANTO DA PCB: UM CLIQUE NA CAMADA LIGA OU DESLIGA, SEM DIÁLOGO
export const Layers = () => {
    const hidden          = useStore(state => state.hiddenLayers)
    const [open, setOpen] = useState(true)
    const { toggleLayer } = useStore.getState()

    return (
        <div className="layers-legend" role="group" aria-label={t('Camadas da PCB')}>
            <button className="layers-head" aria-expanded={open} title={open ? t('Recolher a legenda') : t('Mostrar a legenda das camadas')} onClick={() => setOpen(!open)}><Icon name="layers" /><span>{t('Camadas')}</span>{hidden.length > 0 && <span className="muted num">{LAYER_GROUPS.length - hidden.length}/{LAYER_GROUPS.length}</span>}</button>
            {open && LAYER_GROUPS.map(([id, label, , color]) => (
                <button key={id} className="layer" aria-pressed={!hidden.includes(id)} title={t(hidden.includes(id) ? 'Mostrar {0}' : 'Ocultar {0}', t(label).toLowerCase())} onClick={() => toggleLayer(id)}>
                    <span className="dot-s" style={{ background: hidden.includes(id) ? 'transparent' : color, borderColor: color }} />{t(label)}
                </button>
            ))}
        </div>
    )
}
