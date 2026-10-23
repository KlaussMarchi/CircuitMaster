import type { Bundle } from '../Sketch'
import { escapeXml } from '../KicadDraw'
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

const glob = (pattern: string) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*').replaceAll('?', '.')}$`)

// FOOTPRINT DO SÍMBOLO: O DO CAMPO Footprint, SENÃO O PADRÃO QUE CASA COM OS FILTROS (O NOME OU Biblioteca:Nome)
export const footprintOf = (symbol: KicadSymbol) => {
    const filters = (symbol.properties.ki_fp_filters ?? '').split(/\s+/).filter(Boolean).map(glob)
    return symbol.properties.Footprint || DEFAULT_FOOTPRINTS.find(field => filters.some(filter => filter.test(field) || filter.test(field.split(':')[1]))) || ''
}

export const symbolPath = (library: string, name: string) => `${library}.kicad_symdir/${name}.kicad_sym`

// "Biblioteca:Nome" DO CAMPO Footprint NO ARQUIVO DA PASTA .pretty
export const footprintPath = (field: string) => {
    const [library, name] = field.split(':')
    return library && name ? `${library}.pretty/${name}.kicad_mod` : null
}

const SHOWN = ['Description', 'Footprint', 'Datasheet']    // CAMPOS DO SÍMBOLO QUE O INSPETOR MOSTRA

const property = (name: string, value: string) => `<property name="${escapeXml(name)}">${escapeXml(value)}</property>`

// PEÇA DO FRITZING A PARTIR DO SÍMBOLO E DO FOOTPRINT DO KICAD: O .fzp E OS SVG DAS VISTAS COMO UM PACOTE; CADA PINO É UM CONECTOR, LIGADO NA PCB AO PAD DE MESMO NÚMERO; SEM FOOTPRINT A PEÇA SÓ EXISTE NO ESQUEMÁTICO (SPEC 08 §4)
export const kicadBundle = (moduleId: string, symbol: KicadSymbol, footprint: KicadFootprint | null): Bundle => {
    const [, library, name, chosen] = moduleId.match(KICAD_ID) ?? ['', '', symbol.name]
    const base     = `kicad_${library}_${name}${chosen ? `_${footprint?.name ?? ''}` : ''}`.replace(/[^\w.-]+/g, '_')
    const pins     = pinsOf(symbol)
    const ids      = new Map(pins.map((pin, i) => [pin.number || pin.name, i]))
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
        const label = pin.name && pin.name !== '~' ? pin.name : pin.number
        return `<connector id="connector${i}" name="${escapeXml(label)}" type="${pad && !pad.drill ? 'pad' : 'male'}"><description>${escapeXml(`${pin.number} ${label} (${pin.type})`)}</description><views>${bread}<schematicView><p layer="schematic" svgId="connector${i}pin" terminalId="connector${i}terminal"/></schematicView>${board}</views></connector>`
    })
    const fields   = { family: library, 'kicad symbol': `${library}:${name}`, ...Object.fromEntries(SHOWN.flatMap(key => symbol.properties[key] && symbol.properties[key] !== '~' ? [[key.toLowerCase(), symbol.properties[key]]] : [])), ...footprint ? { package: footprint.name } : {} }
    const label    = (symbol.properties.Reference ?? 'U').replace(/[?#]+$/, '') || 'U'
    const fzp      = `<?xml version="1.0" encoding="UTF-8"?>\n<module moduleId="${escapeXml(moduleId)}">\n<version>1</version><author>KiCad (CC BY-SA 4.0)</author><title>${escapeXml(name)}</title><label>${escapeXml(label)}</label><description>${escapeXml(symbol.properties.Description ?? '')}</description>\n<properties>${Object.entries(fields).map(([key, value]) => property(key, value)).join('')}</properties>\n<views>${views.join('')}</views>\n<connectors>${connectors.join('\n')}</connectors>\n</module>\n`
    return { sketch: null, parts: [{ name: `part.${base}.fzp`, text: fzp }], svgs, others: [], bin: null }
}

// PACOTE DA PEÇA DO KICAD LIDO DO ACERVO: O SÍMBOLO (E O PAI, SE DERIVADO) E O FOOTPRINT DO CAMPO Footprint; NULO SEM O SÍMBOLO
export const readKicadPart = async (moduleId: string, read: (root: string, path: string) => Promise<string | null>) => {
    const [, library, name, chosen] = moduleId.match(KICAD_ID) ?? []

    if (!library)
        return null

    const text   = await read(KICAD_SYMBOLS, symbolPath(library, name))
    const parent = text ? parentOf(text) : ''
    const symbol = text ? readSymbol(text, parent ? readSymbol(await read(KICAD_SYMBOLS, symbolPath(library, parent)) ?? '') : null) : null

    if (!symbol)
        return null

    const file = footprintPath(chosen ?? footprintOf(symbol))
    return kicadBundle(moduleId, symbol, file ? readFootprint(await read(KICAD_FOOTPRINTS, file) ?? '') : null)
}
