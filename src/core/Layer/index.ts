export const VIEWS = ['breadboardView', 'schematicView', 'pcbView'] as const

export type ViewName = typeof VIEWS[number] | 'iconView'

// fab (MONTAGEM) E courtyard (ÁREA DA PEÇA) SÃO DO CIRCUITMASTER, SÓ DE DOCUMENTAÇÃO: NO FIM PARA NÃO MUDAR O z DAS CAMADAS DO FRITZING
export const VIEW_LAYERS: Record<ViewName, string[]> = {
    iconView: ['icon'],
    breadboardView: ['breadboardbreadboard', 'breadboard', 'breadboardWire', 'breadboardLabel', 'breadboardRatsnest', 'breadboardNote', 'breadboardRuler'],
    schematicView: ['schematicframe', 'schematic', 'schematicText', 'schematicWire', 'schematicTrace', 'schematicLabel', 'schematicNote', 'schematicRuler'],
    pcbView: ['board', 'groundplane', 'silkscreen0', 'silkscreen0Label', 'copper0', 'copper0trace', 'groundplane1', 'copper1', 'copper1trace', 'ratsnest', 'silkscreen', 'silkscreenLabel', 'partimage', 'pcbNote', 'pcbRuler', 'fab', 'courtyard']
}

export const KNOWN_LAYERS = new Set(Object.values(VIEW_LAYERS).flat())

export const PCB_NON_COPPER = new Set(['silkscreen0', 'silkscreen0Label', 'silkscreen', 'silkscreenLabel', 'fab', 'courtyard', 'partimage'])

export const VIEW_LABELS: Record<typeof VIEWS[number], string> = {
    breadboardView: 'Protoboard',
    schematicView: 'Esquemático',
    pcbView: 'PCB'
}

export const VIEW_BACKGROUNDS: Record<typeof VIEWS[number], string> = { breadboardView: '#ffffff', schematicView: '#ffffff', pcbView: '#333333' }    // ratsnestcolors.xml DO FRITZING

export const getLayerZ = (view: ViewName, layer: string) => 1.5 + Math.max(0, VIEW_LAYERS[view].indexOf(layer))

// PEÇA NA FACE DE BAIXO: COBRE E SERIGRAFIA DE UMA FACE VÃO PARA A OUTRA (O FRITZING TROCA AS CAMADAS AO ESPELHAR O SVG)
const FLIPPED: Record<string, string> = { copper0: 'copper1', copper1: 'copper0', silkscreen: 'silkscreen0', silkscreen0: 'silkscreen' }

export const flipLayer = (layer: string, bottom: boolean) => bottom ? FLIPPED[layer] ?? layer : layer
