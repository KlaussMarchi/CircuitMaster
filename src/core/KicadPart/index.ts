import type { Bundle } from '../Sketch'
import type { Point } from '../Geometry'
import { escapeXml, fitsFilters, svgOf } from '../KicadDraw'
import { parentOf, pinsOf, readSymbol, readSymbols, symbolSvg, type KicadPin, type KicadSymbol } from '../KicadSymbol'
import { breadboardSvg, fitsBreadboard, footprintSvg, padsOf, readFootprint, type KicadFootprint } from '../KicadFootprint'
import { libraryOf, simulate } from '../KicadSim'

export const KICAD_ID         = /^cm:([^:@]+):([^@]+)(?:@(.+))?$/    // cm:Biblioteca:Símbolo, COM @BibliotecaFp:Footprint QUANDO O FOOTPRINT É ESCOLHIDO
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

export const kicadId = (library: string, name: string, footprint = '') => `cm:${library}:${name}${footprint ? `@${footprint}` : ''}`

// FOOTPRINT DO SÍMBOLO: O DO CAMPO Footprint, SENÃO O PADRÃO QUE CASA COM OS FILTROS (O NOME OU Biblioteca:Nome)
export const footprintOf = (symbol: KicadSymbol) => symbol.properties.Footprint || DEFAULT_FOOTPRINTS.find(field => fitsFilters(field, symbol.properties.ki_fp_filters ?? '')) || ''

export const symbolPath = (library: string, name: string) => `${library}.kicad_symdir/${name}.kicad_sym`

// "Biblioteca:Nome" DO CAMPO Footprint NO ARQUIVO DA PASTA .pretty
export const footprintPath = (field: string) => {
    const [library, name] = field.split(':')
    return library && name ? `${library}.pretty/${name}.kicad_mod` : null
}

const SHOWN = ['Description', 'Datasheet']    // CAMPOS DO SÍMBOLO QUE O INSPETOR MOSTRA

type Behavior = { properties: Record<string, string>, names: Record<string, string>, lines: string[] }

const RLC_LINE    = (letter: string, value: string) => [`${letter}{instanceTitle} {net #1} {net #2} {${value}}`]

// COMO SIMULA CADA PEÇA EQUIVALENTE DO ACERVO (OS MODELOS VÊM DELA): FAMÍLIA E VALORES PADRÃO, O NOME DE CADA PINO DO KICAD (OS EFEITOS DA SIMULAÇÃO PROCURAM Pin 0, +, anode…) E O <spice> COM OS PINOS PELO NÚMERO (#1, #2); NO DIODO E NO LED O PINO 1 É O CATODO, NO POTENCIÔMETRO O 2 É O CURSOR
const BEHAVIORS: Record<string, Behavior> = {
    ResistorModuleID: { properties: { family: 'Resistor', resistance: '1kΩ', power: '0.25W' }, names: { 1: 'Pin 0', 2: 'Pin 1' }, lines: RLC_LINE('R', 'resistance') },
    '100milCeramicCapacitorModuleID': { properties: { family: 'Capacitor [bidirectional]', capacitance: '100nF', voltage: '50V' }, names: { 1: '+', 2: '-' }, lines: RLC_LINE('C', 'capacitance') },
    SmallElectrolyticCapacitorModuleID: { properties: { family: 'Capacitor [unidirectional]', capacitance: '10µF', voltage: '25V' }, names: { 1: '+', 2: '-' }, lines: RLC_LINE('C', 'capacitance') },
    '56bed03878064b8286b71d5240035138InductorModuleID': { properties: { family: 'Inductor', inductance: '10µH' }, names: {}, lines: RLC_LINE('L', 'inductance') },
    '5mmColorLEDModuleID': { properties: { family: 'LED', color: 'Red (633nm)', current: '0.030A' }, names: { 1: 'cathode', 2: 'anode' }, lines: ['D{instanceTitle} {net #2} {net #1} LED_GENERIC'] },
    '3254CBFC44diode': { properties: { family: 'Diode', power: '1W' }, names: { 1: 'cathode', 2: 'anode' }, lines: ['D{instanceTitle} {net #2} {net #1} DI_1N4001'] },
    potentiometer_trimmer_6mm_5_PotentiometerModuleID: { properties: { family: 'Potentiometer', 'maximum resistance': '10kΩ', 'knob status': '50%', power: '0.5W' }, names: { 1: 'leg1', 2: 'wiper', 3: 'leg2' }, lines: ['R{instanceTitle}A {net #1} {net #2} {{knob status}/100*{maximum resistance}}', 'R{instanceTitle}B {net #3} {net #2} {{maximum resistance}-{knob status}/100*{maximum resistance}}'] },
    '1001AAAB555Timer': { properties: { family: 'Timer IC' }, names: {}, lines: ['X{instanceTitle} {net #2} {net #3} {net #4} {net #5} {net #6} {net #7} {net #8} {net #1} UA555'] },
    '5_DCPowerSupplyModuleID': { properties: { family: 'voltage source', voltage: '5V', 'internal resistance': '0.1Ω' }, names: { 1: '+', 2: '-' }, lines: ['V{instanceTitle} {net #1}_{instanceTitle}_aux {net #2} DC {voltage}', 'R{instanceTitle} {net #1}_{instanceTitle}_aux {net #1} {internal resistance}'] }
}

const BOARD  = '#2d5a3d'    // PLACA ADAPTADORA, VERDE DE PCB
const HEADER = '#8c8c8c'    // PINOS DA BARRA

// PLACA ADAPTADORA DA PROTOBOARD PARA A PEÇA QUE NÃO ENCAIXA NOS FUROS (SMD, PASSO FORA DE 0,1 in, PAD COM OUTRO NOME OU SEM FOOTPRINT): OS PINOS NA ORDEM DOS CONECTORES EM DUAS FILEIRAS A 0,1 in, NUMERADOS COMO UM CI DIP (UMA FILEIRA ATÉ 3 PINOS), E O NOME NO MEIO (SEÇÃO 12 DO PLANO)
const adapterSvg = (name: string, count: number) => {
    const rows   = count > 3 ? 2 : 1
    const across = Math.ceil(count / rows)
    const gap    = count > 28 ? 600 : 300    // mil ENTRE AS FILEIRAS, COMO OS CIs DIP ESTREITOS E LARGOS
    const [w, h] = [100 * across + 100, rows === 2 ? gap + 100 : 200]
    const at     = (i: number): Point => i < across ? [100 + 100 * i, h - 50] : [100 + 100 * (count - 1 - i), 50]
    const pins   = Array.from({ length: count }, (_, i) => at(i)).map(([x, y], i) => `<rect id="connector${i}pin" x="${x - 15}" y="${y - 15}" width="30" height="30" fill="${HEADER}"/>`)
    const size   = Math.min(60, 1.6 * (w - 60) / Math.max(1, name.length))
    return svgOf(w, h, `<g id="breadboard"><rect width="${w}" height="${h}" rx="12" fill="${BOARD}"/><text x="${w / 2}" y="${h / 2}" font-family="Droid Sans" font-size="${size}" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${escapeXml(name)}</text>${pins.join('')}</g>`)
}

const property = (name: string, value: string) => `<property name="${escapeXml(name)}">${escapeXml(value)}</property>`

// PEÇA DO FRITZING A PARTIR DO SÍMBOLO E DO FOOTPRINT DO KICAD: O .fzp E OS SVG DAS VISTAS COMO UM PACOTE; CADA PINO É UM CONECTOR, LIGADO NA PCB AO PAD DE MESMO NÚMERO; SEM FOOTPRINT A PEÇA SÓ EXISTE NO ESQUEMÁTICO; O <spice> VEM DA EQUIVALENTE, SENÃO DOS CAMPOS Sim.* (spice SÃO OS MODELOS DA EQUIVALENTE OU O TEXTO DA BIBLIOTECA SPICE QUE OS CAMPOS CITAM) (SPEC 08 §4)
export const kicadBundle = (moduleId: string, symbol: KicadSymbol, footprint: KicadFootprint | null, field = '', equivalent = '', spice = ''): Bundle => {
    const [, library, name, chosen] = moduleId.match(KICAD_ID) ?? ['', '', symbol.name]
    const base     = `cm_${library}_${name}${chosen ? `_${footprint?.name ?? ''}` : ''}`.replace(/[^\w.-]+/g, '_')
    const pins     = pinsOf(symbol)
    const ids      = new Map(pins.map((pin, i) => [pin.number || pin.name, i]))
    const behavior = BEHAVIORS[equivalent]
    const pads     = new Map((footprint ? padsOf(footprint) : []).map(pad => [pad.number, pad]))
    const tht      = [...pads.values()].some(pad => pad.drill)
    const fits     = footprint !== null && fitsBreadboard(footprint) && pins.every(pin => pads.has(pin.number))
    const bread    = symbol.power || !pins.length ? '' : footprint && fits ? breadboardSvg(footprint, ids) : adapterSvg(name, pins.length)    // OS SÍMBOLOS DE ALIMENTAÇÃO (GND, VCC) SÓ EXISTEM NO ESQUEMÁTICO
    const images   = { schematic: `schematic/${base}_schem.svg`, breadboard: `breadboard/${base}_bread.svg`, pcb: `pcb/${base}_pcb.svg` }
    const svgs     = [{ name: `svg.${images.schematic.replace('/', '.')}`, text: symbolSvg(symbol) }, ...bread ? [{ name: `svg.${images.breadboard.replace('/', '.')}`, text: bread }] : [], ...footprint ? [{ name: `svg.${images.pcb.replace('/', '.')}`, text: footprintSvg(footprint, ids) }] : []]
    const copper   = tht ? ['copper0', 'silkscreen', 'copper1'] : ['silkscreen', 'copper1']
    const views    = [`<iconView><layers image="${images.schematic}"><layer layerId="icon"/></layers></iconView>`, `<schematicView><layers image="${images.schematic}"><layer layerId="schematic"/></layers></schematicView>`, ...bread ? [`<breadboardView><layers image="${images.breadboard}"><layer layerId="breadboard"/></layers></breadboardView>`] : [], ...footprint ? [`<pcbView><layers image="${images.pcb}">${copper.map(layer => `<layer layerId="${layer}"/>`).join('')}</layers></pcbView>`] : []]
    const connectors = pins.map((pin, i) => {
        const pad   = pads.get(pin.number)
        const board = !pad ? '' : pad.drill ? `<pcbView><p layer="copper0" svgId="connector${i}pin"/><p layer="copper1" svgId="connector${i}pin"/></pcbView>` : `<pcbView><p layer="copper1" svgId="connector${i}pad"/></pcbView>`
        const plug  = bread && (pad || !fits) ? `<breadboardView><p layer="breadboard" svgId="connector${i}pin"/></breadboardView>` : ''
        const label = behavior?.names[pin.number] ?? (pin.name && pin.name !== '~' ? pin.name : pin.number)
        return `<connector id="connector${i}" name="${escapeXml(label)}" type="${pad && !pad.drill ? 'pad' : 'male'}"><description>${escapeXml(`${pin.number} ${label} (${pin.type})`)}</description><views>${plug}<schematicView><p layer="schematic" svgId="connector${i}pin" terminalId="connector${i}terminal"/></schematicView>${board}</views></connector>`
    })
    const fields   = { family: library, ...behavior?.properties, 'kicad symbol': `${library}:${name}`, ...Object.fromEntries(SHOWN.flatMap(key => symbol.properties[key] && symbol.properties[key] !== '~' ? [[key.toLowerCase(), symbol.properties[key]]] : [])), ...footprint ? { footprint: field, package: footprint.name } : {}, 'footprint filters': symbol.properties.ki_fp_filters ?? '' }
    const own      = behavior ? { lines: behavior.lines.map(line => line.replace(/#(\w+)/g, (_, pin: string) => `connector${ids.get(pin)}`)), models: spice ? [spice] : [] } : simulate(symbol, base.replace(/\W+/g, '_'), spice)
    const element  = own ? `<spice>${own.lines.map(line => `<line>${escapeXml(line)}</line>`).join('')}${own.models.map(model => `<model>${escapeXml(model)}</model>`).join('')}</spice>\n` : ''
    const label    = (symbol.properties.Reference ?? 'U').replace(/[?#]+$/, '') || 'U'
    const fzp      = `<?xml version="1.0" encoding="UTF-8"?>\n<module moduleId="${escapeXml(moduleId)}">\n<version>1</version><author>CircuitMaster</author><title>${escapeXml(name)}</title><label>${escapeXml(label)}</label><description>${escapeXml(symbol.properties.Description ?? '')}</description>\n<properties>${Object.entries(fields).map(([key, value]) => property(key, value)).join('')}</properties>\n${element}<views>${views.join('')}</views>\n<connectors>${connectors.join('\n')}</connectors>\n</module>\n`
    return { sketch: null, parts: [{ name: `part.${base}.fzp`, text: fzp }], svgs, others: [], bin: null }
}

type Read = (root: string, path: string) => Promise<string | null>

// TEXTO DA BIBLIOTECA SPICE QUE OS CAMPOS Sim.* DO SÍMBOLO CITAM, LIDO DO ACERVO DE SÍMBOLOS
const readSpice = async (symbol: KicadSymbol, read: Read) => {
    const file = libraryOf(symbol)
    return file ? await read(KICAD_SYMBOLS, file) ?? '' : ''
}

// SÍMBOLO DO moduleId LIDO DO ACERVO, COM O PAI SE FOR DERIVADO; NULO SEM ELE
const readKicadSymbol = async (moduleId: string, read: Read) => {
    const [, library, name] = moduleId.match(KICAD_ID) ?? []
    const text   = library ? await read(KICAD_SYMBOLS, symbolPath(library, name)) : null
    const parent = text ? parentOf(text) : ''
    return text ? readSymbol(text, parent ? readSymbol(await read(KICAD_SYMBOLS, symbolPath(library, parent)) ?? '') : null) : null
}

// DESENHO DO ESQUEMÁTICO PARA O ÍCONE DA PEÇA NO PAINEL
export const readSymbolSvg = async (moduleId: string, read: Read) => {
    const symbol = await readKicadSymbol(moduleId, read)
    return symbol ? symbolSvg(symbol) : null
}

// PACOTE DA PEÇA LIDO DO ACERVO: O SÍMBOLO E O FOOTPRINT DO CAMPO Footprint; NULO SEM O SÍMBOLO. A EQUIVALENTE DO ACERVO (core/Properties), A DO SÍMBOLO OU A DO PAI, DIZ COMO SIMULA, COM OS MODELOS DELA
export const readKicadPart = async (moduleId: string, read: Read, equivalentOf: (moduleId: string) => string, modelsOf: (moduleId: string) => Promise<string>) => {
    const [, library, , chosen] = moduleId.match(KICAD_ID) ?? []
    const symbol         = await readKicadSymbol(moduleId, read)

    if (!symbol)
        return null

    const field = chosen ?? footprintOf(symbol)
    const file  = footprintPath(field)
    const equivalent = [moduleId, symbol.parent && kicadId(library, symbol.parent)].filter(Boolean).map(equivalentOf).find(id => id in BEHAVIORS) ?? ''
    return kicadBundle(moduleId, symbol, file ? readFootprint(await read(KICAD_FOOTPRINTS, file) ?? '') : null, field, equivalent, equivalent ? await modelsOf(equivalent) : await readSpice(symbol, read))
}

const PIN = 2.54    // mm: PASSO E COMPRIMENTO DOS PINOS DO SÍMBOLO GERADO

// SÍMBOLO PARA UM FOOTPRINT SEM SÍMBOLO: UMA CAIXA COM UM PINO POR PAD, METADE À ESQUERDA E METADE À DIREITA, NA ORDEM DOS PADS
const symbolFromPads = (footprint: KicadFootprint): KicadSymbol => {
    const pads  = padsOf(footprint)
    const left  = Math.ceil(pads.length / 2)
    const rows  = Math.max(left, pads.length - left, 1)
    const half  = [2 * PIN, (rows + 1) * PIN / 2]
    const pins  = pads.map((pad, i): KicadPin => {
        const side = i < left ? -1 : 1
        const row  = i < left ? i : pads.length - 1 - i
        return { number: pad.number, name: pad.number, type: 'passive', at: [side * (half[0] + PIN), half[1] - PIN - row * PIN], angle: side < 0 ? 0 : 180, length: PIN, hidden: false, unit: 1 }
    })
    const body  = ['rectangle', ['start', String(-half[0]), String(half[1])], ['end', String(half[0]), String(-half[1])], ['stroke', ['width', '0.254']], ['fill', ['type', 'background']]]
    return { name: footprint.name, parent: '', properties: { Reference: 'U', Description: footprint.description }, pins, shapes: [[1, [body]]], units: 1, power: false, namesInside: 0.508, hideNames: false, hideNumbers: false }
}

const merge = (bundles: Bundle[]): Bundle => ({ sketch: null, parts: bundles.flatMap(bundle => bundle.parts), svgs: bundles.flatMap(bundle => bundle.svgs), others: [], bin: null })

// ARQUIVO DO KICAD ABERTO PELO USUÁRIO: CADA SÍMBOLO DE UM .kicad_sym VIRA UMA PEÇA (COM O FOOTPRINT DO CAMPO, SE ESTIVER NAS BIBLIOTECAS); UM .kicad_mod VIRA UMA PEÇA COM SÍMBOLO GERADO; TEXTO QUE NÃO LÊ DÁ A CAUSA (SPEC 08 §4)
export const importKicad = async (name: string, text: string, read: Read): Promise<Bundle | string> => {
    const base = name.replace(/^.*[\\/]/, '').replace(/\.kicad_(sym|mod)$/i, '')

    if (/\.kicad_mod$/i.test(name)) {
        const footprint = readFootprint(text)
        return footprint && padsOf(footprint).length ? kicadBundle(kicadId(base, footprint.name), symbolFromPads(footprint), footprint, `${base}:${footprint.name}`) : 'footprint do KiCad ilegível ou sem pads'
    }

    const symbols = readSymbols(text).filter(symbol => pinsOf(symbol).length)
    const bundles = await Promise.all(symbols.map(async symbol => {
        const field = footprintOf(symbol)
        const file  = footprintPath(field)
        return kicadBundle(kicadId(base, symbol.name), symbol, file ? readFootprint(await read(KICAD_FOOTPRINTS, file) ?? '') : null, field, '', await readSpice(symbol, read))
    }))
    return bundles.length ? merge(bundles) : 'biblioteca de símbolos do KiCad ilegível ou sem símbolos com pinos'
}
