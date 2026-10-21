import { childNamed, childrenNamed, childrenOf, parseXml, serializeXml, tagOf, textOf, type XmlElement } from '../Xml'
import { KNOWN_LAYERS, PCB_NON_COPPER, VIEW_LAYERS, type ViewName } from '../Layer'

export type Pin       = { layer: string, svgId: string, terminalId: string, legId: string, hybrid: boolean }
export type Connector = { id: string, name: string, type: string, description: string, views: Partial<Record<ViewName, Pin[]>>, ignore: string, erc: string }
export type PartView  = { image: string, layers: string[], sticky: string[], flipHorizontal: boolean, flipVertical: boolean }
export type Kind      = 'wire' | 'jumper' | 'logo' | 'copperFill' | 'blocker' | 'note' | 'symbol' | 'ruler' | 'via' | 'hole' | 'breadboard' | 'board' | 'resizableBoard' | 'part'

export type Part = {
    moduleId: string
    version: number
    title: string
    label: string
    author: string
    description: string
    url: string
    tags: string[]
    properties: Record<string, string>
    displayKeys: string[]
    kind: Kind
    views: Partial<Record<ViewName, PartView>>
    connectors: Connector[]
    buses: string[][]
    ignoreTerminalPoints: boolean
    flippedSMD: boolean
    spice: { lines: string[], models: string[] }
}

const CONNECTOR_TYPES = new Set(['male', 'female', 'wire', 'pad'])
const ERC_TYPES       = ['VCC', 'ground']
const PART_NUMBERS    = ['mn', 'mpn', 'part number']

const KINDS: [(moduleId: string, properties: string, title: string) => boolean, Kind][] = [
    [id => id === 'WireModuleID', 'wire'],
    [id => id === 'JumperModuleID', 'jumper'],
    [id => id.endsWith('LogoImageModuleID') || id.endsWith('LogoTextModuleID'), 'logo'],
    [id => id === 'GroundPlaneModuleID', 'copperFill'],
    [id => id.endsWith('BlockerModuleID'), 'blocker'],
    [id => id === 'NoteModuleID', 'note'],
    [id => id.endsWith('2PowerModuleID'), 'part'],
    [id => id.endsWith('PowerModuleID') || id === 'GroundModuleID' || id.endsWith('NetLabelModuleID') || id === 'PowerLabelModuleID', 'symbol'],
    [id => id === 'RulerModuleID', 'ruler'],
    [id => id === 'ViaModuleID', 'via'],
    [id => id === 'HoleModuleID', 'hole'],
    [id => /(Perfboard|Stripboard2?)ModuleID$/.test(id), 'breadboard'],
    [(_, properties) => properties.includes('breadboard'), 'breadboard'],
    [(_, properties, title) => properties.includes('plain vanilla pcb') && (properties.includes('shield') || title.includes('custom')), 'board'],
    [(_, properties) => properties.includes('plain vanilla pcb'), 'resizableBoard']
]

const getKind = (moduleId: string, properties: string, title: string) => KINDS.find(([test]) => test(moduleId, properties, title))?.[1] ?? 'part'

const readPin = (element: XmlElement): Pin => ({
    layer: element.getAttribute('layer') ?? '',
    svgId: element.getAttribute('svgId') ?? '',
    terminalId: element.getAttribute('terminalId') ?? '',
    legId: element.getAttribute('legId') ?? '',
    hybrid: element.getAttribute('hybrid') === 'yes'
})

const readConnector = (element: XmlElement): Connector => {
    const views = childrenOf(childNamed(element, 'views')).filter(view => tagOf(view) !== 'iconView')
    const pins  = Object.fromEntries(views.map(view => [tagOf(view), childrenNamed(view, 'p').map(readPin)]))
    const type  = (element.getAttribute('type') ?? '').toLowerCase()
    const found = CONNECTOR_TYPES.has(type) ? type : Object.values(pins).flat().some(pin => pin.svgId.endsWith('pad')) ? 'pad' : 'unknown'
    const erc   = childNamed(element, 'erc')
    return { id: element.getAttribute('id') ?? '', name: element.getAttribute('name') ?? '', type: found, description: textOf(childNamed(element, 'description')), views: pins, ignore: erc?.getAttribute('ignore') ?? '', erc: erc && ERC_TYPES.includes(erc.getAttribute('etype') ?? '') ? serializeXml(erc) : '' }
}

const readView = (element: XmlElement): PartView => {
    const layers = childNamed(element, 'layers')
    const named  = childrenNamed(layers, 'layer').filter(layer => KNOWN_LAYERS.has(layer.getAttribute('layerId') ?? ''))
    const flag   = (name: string) => element.getAttribute(name) === 'true'
    return {
        image: layers?.getAttribute('image') ?? '',
        layers: named.map(layer => layer.getAttribute('layerId') ?? ''),
        sticky: named.filter(layer => layer.getAttribute('sticky') === 'true').map(layer => layer.getAttribute('layerId') ?? ''),
        flipHorizontal: flag('fliphorizontal'),
        flipVertical: flag('flipvertical')
    }
}

const copyPins = (connectors: Connector[], from: string, to: string) => connectors.forEach(connector => {
    const pins = connector.views.pcbView ?? []
    const pin  = pins.find(candidate => candidate.layer === from)

    if (pin && !pins.some(candidate => candidate.layer === to))
        connector.views.pcbView = [...pins, { ...pin, layer: to }]
})

// GARANTE COBRE NAS DUAS FACES: THT GANHA COPPER1, SMD GANHA COPPER0 ESPELHADO (SPEC 01 §2.5)
const normalizeCopper = (part: Part) => {
    const pcb = part.views.pcbView

    if (!pcb || (!pcb.layers.includes('copper0') && !pcb.layers.includes('copper1')))
        return

    const tht   = pcb.layers.includes('copper0')
    const [from, to] = tht ? ['copper0', 'copper1'] : ['copper1', 'copper0']
    const extra = [to, ...(pcb.layers.includes('silkscreen') ? ['silkscreen0'] : [])].filter(layer => !pcb.layers.includes(layer))

    pcb.layers           = [...pcb.layers, ...extra]
    part.flippedSMD      = !tht
    part.properties.layer = part.properties.layer ?? ''
    copyPins(part.connectors, from, to)
}

export const readPart = (text: string, internal = false) => {
    const root = parseXml(text)

    if (!root || tagOf(root) !== 'module' || !root.getAttribute('moduleId'))
        return null

    const propertyElements = childrenNamed(childNamed(root, 'properties'), 'property')
    const properties       = Object.fromEntries(propertyElements.map(element => [(element.getAttribute('name') ?? '').trim().toLowerCase(), textOf(element)]))
    const connectors       = childNamed(root, 'connectors')
    const views            = childrenOf(childNamed(root, 'views')).filter(view => tagOf(view) in VIEW_LAYERS)
    const moduleId         = root.getAttribute('moduleId') ?? ''
    const title            = textOf(childNamed(root, 'title'))

    PART_NUMBERS.forEach(key => properties[key] = properties[key] ?? '')

    const part: Part = {
        moduleId,
        version: Number(textOf(childNamed(root, 'version')).trim()) || 0,
        title,
        label: textOf(childNamed(root, 'label')),
        author: textOf(childNamed(root, 'author')),
        description: textOf(childNamed(root, 'description')),
        url: textOf(childNamed(root, 'url')).trim(),
        tags: childrenNamed(childNamed(root, 'tags'), 'tag').map(textOf),
        properties,
        displayKeys: propertyElements.filter(element => (element.getAttribute('showInLabel') ?? '').toLowerCase() === 'yes').map(element => (element.getAttribute('name') ?? '').trim().toLowerCase()),
        kind: getKind(moduleId, textOf(childNamed(root, 'properties')).toLowerCase(), title.toLowerCase()),
        views: Object.fromEntries(views.map(view => [tagOf(view), readView(view)])),
        connectors: childrenNamed(connectors, 'connector').map(readConnector),
        buses: childrenNamed(childNamed(root, 'buses'), 'bus').map(bus => childrenNamed(bus, 'nodeMember').map(member => member.getAttribute('connectorId') ?? '')),
        ignoreTerminalPoints: (connectors?.getAttribute('ignoreTerminalPoints') ?? connectors?.getAttribute('IgnoreTerminalPoints') ?? '').toLowerCase() === 'true',
        flippedSMD: false,
        spice: { lines: childrenNamed(childNamed(root, 'spice'), 'line').map(textOf), models: childrenNamed(childNamed(root, 'spice'), 'model').map(textOf) }
    }

    const schematic = part.views.schematicView

    if (schematic && schematic.layers.includes('schematic'))
        Object.assign(schematic, { layers: [...schematic.layers, 'schematicText'], flipHorizontal: true, flipVertical: true })

    if (!internal)
        normalizeCopper(part)

    return part
}

export const getPinsIn = (part: Part, connector: Connector, view: ViewName) => {
    const layers = part.views[view]?.layers ?? []
    return (connector.views[view] ?? []).filter(pin => layers.includes(pin.layer) && !(view === 'pcbView' && PCB_NON_COPPER.has(pin.layer)))
}

const HIDDEN: Partial<Record<ViewName, Kind[]>> = {
    breadboardView: ['symbol', 'jumper', 'copperFill', 'blocker', 'logo', 'hole', 'via'],
    schematicView: ['logo', 'breadboard', 'jumper', 'copperFill', 'blocker', 'via', 'hole'],
    pcbView: ['breadboard', 'symbol']
}

const VISIBLE_LOGO: Partial<Record<ViewName, string>> = { breadboardView: 'breadboard', schematicView: 'schematic' }

// VISIBILIDADE DE UMA PEÇA NUMA VISTA (SPEC 02 §1.1); A PEÇA EXISTE E CONDUZ MESMO QUANDO INVISÍVEL
export const isVisibleIn = (part: Part, view: ViewName) => {
    const id     = part.moduleId
    const keep   = VISIBLE_LOGO[view]
    const drawn  = (part.views[view]?.layers ?? []).some(layer => VIEW_LAYERS[view].includes(layer))
    const logo   = part.kind === 'logo' && keep !== undefined && id.toLowerCase().includes(keep)
    const hidden = HIDDEN[view]?.includes(part.kind) && !logo
    const extra  = view === 'schematicView' ? id.endsWith('PadModuleID') : view === 'pcbView' ? id.endsWith('SchematicFrameModuleID') || id.endsWith('PowerModuleID') : false
    return drawn && !hidden && !extra
}
