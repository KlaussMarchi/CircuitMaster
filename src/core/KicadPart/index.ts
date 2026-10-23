import type { Bundle } from '../Sketch'
import { escapeXml, fitsFilters } from '../KicadDraw'
import { parentOf, pinsOf, readSymbol, symbolSvg, type KicadSymbol } from '../KicadSymbol'
import { breadboardSvg, footprintSvg, padsOf, readFootprint, type KicadFootprint } from '../KicadFootprint'

export const KICAD_ID         = /^kicad:([^:@]+):([^@]+)(?:@(.+))?$/    // kicad:Biblioteca:Símbolo, COM @BibliotecaFp:Footprint QUANDO O FOOTPRINT É ESCOLHIDO
export const KICAD_SYMBOLS    = 'kicad-symbols'       // RAIZES DO ACERVO DO KICAD NO Source (SERVIDAS EM /kicad/symbols E /kicad/footprints)
export const KICAD_FOOTPRINTS = 'kicad-footprints'

// FOOTPRINTS PASSANTES PADRÃO, EM ORDEM DE PREFERÊNCIA, PARA O SÍMBOLO GENÉRICO SEM FOOTPRINT: O PRIMEIRO QUE CASA COM O ki_fp_filters DELE (CABEM NA PROTOBOARD)
const DEFAULT_FOOTPRINTS = [
    'Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal',
    'Capacitor_THT:CP_Radial_D5.0mm_P2.50mm',
    'Capacitor_THT:C_Disc_D5.0mm_W2.5mm_P5.00mm',
    'Inductor_THT:L_Axial_L5.3mm_D2.2mm_P10.16mm_Horizontal_Vishay_IM-1',
    'Diode_THT:D_DO-41_SOD81_P10.16mm_Horizontal',
    'LED_THT:LED_D5.0mm',
    'Crystal:Crystal_HC49-4H_Vertical',
    'Potentiometer_THT:Potentiometer_Bourns_3386P_Vertical',
    'Package_TO_SOT_THT:TO-92_Inline'
]

export const kicadId = (library: string, name: string, footprint = '') => `kicad:${library}:${name}${footprint ? `@${footprint}` : ''}`

// FOOTPRINT DO SÍMBOLO: O DO CAMPO Footprint, SENÃO O PADRÃO QUE CASA COM OS FILTROS (O NOME OU Biblioteca:Nome)
export const footprintOf = (symbol: KicadSymbol) => symbol.properties.Footprint || DEFAULT_FOOTPRINTS.find(field => fitsFilters(field, symbol.properties.ki_fp_filters ?? '')) || ''

export const symbolPath = (library: string, name: string) => `${library}.kicad_symdir/${name}.kicad_sym`

// "Biblioteca:Nome" DO CAMPO Footprint NO ARQUIVO DA PASTA .pretty
export const footprintPath = (field: string) => {
    const [library, name] = field.split(':')
    return library && name ? `${library}.pretty/${name}.kicad_mod` : null
}

const SHOWN = ['Description', 'Datasheet']    // CAMPOS DO SÍMBOLO QUE O INSPETOR MOSTRA

type Behavior = { properties: Record<string, string>, names: Record<string, string>, line: string, model: string }

const RLC_LINE    = (letter: string, value: string) => `${letter}{instanceTitle} {net #1} {net #2} {${value}}`
const LED_MODEL   = '.MODEL LED_GENERIC D (IS=93.1P RS=42M N=4.61 BV=9 IBV=10U CJO=2.97P VJ=.75 M=.333 TT=4.32U)'          // O DO LED DE 5 mm DO ACERVO DO FRITZING
const DIODE_MODEL = '.MODEL DI_1N4001 D  ( IS=76.9p RS=42.0m BV=50.0 IBV=5.00u CJO=39.8p  M=0.333 N=1.45 TT=4.32u )'    // O DO 1N4001 DO ACERVO DO FRITZING

// COMO SIMULA CADA PEÇA EQUIVALENTE DO FRITZING: FAMÍLIA E VALORES PADRÃO, O NOME DE CADA PINO DO KICAD (OS EFEITOS DA SIMULAÇÃO PROCURAM Pin 0, +, anode…) E O <spice> COM OS PINOS PELO NÚMERO (#1, #2); NO DIODO E NO LED O PINO 1 É O CATODO
const BEHAVIORS: Record<string, Behavior> = {
    ResistorModuleID: { properties: { family: 'Resistor', resistance: '1kΩ', power: '0.25W' }, names: { 1: 'Pin 0', 2: 'Pin 1' }, line: RLC_LINE('R', 'resistance'), model: '' },
    '100milCeramicCapacitorModuleID': { properties: { family: 'Capacitor [bidirectional]', capacitance: '100nF', voltage: '50V' }, names: { 1: '+', 2: '-' }, line: RLC_LINE('C', 'capacitance'), model: '' },
    SmallElectrolyticCapacitorModuleID: { properties: { family: 'Capacitor [unidirectional]', capacitance: '10µF', voltage: '25V' }, names: { 1: '+', 2: '-' }, line: RLC_LINE('C', 'capacitance'), model: '' },
    '56bed03878064b8286b71d5240035138InductorModuleID': { properties: { family: 'Inductor', inductance: '10µH' }, names: {}, line: RLC_LINE('L', 'inductance'), model: '' },
    '5mmColorLEDModuleID': { properties: { family: 'LED', color: 'Red (633nm)', current: '0.030A' }, names: { 1: 'cathode', 2: 'anode' }, line: 'D{instanceTitle} {net #2} {net #1} LED_GENERIC', model: LED_MODEL },
    '3254CBFC44diode': { properties: { family: 'Diode', power: '1W' }, names: { 1: 'cathode', 2: 'anode' }, line: 'D{instanceTitle} {net #2} {net #1} DI_1N4001', model: DIODE_MODEL }
}

const property = (name: string, value: string) => `<property name="${escapeXml(name)}">${escapeXml(value)}</property>`

// PEÇA DO FRITZING A PARTIR DO SÍMBOLO E DO FOOTPRINT DO KICAD: O .fzp E OS SVG DAS VISTAS COMO UM PACOTE; CADA PINO É UM CONECTOR, LIGADO NA PCB AO PAD DE MESMO NÚMERO; SEM FOOTPRINT A PEÇA SÓ EXISTE NO ESQUEMÁTICO (SPEC 08 §4)
export const kicadBundle = (moduleId: string, symbol: KicadSymbol, footprint: KicadFootprint | null, field = '', equivalent = ''): Bundle => {
    const [, library, name, chosen] = moduleId.match(KICAD_ID) ?? ['', '', symbol.name]
    const base     = `kicad_${library}_${name}${chosen ? `_${footprint?.name ?? ''}` : ''}`.replace(/[^\w.-]+/g, '_')
    const pins     = pinsOf(symbol)
    const ids      = new Map(pins.map((pin, i) => [pin.number || pin.name, i]))
    const behavior = BEHAVIORS[equivalent]
    const pads     = new Map((footprint ? padsOf(footprint) : []).map(pad => [pad.number, pad]))
    const tht      = [...pads.values()].some(pad => pad.drill)
    const images   = { schematic: `schematic/${base}_schem.svg`, breadboard: `breadboard/${base}_bread.svg`, pcb: `pcb/${base}_pcb.svg` }
    const svgs     = [{ name: `svg.${images.schematic.replace('/', '.')}`, text: symbolSvg(symbol) }, ...footprint ? [{ name: `svg.${images.breadboard.replace('/', '.')}`, text: breadboardSvg(footprint, ids) }, { name: `svg.${images.pcb.replace('/', '.')}`, text: footprintSvg(footprint, ids) }] : []]
    const copper   = tht ? ['copper0', 'silkscreen', 'copper1'] : ['silkscreen', 'copper1']
    const views    = [`<iconView><layers image="${images.schematic}"><layer layerId="icon"/></layers></iconView>`, `<schematicView><layers image="${images.schematic}"><layer layerId="schematic"/></layers></schematicView>`, ...footprint ? [`<breadboardView><layers image="${images.breadboard}"><layer layerId="breadboard"/></layers></breadboardView>`, `<pcbView><layers image="${images.pcb}">${copper.map(layer => `<layer layerId="${layer}"/>`).join('')}</layers></pcbView>`] : []]
    const connectors = pins.map((pin, i) => {
        const pad   = pads.get(pin.number)
        const board = !pad ? '' : pad.drill ? `<pcbView><p layer="copper0" svgId="connector${i}pin"/><p layer="copper1" svgId="connector${i}pin"/></pcbView>` : `<pcbView><p layer="copper1" svgId="connector${i}pad"/></pcbView>`
        const bread = footprint && pad ? `<breadboardView><p layer="breadboard" svgId="connector${i}pin"/></breadboardView>` : ''
        const label = behavior?.names[pin.number] ?? (pin.name && pin.name !== '~' ? pin.name : pin.number)
        return `<connector id="connector${i}" name="${escapeXml(label)}" type="${pad && !pad.drill ? 'pad' : 'male'}"><description>${escapeXml(`${pin.number} ${label} (${pin.type})`)}</description><views>${bread}<schematicView><p layer="schematic" svgId="connector${i}pin" terminalId="connector${i}terminal"/></schematicView>${board}</views></connector>`
    })
    const fields   = { family: library, ...behavior?.properties, 'kicad symbol': `${library}:${name}`, ...Object.fromEntries(SHOWN.flatMap(key => symbol.properties[key] && symbol.properties[key] !== '~' ? [[key.toLowerCase(), symbol.properties[key]]] : [])), ...footprint ? { footprint: field, package: footprint.name } : {}, 'footprint filters': symbol.properties.ki_fp_filters ?? '' }
    const spice    = behavior ? `<spice><line>${escapeXml(behavior.line.replace(/#(\w+)/g, (_, pin: string) => `connector${ids.get(pin)}`))}</line>${behavior.model ? `<model>${escapeXml(behavior.model)}</model>` : ''}</spice>\n` : ''
    const label    = (symbol.properties.Reference ?? 'U').replace(/[?#]+$/, '') || 'U'
    const fzp      = `<?xml version="1.0" encoding="UTF-8"?>\n<module moduleId="${escapeXml(moduleId)}">\n<version>1</version><author>KiCad (CC BY-SA 4.0)</author><title>${escapeXml(name)}</title><label>${escapeXml(label)}</label><description>${escapeXml(symbol.properties.Description ?? '')}</description>\n<properties>${Object.entries(fields).map(([key, value]) => property(key, value)).join('')}</properties>\n${spice}<views>${views.join('')}</views>\n<connectors>${connectors.join('\n')}</connectors>\n</module>\n`
    return { sketch: null, parts: [{ name: `part.${base}.fzp`, text: fzp }], svgs, others: [], bin: null }
}

// PACOTE DA PEÇA DO KICAD LIDO DO ACERVO: O SÍMBOLO (E O PAI, SE DERIVADO) E O FOOTPRINT DO CAMPO Footprint; NULO SEM O SÍMBOLO. A EQUIVALENTE DO FRITZING (core/Properties) DIZ COMO SIMULA
export const readKicadPart = async (moduleId: string, read: (root: string, path: string) => Promise<string | null>, equivalent = '') => {
    const [, library, name, chosen] = moduleId.match(KICAD_ID) ?? []

    if (!library)
        return null

    const text   = await read(KICAD_SYMBOLS, symbolPath(library, name))
    const parent = text ? parentOf(text) : ''
    const symbol = text ? readSymbol(text, parent ? readSymbol(await read(KICAD_SYMBOLS, symbolPath(library, parent)) ?? '') : null) : null

    if (!symbol)
        return null

    const field = chosen ?? footprintOf(symbol)
    const file  = footprintPath(field)
    return kicadBundle(moduleId, symbol, file ? readFootprint(await read(KICAD_FOOTPRINTS, file) ?? '') : null, field, equivalent)
}
