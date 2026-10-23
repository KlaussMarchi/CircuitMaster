export const VIEWS = ['breadboardView', 'schematicView', 'pcbView'] as const

export type ViewName = typeof VIEWS[number] | 'iconView'

export const VIEW_LAYERS: Record<ViewName, string[]> = {
    iconView: ['icon'],
    breadboardView: ['breadboardbreadboard', 'breadboard', 'breadboardWire', 'breadboardLabel', 'breadboardRatsnest', 'breadboardNote', 'breadboardRuler'],
    schematicView: ['schematicframe', 'schematic', 'schematicText', 'schematicWire', 'schematicTrace', 'schematicLabel', 'schematicNote', 'schematicRuler'],
    pcbView: ['board', 'groundplane', 'silkscreen0', 'silkscreen0Label', 'copper0', 'copper0trace', 'groundplane1', 'copper1', 'copper1trace', 'ratsnest', 'silkscreen', 'silkscreenLabel', 'partimage', 'pcbNote', 'pcbRuler']
}

export const KNOWN_LAYERS = new Set(Object.values(VIEW_LAYERS).flat())

export const PCB_NON_COPPER = new Set(['silkscreen0', 'silkscreen0Label', 'silkscreen', 'silkscreenLabel', 'partimage'])

export const VIEW_LABELS: Record<typeof VIEWS[number], string> = {
    breadboardView: 'Protoboard',
    schematicView: 'Esquemático',
    pcbView: 'PCB'
}

export const VIEW_BACKGROUNDS: Record<typeof VIEWS[number], string> = { breadboardView: '#ffffff', schematicView: '#ffffff', pcbView: '#333333' }    // ratsnestcolors.xml DO FRITZING

export const getLayerZ = (view: ViewName, layer: string) => 1.5 + Math.max(0, VIEW_LAYERS[view].indexOf(layer))
