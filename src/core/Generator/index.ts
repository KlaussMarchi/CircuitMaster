import { MIL_PER_INCH, toInches } from '../Units'
import { childrenOf, parseXml, serializeXml, tagOf, walk, type XmlElement } from '../Xml'

const range = (n: number) => Array.from({ length: n }, (_, i) => i)
const toMils = (spacing: string) => Math.round((toInches(spacing) ?? 0.1) * MIL_PER_INCH * 1000) / 1000

const svgHeader = (width: number, height: number, unitsPerInch: number, body: string) => `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="${width / unitsPerInch}in" height="${height / unitsPerInch}in" viewBox="0 0 ${width} ${height}">\n${body}\n</svg>\n`

const COPPER      = '#F7BD13'
const SILK        = '#ffffff'
const RING_RADIUS = 29     // MIL: ANEL DE 19 A 39 MIL, FURO DE 38 MIL
const RING_STROKE = 20
const DIP_RADIUS  = 27.5
const SQUARE_SIDE = 58

const ring = (id: number, x: number, y: number, r: number) => `<circle id="connector${id}pin" cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${COPPER}" stroke-width="${RING_STROKE}"/>`

// FOOTPRINT DIP: COLUNAS A 60 MIL DAS BORDAS, PASSO 100 MIL, NUMERAÇÃO ANTI-HORÁRIA (SPEC 01 §8.5)
const pcbDip = (n: number, spacing: string) => {
    const s      = toMils(spacing)
    const w      = 120 + s
    const h      = 100 * n / 2 + 20
    const c      = w / 2
    const rows   = range(n / 2)
    const copper = [`<rect id="square" x="32.5" y="32.5" width="55" height="55" fill="none" stroke="${COPPER}" stroke-width="${RING_STROKE}"/>`, ...rows.flatMap(i => [ring(i, 60, 60 + 100 * i, DIP_RADIUS), ring(n - 1 - i, w - 60, 60 + 100 * i, DIP_RADIUS)])]
    const silk   = [[10, 10, 10, h - 10], [10, h - 10, w - 10, h - 10], [w - 10, h - 10, w - 10, 10], [10, 10, c - 50, 10], [c + 50, 10, w - 10, 10]].map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SILK}" stroke-width="10"/>`)
    return svgHeader(w, h, MIL_PER_INCH, `<g id="silkscreen">${silk.join('')}</g>\n<g id="copper1"><g id="copper0">${copper.join('')}</g></g>`)
}

// FOOTPRINT DE PIN HEADER THT: FILEIRA SIMPLES, ALTERNADA OU DUPLA (SPEC 01 §8.4)
const pcbHeader = (square: boolean, variant: string, n: number, spacing: string) => {
    const p      = toMils(spacing)
    const double = variant === 'double'
    const offset = variant === 'alternating' ? 5 : 0
    const w      = double ? 240 : 140
    const h      = 140 + ((double ? n / 2 : n) - 1) * p
    const pins   = double ? [...range(n / 2).map(i => [i, 70, 70 + i * p]), ...range(n / 2).map(i => [n / 2 + i, 170, 70 + (n / 2 - 1 - i) * p])] : range(n).map(i => [i, 70 + (i % 2 === 0 ? offset : -offset), 70 + i * p])
    const first  = pins[0]
    const mark   = square ? `<rect id="square" x="${first[1] - SQUARE_SIDE / 2}" y="${first[2] - SQUARE_SIDE / 2}" width="${SQUARE_SIDE}" height="${SQUARE_SIDE}" fill="none" stroke="${COPPER}" stroke-width="${RING_STROKE}"/>` : ''
    const silk   = `<rect x="20" y="20" width="${w - 40}" height="${h - 40}" fill="none" stroke="${SILK}" stroke-width="10"/><line x1="20" y1="55" x2="55" y2="20" stroke="${SILK}" stroke-width="5"/>`
    return svgHeader(w, h, MIL_PER_INCH, `<g id="silkscreen">${silk}</g>\n<g id="copper1"><g id="copper0">${mark}${pins.map(([id, x, y]) => ring(id, x, y, RING_RADIUS)).join('')}</g></g>`)
}

// CORPO DIP NA PROTOBOARD EM 1/100 IN: FILEIRA INFERIOR 0..N/2-1, SUPERIOR N-1..N/2 (SPEC 01 §8.5)
const breadboardDip = (n: number, spacing: string) => {
    const s    = toMils(spacing) / 10
    const w    = 5 * n
    const h    = 3 + s
    const pin  = (id: number, x: number, y: number) => `<rect id="connector${id}pin" x="${x - 1.5}" y="${y - 1.5}" width="3" height="3" fill="#8C8C8C"/><rect id="connector${id}terminal" x="${x - 1.5}" y="${y - 1.5}" width="3" height="3" fill="none"/>`
    const pins = range(n / 2).flatMap(k => [pin(k, 5 + 10 * k, 1.5 + s), pin(n - 1 - k, 5 + 10 * k, 1.5)])
    const body = `<rect x="0" y="3" width="${w}" height="${s - 3}" fill="#303030"/><rect x="0" y="3" width="${w}" height="2.46" fill="#3D3D3D"/><circle cx="2.5" cy="${h / 2}" r="1.5" fill="#1C1C1C"/><text id="label" x="6.5" y="${h / 2 + 2.5}" fill="#e6e6e6" font-family="OCRA" font-size="8">IC</text>`
    return svgHeader(w, h, 100, `<g id="breadboard">${body}${pins.join('')}</g>`)
}

const NOTO_UPM      = 1000
const NOTO_ASCII    = '260,269,408,646,572,831,732,225,300,300,551,572,268,322,268,372,572,572,572,572,572,572,572,572,572,572,268,268,572,572,572,434,899,639,650,632,730,556,519,728,741,339,273,619,524,907,760,781,605,781,622,549,556,731,600,930,586,566,572,329,372,329,572,444,281,561,615,480,615,564,344,615,618,258,258,534,258,935,618,605,615,615,413,479,361,618,508,786,529,510,470,380,551,380,572'.split(',').map(Number)
const DROID_UPM     = 2048
const DROID_ASCII   = '532,551,823,1323,1128,1690,1438,463,616,616,1128,1128,512,659,549,764,1128,1128,1128,1128,1128,1128,1128,1128,1128,1128,549,549,1128,1128,1128,872,1774,1245,1272,1235,1401,1081,1006,1413,1436,694,555,1186,1006,1782,1493,1520,1180,1518,1208,1063,1063,1430,1163,1810,1120,1079,1104,621,764,621,1090,842,1182,1087,1200,948,1200,1096,674,1061,1206,530,530,1016,530,1835,1206,1182,1200,1200,817,924,694,1206,981,1528,1024,1001,903,725,1128,725,1128'.split(',').map(Number)
const LABEL_PT      = 3.5        // 1,235 MM
const SCREEN_SCALE  = 96 / 72    // MÉTRICA MEDIDA EM PX DE 96 DPI E LIDA COMO PT
const PIN_INDENT    = 19.44      // MIL, 2 × 0,247 MM
const PIN_HALF      = 4.861      // MIL, METADE DE 0,247 MM
const RECT_STROKE   = 12.5       // MIL, 0,3175 MM

const textMils = (text: string) => [...text].reduce((sum, char) => sum + (DROID_ASCII[char.charCodeAt(0) - 32] ?? DROID_UPM / 2), 0) / DROID_UPM * LABEL_PT * SCREEN_SCALE * MIL_PER_INCH / 72

// SÍMBOLO DIP NA GRADE DE 0,1 IN; LARGURA PELOS RÓTULOS pinN NAS MÉTRICAS DA DROID SANS (SPEC 01 §8.5)
const schematicDip = (n: number) => {
    const half   = n / 2
    const label  = Math.max(...range(n).map(i => textMils(`pin${i + 1}`)))
    const w      = 100 * Math.ceil((2 * label + textMils('IC') + 2 * PIN_INDENT) / 100) + 400
    const h      = 200 + 100 * Math.max(half - 1, 1)
    const pin    = (id: number, y: number, left: boolean) => {
        const [x0, x1] = left ? [0, 200] : [w - 200, w]
        const tx       = left ? -0.05 : w - 0.05
        return `<line x1="${x0 + PIN_HALF}" y1="${y}" x2="${x1 - PIN_HALF}" y2="${y}" stroke="#787878" stroke-width="${2 * PIN_HALF}" stroke-linecap="round"/><rect id="connector${id}pin" x="${x0}" y="${y - PIN_HALF}" width="200" height="${2 * PIN_HALF}" fill="none"/><rect id="connector${id}terminal" x="${tx}" y="${y - PIN_HALF}" width="0.1" height="${2 * PIN_HALF}" fill="none"/><text x="${left ? 100 : w - 100}" y="${y - 20}" font-family="Droid Sans" font-size="34.7" fill="#8c8c8c" text-anchor="middle">${id + 1}</text>`
    }
    const pins = range(half).flatMap(i => [pin(i, 100 + 100 * i, true), pin(n - 1 - i, 100 + 100 * i, false)])
    const body = `<rect x="200" y="${RECT_STROKE / 2}" width="${w - 400}" height="${h - RECT_STROKE}" fill="#ffffff" stroke="#000000" stroke-width="${RECT_STROKE}"/><text id="label" x="${w / 2}" y="${h / 2}" font-family="Droid Sans" font-size="48.6" text-anchor="middle">IC</text>`
    return svgHeader(w, h, MIL_PER_INCH, `<g id="schematic">${body}${pins.join('')}</g>`)
}

// PIN HEADER NA PROTOBOARD: N PINOS NUMA FILEIRA, PASSO 0,1 IN (SPEC 01 §8.4)
const breadboardHeader = (form: string, n: number) => {
    const female = form.includes('female')
    const pin    = (i: number) => `${female ? '' : `<rect x="${1000 * i + 100}" y="100" width="800" height="800" rx="150" fill="#404040"/>`}<rect id="connector${i}pin" x="${1000 * i + 306.15}" y="306.15" width="387.7" height="387.7" fill="${female ? '#1a1a1a' : '#8D8C8C'}"/><rect id="connector${i}terminal" x="${1000 * i + 350}" y="350" width="300" height="300" fill="none"/>`
    const back   = female ? `<rect width="${1000 * n}" height="1000" fill="#404040"/>` : ''
    return svgHeader(1000 * n, 1000, 10000, `<g id="breadboard">${back}${range(n).map(pin).join('')}</g>`)
}

const RIGHT_TERMINAL  = 36.021   // PT, TERMINAL DA COLUNA DIREITA DA FILEIRA DUPLA
const FEMALE_TERMINAL = 0.021    // PT, TERMINAL DO HEADER FÊMEA MEDIDO NOS SKETCHES DE EXEMPLO

// PIN HEADER NO ESQUEMÁTICO EM PONTOS: TERMINAL NA PONTA ESQUERDA (E DIREITA NA FILEIRA DUPLA) (SPEC 01 §8.4)
const schematicHeader = (form: string, n: number) => {
    const double = form.includes('double')
    const rows   = double ? n / 2 : n
    const width  = double ? 36 : 14.4
    const female = form.includes('female')
    const pin = (id: number, row: number, right: boolean) => {
        const y  = 3.6 + 7.2 * row
        const x  = (value: number) => right ? width - value : value
        const tip = female ? `<path d="M${x(14.1)},${y - 1.96} Q${x(9.9)},${y} ${x(14.1)},${y + 1.96}" fill="none" stroke="#000000" stroke-width="0.7" stroke-linecap="round"/>` : `<polyline points="${x(9.9)},${y - 1.96} ${x(14.1)},${y} ${x(9.9)},${y + 1.96}" fill="none" stroke="#000000" stroke-width="0.7" stroke-linecap="round"/>`
        const tx = right ? RIGHT_TERMINAL : female ? FEMALE_TERMINAL : 0
        return `<line id="connector${id}pin" x1="${x(0.35)}" y1="${y}" x2="${x(7.47)}" y2="${y}" stroke="#000000" stroke-width="0.7" stroke-linecap="round"/><rect id="connector${id}terminal" x="${tx - 0.25}" y="${y - 0.092}" width="0.5" height="0.2" fill="none"/>${tip}<text x="${x(5.05)}" y="${y - 1.02}" font-family="Droid Sans" font-size="2.5" fill="#8c8c8c" text-anchor="middle">${id + 1}</text>`
    }
    const pins = double ? range(rows).flatMap(j => [pin(2 * j, j, false), pin(2 * j + 1, j, true)]) : range(rows).map(i => pin(i, i, false))
    return svgHeader(width, 7.2 * rows, 72, `<g id="schematic">${pins.join('')}</g>`)
}

const HOLE_PITCH = 100

// PERFBOARD/STRIPBOARD: FURO (X, Y) EM (100 + 100X, 100 + 100Y) MIL, CONECTOR connector{1000Y+X} (SPEC 01 §8.7)
const breadboardBoard = (x: number, y: number) => {
    const w     = HOLE_PITCH * x + HOLE_PITCH
    const h     = HOLE_PITCH * y + HOLE_PITCH
    const holes = range(y).flatMap(iy => range(x).map(ix => `<circle id="connector${1000 * iy + ix}pin" cx="${100 + 100 * ix}" cy="${100 + 100 * iy}" r="27.5" fill="#3a3a3a" stroke="#c49c59" stroke-width="20"/>`))
    return svgHeader(w, h, MIL_PER_INCH, `<g id="breadboardbreadboard"><rect width="${w}" height="${h}" fill="#deb675"/>${holes.join('')}</g>`)
}

const SVG_RULES: [RegExp, (match: RegExpMatchArray) => string][] = [
    [/^pcb\/dip_(\d+)_([\d.]+(?:mil|mm|in))(?:_hs_.*)?_pcb\.svg$/, ([, n, spacing]) => pcbDip(Number(n), spacing)],
    [/^pcb\/(ns)?jumper(?:_(double|alternating))?_(\d+)_([\d.]+(?:mil|mm|in))(?:_hs_.*)?_pcb\.svg$/, ([, ns, variant, n, spacing]) => pcbHeader(!ns, variant ?? '', Number(n), spacing)],
    [/^breadboard\/generic_ic_dip_(\d+)_([\d.]+(?:mil|mm|in))_bread\.svg$/, ([, n, spacing]) => breadboardDip(Number(n), spacing)],
    [/^schematic\/generic_ic_dip_(\d+)_schem\.svg$/, ([, n]) => schematicDip(Number(n))],
    [/^breadboard\/generic_(\w+?)_pin_header_(\d+)_100mil_bread\.svg$/, ([, form, n]) => breadboardHeader(form, Number(n))],
    [/^schematic\/generic_(\w+?)_pin_header_(\d+)_100mil(?:_10thin)?_(?:schem|schematic)\.svg$/, ([, form, n]) => schematicHeader(form, Number(n))],
    [/^breadboard\/(\d+)\.(\d+)(?:perfboard|stripboard2?)\.svg$/, ([, x, y]) => breadboardBoard(Number(x), Number(y))]
]

export const generateSvg = (image: string) => {
    for (const [pattern, build] of SVG_RULES) {
        const match = image.match(pattern)

        if (match)
            return build(match)
    }

    return null
}

const SPACING_LABELS: Record<string, string> = { '1mm': '0.03937in (1.0mm)', '1.25mm': '0.04921in (1.25mm)', '50mil': '0.05in (1.27mm)', '1.5mm': '0.0591in (1.5mm)', '2mm': '0.07874in (2mm)', '2.5mm': '0.09843in (2.5mm)', '100mil': '0.1in (2.54mm)', '150mil': '0.15in (3.81mm)', '0.156in': '0.156in (3.96mm)', '200mil': '0.2in (5.08mm)' }

const FORM_LABELS: [RegExp, string][] = [[/shrouded/, '♂ (shrouded male)'], [/longpad/, 'long pad'], [/molex/, 'molex'], [/rounded/, '♀ (female rounded)'], [/female/, '♀ (female)'], [/./, '♂ (male)']]

type PinViews = { breadboard: string, schematic: string, pcb: string[] }

const connectorXml = (n: number, layers: PinViews, type: string, name: (i: number) => string) => range(n).map(i => {
    const terminal = layers.breadboard === 'breadboardbreadboard' ? '' : ` terminalId="connector${i}terminal"`
    const pcb      = layers.pcb.map(layer => `<p layer="${layer}" svgId="connector${i}pin"/>`).join('')
    return `<connector id="connector${i}" name="${name(i)}" type="${type}"><description>${name(i)}</description><views><breadboardView><p layer="${layers.breadboard}" svgId="connector${i}pin"${terminal}/></breadboardView><schematicView><p layer="${layers.schematic}" svgId="connector${i}pin"${terminal}/></schematicView><pcbView>${pcb}</pcbView></views></connector>`
}).join('\n')

const viewXml = (images: Record<string, string>, layers: Record<string, string[]>) => Object.entries(images).map(([view, image]) => `<${view}><layers image="${image}">${layers[view].map(layer => `<layer layerId="${layer}"/>`).join('')}</layers></${view}>`).join('\n')

const moduleXml = (moduleId: string, title: string, label: string, properties: Record<string, string>, views: string, connectors: string, extra = '') => `<?xml version="1.0" encoding="UTF-8"?>\n<module moduleId="${moduleId}">\n<version>4</version><author>CircuitMaster</author><title>${title}</title><label>${label}</label>\n<properties>${Object.entries(properties).map(([key, value]) => `<property name="${key}">${value}</property>`).join('')}</properties>\n<views>${views}</views>\n<connectors${extra}>${connectors}</connectors>\n</module>\n`

const THT_PCB = ['copper0', 'copper1']

// FZP DE PIN HEADER GENÉRICO A PARTIR DO MODULEID (SPEC 01 §8.4)
const headerFzp = (moduleId: string, form: string, n: number, spacing: string) => {
    const double   = form.includes('double')
    const pcbName  = `pcb/nsjumper${double ? '_double' : form.includes('alternating') ? '_alternating' : ''}_${n}_${spacing}_pcb.svg`
    const images   = { iconView: `breadboard/generic_${form}_pin_header_${n}_100mil_bread.svg`, breadboardView: `breadboard/generic_${form}_pin_header_${n}_100mil_bread.svg`, schematicView: `schematic/generic_${form.includes('female') ? 'female' : 'male'}_pin_header_${n}_100mil_schem.svg`, pcbView: pcbName }
    const layers   = { iconView: ['icon'], breadboardView: ['breadboard'], schematicView: ['schematic'], pcbView: ['copper0', 'silkscreen', 'copper1'] }
    const formName = FORM_LABELS.find(([pattern]) => pattern.test(form))?.[1] ?? ''
    const props    = { family: 'Pin Header', Pins: String(n), Form: formName, 'Pin Spacing': SPACING_LABELS[spacing] ?? spacing, Row: double ? 'double' : 'single', package: 'THT', Position: form.includes('alternating') ? 'alternating' : '', 'hole size': '' }
    return moduleXml(moduleId, `Generic ${form.replaceAll('_', ' ')} header - ${n} pins`, 'J', props, viewXml(images, layers), connectorXml(n, { breadboard: 'breadboard', schematic: 'schematic', pcb: THT_PCB }, 'male', i => `pin${i + 1}`))
}

const dipFzp = (moduleId: string, n: number, spacing: string) => {
    const images = { iconView: `breadboard/generic_ic_dip_${n}_${spacing}_bread.svg`, breadboardView: `breadboard/generic_ic_dip_${n}_${spacing}_bread.svg`, schematicView: `schematic/generic_ic_dip_${n}_schem.svg`, pcbView: `pcb/dip_${n}_${spacing}_pcb.svg` }
    const layers = { iconView: ['icon'], breadboardView: ['breadboard'], schematicView: ['schematic'], pcbView: ['silkscreen', 'copper0', 'copper1'] }
    const props  = { family: 'Generic IC', package: 'DIP (Dual Inline) [THT]', pins: String(n), 'pin spacing': spacing, 'chip label': 'IC', 'hole size': '', 'editable pin labels': 'true' }
    return moduleXml(moduleId, `Generic IC DIP ${n} pins`, 'IC', props, viewXml(images, layers), connectorXml(n, { breadboard: 'breadboard', schematic: 'schematic', pcb: THT_PCB }, 'male', i => `pin${i + 1}`))
}

const boardFzp = (moduleId: string, x: number, y: number, type: string) => {
    const image  = `breadboard/${x}.${y}${type.toLowerCase()}.svg`
    const images = { iconView: image, breadboardView: image, schematicView: image, pcbView: image }
    const layer  = ['breadboardbreadboard']
    const layers = { iconView: ['icon'], breadboardView: layer, schematicView: layer, pcbView: layer }
    const holes  = range(x * y).map(i => `<connector id="connector${1000 * Math.floor(i / x) + (i % x)}" name="${i % x}.${Math.floor(i / x)}" type="female"><description>perfboard socket</description><views>${['breadboardView', 'schematicView', 'pcbView'].map(view => `<${view}><p layer="breadboardbreadboard" svgId="connector${1000 * Math.floor(i / x) + (i % x)}pin"/></${view}>`).join('')}</views></connector>`).join('\n')
    return moduleXml(moduleId, `${type} ${x}x${y}`, type, { family: 'Prototyping Board', type, size: `${x}.${y}` }, viewXml(images, layers), holes, ' ignoreTerminalPoints="true"')
}

const FZP_RULES: [RegExp, (match: RegExpMatchArray) => string][] = [
    [/^generic_(\w+?)_pin_header_(\d+)_([\d.]+(?:mil|mm|in))$/, ([id, form, n, spacing]) => headerFzp(id, form, Number(n), spacing)],
    [/^generic_ic_dip_(\d+)_([\d.]+(?:mil|mm|in))$/, ([id, n, spacing]) => dipFzp(id, Number(n), spacing)],
    [/^(\d+)\.(\d+)(Perfboard|Stripboard2?)ModuleID$/, ([id, x, y, type]) => boardFzp(id, Number(x), Number(y), type.replace(/2$/, ''))]
]

export const generateFzp = (moduleId: string) => {
    for (const [pattern, build] of FZP_RULES) {
        const match = moduleId.match(pattern)

        if (match)
            return build(match)
    }

    return null
}

// TRECHOS DE TIRA LIGADOS DE UMA STRIPBOARD; buses LISTA OS CORTES "x.yh"/"x.yv" (SPEC 01 §8.7)
export const getStrips = (moduleId: string, properties: Record<string, string>) => {
    const size = moduleId.match(/^(\d+)\.(\d+)Stripboard(2?)ModuleID$/)

    if (!size)
        return []

    const [x, y]  = [Number(size[1]), Number(size[2])]
    const layout  = properties.layout || (size[3] ? 'vertical strips' : 'horizontal strips')
    const listed  = (properties.buses ?? '').trim()
    const cutAll  = layout.startsWith('vertical') ? 'h' : layout.startsWith('horizontal') ? 'v' : 'hv'
    const cuts    = new Set(listed ? listed.split(/\s+/) : range(x * y).flatMap(i => [...cutAll].map(axis => `${i % x}.${Math.floor(i / x)}${axis}`)))
    const id      = (ix: number, iy: number) => `connector${1000 * iy + ix}`

    return range(x * y).flatMap(i => {
        const [ix, iy] = [i % x, Math.floor(i / x)]
        const right    = ix < x - 1 && !cuts.has(`${ix}.${iy}h`) ? [[id(ix, iy), id(ix + 1, iy)]] : []
        const down     = iy < y - 1 && !cuts.has(`${ix}.${iy}v`) ? [[id(ix, iy), id(ix, iy + 1)]] : []
        return [...right, ...down]
    })
}

const BAND_COLORS: Record<number, string> = { [-2]: '#c0c0c0', [-1]: '#ad9f4e', 0: '#000000', 1: '#8a3d06', 2: '#c40808', 3: '#ff4d00', 4: '#ffd500', 5: '#00a33d', 6: '#0060b6', 7: '#8210d2', 8: '#8c8c8c', 9: '#ffffff' }
const TOLERANCE_COLORS: Record<string, string> = { '±0.05%': '#8c8c8c', '±0.1%': '#8210d2', '±0.25%': '#0060b6', '±0.5%': '#00a33d', '±1%': '#8a3d06', '±2%': '#c40808', '±5%': '#ad9f4e', '±10%': '#c0c0c0', '±20%': '#dbb477' }

const bandColor = (index: number) => BAND_COLORS[index] ?? BAND_COLORS[0]

// FAIXAS DO RESISTOR: DÍGITOS DE R EM NOTAÇÃO CIENTÍFICA E MULTIPLICADOR m = ⌊log10(R/N)⌋ (SPEC 01 §8.2)
export const getResistorBands = (moduleId: string, resistance: number, tolerance: string): [string, string][] => {
    const digits   = resistance.toExponential(3).split('e')[0].replace('.', '').split('').map(Number)
    const five     = moduleId.includes('5Band')
    const value    = five ? 100 * digits[0] + 10 * digits[1] + digits[2] : 10 * digits[0] + digits[1]
    const exponent = value === 0 ? 0 : Math.log10(resistance / value)
    const exact    = Math.abs(exponent - Math.round(exponent)) < 1e-9 ? Math.round(exponent) : Math.trunc(exponent)
    const third: [string, string][] = five ? [['band_3', bandColor(digits[2])]] : []
    return [['band_1_st', bandColor(digits[0])], ['band_2_nd', bandColor(digits[1])], ...third, ['band_rd_multiplier', bandColor(exact)], ['gold_band', TOLERANCE_COLORS[tolerance.replace(/\s/g, '')] ?? TOLERANCE_COLORS['±5%']]]
}

const OLD_SCHEMATIC = '0.3.schem.'
const NOTO_WIDTH    = 0.77     // CORREÇÃO DA REFERÊNCIA SOBRE A MÉTRICA DA NOTO SANS
const LEGACY_EM     = 1.0392   // UNIDADES POR em/F MEDIDAS NOS NET LABELS DOS SKETCHES DE EXEMPLO (DEPENDE DO DPI DE QUEM SALVOU)
const LABEL_STEP    = 50       // LARGURA DA CAIXA ARREDONDADA PARA CIMA EM PASSOS DE 50

export type NetLabel = { label: string, left: boolean, style: 'legacy' | 'left' | 'right', divisor: number }

const advance = (text: string, table: number[], upm: number) => [...text].reduce((sum, char) => sum + (table[char.charCodeAt(0) - 32] ?? upm / 2), 0) / upm

const escapeXml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

// OPÇÕES DO NET LABEL DA INSTÂNCIA: RÓTULO, DIREÇÃO, ESTILO PELA VERSÃO DA PEÇA E DIVISOR DE ESQUEMÁTICO ANTIGO (SPEC 01 §8.9)
export const getNetLabel = (moduleId: string, version: number, properties: Record<string, string>): NetLabel | null => {
    if (!moduleId.endsWith('NetLabelModuleID'))
        return null

    const direction = properties.direction || (moduleId.toLowerCase().includes('left') ? 'left' : 'right')
    const style     = version <= 4 ? 'legacy' : properties.style === 'connector' || properties.style === 'right' ? 'right' : 'left'
    return { label: properties.label || 'net label', left: direction === 'left', style, divisor: moduleId.includes(OLD_SCHEMATIC) ? 1 : 3 }
}

// NET LABEL GERADO: CAIXA COM SETA E TEXTO, LARGURA PELAS MÉTRICAS DA FONTE DO ESTILO; mirrored DESESPELHA O TEXTO (SPEC 01 §8.9)
export const netLabelSvg = ({ label, left, style, divisor }: NetLabel, mirrored: boolean) => {
    const legacy  = style === 'legacy'
    const font    = 200 / divisor
    const height  = 300 / divisor
    const arrow   = height / 2
    const stroke  = 10 / divisor
    const half    = stroke / 2
    const base    = (legacy ? 220 : 228) / divisor
    const pad     = (legacy ? 20 : 50) / divisor
    const measure = legacy ? advance(label, DROID_ASCII, DROID_UPM) * font * LEGACY_EM : advance(label, NOTO_ASCII, NOTO_UPM) * font * SCREEN_SCALE * NOTO_WIDTH
    const width   = legacy ? measure + arrow + pad : Math.ceil((measure - pad) / LABEL_STEP) * LABEL_STEP + arrow + 2 * pad
    const band    = [pad + (left ? arrow : 0), width - pad - (left ? 0 : arrow)]
    const atStart = legacy || style === 'left'
    const x       = legacy ? pad + (left ? arrow : 0) : atStart ? band[0] : band[1]
    const center  = legacy ? x + measure / 2 : (band[0] + band[1]) / 2
    const flip    = mirrored ? ` transform="translate(${2 * center} 0) scale(-1 1)"` : ''
    const points  = left ? [[half, height / 2], [arrow, half], [width - half, half], [width - half, height - half], [arrow, height - half]] : [[width - half, height / 2], [width - arrow, half], [half, half], [half, height - half], [width - arrow, height - half]]
    const pin     = left ? [0, 0] : [width - arrow - 0.1, 0]
    const tip     = left ? 0 : width
    const shape   = `<rect id="connector0pin" x="${pin[0]}" y="${pin[1]}" width="${arrow}" height="${height}" fill="none" stroke="none"/><rect id="connector0terminal" x="${tip}" y="${height / 2}" width="0.1" height="0.1" fill="none" stroke="none"/><polygon fill="white" stroke="#000000" stroke-width="${stroke}" points="${points.map(point => point.join(',')).join(' ')}"/>`
    const text    = `<text id="label" x="${x}" y="${base}" fill="#000000" font-family="${legacy ? 'Droid Sans' : 'Noto Sans'}" text-anchor="${atStart ? 'start' : 'end'}" font-size="${font}"${flip}>${escapeXml(label)}</text>`
    return svgHeader(width, height, MIL_PER_INCH, `<g id="schematic">${shape}</g><g id="schematicText">${text}</g>`)
}

// TEXTO DE TENSÃO DOS SÍMBOLOS DE REFERÊNCIA: trunc(V·1000)/1000 SEGUIDO DE V (SPEC 01 §8.9)
export const voltageText = (voltage: string) => `${Math.trunc((Number(voltage) || 0) * 1000) / 1000}V`

// LOGO COM TAMANHO PRÓPRIO: AS PROPRIEDADES width/height (mm) DA INSTÂNCIA SOBREPÕEM O TAMANHO DO SVG GUARDADO EM shape
export const sizeSvg = (text: string, width: number, height: number) => {
    const root = parseXml(text)

    if (!root || !(width > 0) || !(height > 0))
        return text

    root.setAttribute('width', `${width}mm`)
    root.setAttribute('height', `${height}mm`)
    return serializeXml(root)
}

const RESIZABLE_BOARDS = new Set(['RectanglePCBModuleID', 'TwoLayerRectanglePCBModuleID', 'EllipsePCBModuleID', 'TwoLayerEllipsePCBModuleID', 'RoundRectPCBModuleID', 'TwoLayerRoundRectPCBModuleID'])

export const isResizableBoard = (moduleId: string) => RESIZABLE_BOARDS.has(moduleId)

// PLACA REDIMENSIONÁVEL: TELA EM mm E A FOLHA DE CADA CAMADA AJUSTADA DESCONTANDO O TRAÇO (SPEC 01 §8.10)
export const resizeBoardSvg = (text: string, width: number, height: number) => {
    const root   = parseXml(text)
    const leaves: XmlElement[] = []

    walk(root, element => {
        if (element !== root && !childrenOf(element).length && ['rect', 'ellipse', 'circle', 'path', 'polygon'].includes(tagOf(element)))
            leaves.push(element)
    })

    root.setAttribute('width', `${width}mm`)
    root.setAttribute('height', `${height}mm`)
    root.setAttribute('viewBox', `0 0 ${width} ${height}`)

    leaves.forEach(leaf => {
        const stroke = Number(leaf.getAttribute('stroke-width') ?? 0)
        const sizes: [string, number][] = tagOf(leaf) === 'ellipse' ? [['cx', width / 2], ['cy', height / 2], ['rx', (width - stroke) / 2], ['ry', (height - stroke) / 2]] : tagOf(leaf) === 'rect' ? [['width', width - stroke], ['height', height - stroke]] : []
        sizes.forEach(([name, value]) => leaf.setAttribute(name, String(value)))
    })

    return serializeXml(root)
}
