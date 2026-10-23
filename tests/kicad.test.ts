import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { parentOf, pinEnds, pinsOf, readSymbol, symbolSvg, type KicadSymbol } from '../src/core/KicadSymbol'
import { footprintSvg, isTop, padBox, padsOf, readFootprint, type KicadFootprint } from '../src/core/KicadFootprint'
import { SvgFile } from '../src/core/SvgFile'
import { PX_PER_INCH } from '../src/core/Units'
import type { Box, Point } from '../src/core/Geometry'
import { emptyDoc, keyOf } from '../src/core/Document'
import { VIEWS } from '../src/core/Layer'
import { Netlist } from '../src/core/Netlist'
import { footprintOf, footprintPath, kicadBundle, kicadId } from '../src/core/KicadPart'
import { listFiles } from '../tools/Fritzing'
import { createInstance, createWire, setProperty } from '../src/engine/Edit'
import { SIGNAL_KEY, buildCircuit } from '../src/core/Spice'
import { Ngspice } from '../src/core/Ngspice'
import { Simulation } from '../src/engine/Simulation'
import { getStepResponse } from '../src/engine/Response'
import { getPropertyDefs } from '../src/core/Properties'
import type { Doc } from '../src/core/Document'
import type { Library } from '../src/core/Library'
import createNgspice from '../src/workers/Simulator/ngspice/ngspice.js'
import { loadWasm, makeLibrary, writeReport } from './Fixtures'
import { ROOTS } from '../tools/KiCad'

const HAS_KICAD = fs.existsSync(ROOTS.symbols)
const CLI       = process.env.KICAD_CLI ?? 'kicad-cli'
const HAS_CLI   = HAS_KICAD && spawnSync(CLI, ['version']).status === 0
const OUT       = path.resolve('build/kicad/symbols')
const MIL       = 1000 / 25.4
const SAMPLE    = [['Device', 'R'], ['Device', 'C'], ['Amplifier_Operational', 'LM358'], ['Timer', 'NE555P'], ['MCU_Microchip_ATmega', 'ATmega328P-P']]

// SÍMBOLO DA BIBLIOTECA, COM O PAI QUANDO É DERIVADO (NO KICAD 10 CADA SÍMBOLO É UM ARQUIVO DA PASTA .kicad_symdir)
const load = (library: string, name: string): KicadSymbol | null => {
    const file   = path.join(ROOTS.symbols, `${library}.kicad_symdir`, `${name}.kicad_sym`)
    const text   = fs.readFileSync(file, 'utf8')
    const parent = parentOf(text)
    return readSymbol(text, parent ? load(library, parent) : null)
}

type Segment = [number, number, number, number]

// SEGMENTOS COM AS PONTAS EM ORDEM E TRANSLADADOS PARA O CANTO DO CONJUNTO, EM 0,01 mm: COMPARA A FORMA SEM DEPENDER DA ORIGEM DO DESENHO
const normalize = (segments: Segment[]) => {
    const ordered = segments.map(([x1, y1, x2, y2]): Segment => x1 < x2 || (x1 === x2 && y1 <= y2) ? [x1, y1, x2, y2] : [x2, y2, x1, y1])
    const [mx, my] = [Math.min(...ordered.flatMap(s => [s[0], s[2]])), Math.min(...ordered.flatMap(s => [s[1], s[3]]))]
    return ordered.map(s => [s[0] - mx, s[1] - my, s[2] - mx, s[3] - my].map(v => Math.round(v * 100)).join(',')).sort()
}

// TRAÇOS DOS PINOS NO SVG DO EESCHEMA: SEGMENTOS RETOS NOS GRUPOS DE TRAÇO 0,1524 mm (O CORPO DESTES SÍMBOLOS É DE 0,254 mm)
const kicadPins = (svg: string) => [...svg.matchAll(/<g style="fill:none;\s*stroke:#840000; stroke-width:0\.1524;[^>]*>([\s\S]*?)<\/g>/g)].flatMap(([, group]) => [...group.matchAll(/<path d="M([\d.-]+) ([\d.-]+)\s*L([\d.-]+) ([\d.-]+)\s*"/g)].map(match => match.slice(1).map(Number) as Segment))

const cli = (...args: string[]) => execFileSync(CLI, args, { encoding: 'utf8', timeout: 300000 })

describe.skipIf(!HAS_KICAD)('símbolo do KiCad como esquemático de peça (spec 08 §2)', () => {
    it('lê pinos, unidades, propriedades e o símbolo derivado com o desenho do pai', () => {
        const r = load('Device', 'R')
        expect(r?.properties.Reference).toBe('R')
        expect(pinsOf(r as KicadSymbol).map(pin => pin.number)).toEqual(['1', '2'])
        expect(pinEnds(r?.pins[0] as KicadSymbol['pins'][number])).toEqual([[0, 3.81], [0, 2.54]])

        const op = load('Amplifier_Operational', 'LM358')
        expect(op?.units).toBe(3)
        expect(pinsOf(op as KicadSymbol)).toHaveLength(8)
    })

    it('o esquemático tem um connectorNpin e um connectorNterminal por pino, na ponta onde o fio liga', () => {
        const symbol = load('Timer', 'NE555P') as KicadSymbol
        const svg    = symbolSvg(symbol)
        pinsOf(symbol).forEach((_, i) => {
            expect(svg).toContain(`id="connector${i}pin"`)
            expect(svg).toContain(`id="connector${i}terminal"`)
        })
        expect(svg).toContain('<g id="schematic">')
    })
})

describe.skipIf(!HAS_CLI)('oráculo kicad-cli: os pinos desenhados batem com o sym export svg (spec 08 §2, fase 5)', () => {
    it.each(SAMPLE)('%s:%s', (library, name) => {
        const symbol = load(library, name) as KicadSymbol
        const output = path.join(OUT, library, name)
        fs.rmSync(output, { recursive: true, force: true })
        fs.mkdirSync(output, { recursive: true })
        cli('sym', 'export', 'svg', '-o', output, '-s', name, path.join(ROOTS.symbols, `${library}.kicad_symdir`))

        const ours   = symbolSvg(symbol)
        fs.writeFileSync(path.join(output, 'nosso.svg'), ours)
        const groups = [...ours.matchAll(/<g transform="translate\(([\d.e-]+) ([\d.e-]+)\)">([\s\S]*?)<\/g>/g)].map(([, , , body]) => [...body.matchAll(/<line x1="([\d.e-]+)" y1="([\d.e-]+)" x2="([\d.e-]+)" y2="([\d.e-]+)"/g)].map(match => match.slice(1).map(value => Number(value) / MIL) as Segment))

        groups.forEach((segments, i) => {
            const file = path.join(output, `${name}${symbol.units > 1 ? `_unit${i + 1}` : '_unit1'}.svg`)
            expect(normalize(segments), `${name} unidade ${i + 1}`).toEqual(normalize(kicadPins(fs.readFileSync(file, 'utf8'))))
        })
    })
})

const FOOTPRINTS = [['Resistor_THT', 'R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal'], ['Package_DIP', 'DIP-8_W7.62mm'], ['Package_SO', 'SOIC-8_3.9x4.9mm_P1.27mm'], ['Connector_PinHeader_2.54mm', 'PinHeader_1x03_P2.54mm_Vertical'], ['Package_DFN_QFN', 'QFN-16-1EP_3x3mm_P0.5mm_EP1.75x1.75mm'], ['Package_QFP', 'TQFP-144_16x16mm_P0.4mm'], ['Connector_USB', 'USB_A_Connfly_DS1098_Horizontal'], ['LED_THT', 'LED_D5.0mm'], ['Package_TO_SOT_SMD', 'SOT-23']]
const TOLERANCE  = 0.02    // mm: O kicad-cli APROXIMA ARCOS E CANTOS ARREDONDADOS POR POLÍGONOS

const footprint = (library: string, name: string) => readFootprint(fs.readFileSync(path.join(ROOTS.footprints, `${library}.pretty`, `${name}.kicad_mod`), 'utf8')) as KicadFootprint

// CAIXAS DO COBRE DE CIMA (#C83434) E FUROS (CÍRCULOS BRANCOS) DO fp export svg, EM mm
const kicadPads = (svg: string) => {
    const groups = [...svg.matchAll(/<g style="fill:#C83434[^"]*">([\s\S]*?)<\/g>/g)].flatMap(([, body]) => [...body.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="([\d.-]+)"/g)].map(([, x, y, r]): Box => [Number(x) - Number(r), Number(y) - Number(r), Number(x) + Number(r), Number(y) + Number(r)]))
    const paths  = [...svg.matchAll(/<path style="fill:#C83434[^"]*"\s*d="([^"]*)"/g)].map(([, d]): Box => {
        const values = [...d.matchAll(/-?[\d.]+/g)].map(Number)
        const xs     = values.filter((_, i) => i % 2 === 0)
        const ys     = values.filter((_, i) => i % 2 === 1)
        return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    })
    const strokes = (color: string) => [...svg.matchAll(new RegExp(`stroke:${color}; stroke-width:([\\d.]+);[^>]*>([\\s\\S]*?)<\\/g>`, 'g'))].flatMap(([, width, body]) => [...body.matchAll(/<path d="M([\d.-]+) ([\d.-]+)\s*L([\d.-]+) ([\d.-]+)/g)].map(match => [...match.slice(1).map(Number), Number(width)]))
    const ovals   = strokes('#C83434').map(([x1, y1, x2, y2, w]): Box => [Math.min(x1, x2) - w / 2, Math.min(y1, y2) - w / 2, Math.max(x1, x2) + w / 2, Math.max(y1, y2) + w / 2])
    const holes   = [...svg.matchAll(/<g style="fill:#FFFFFF[^"]*">([\s\S]*?)<\/g>/g)].flatMap(([, body]) => [...body.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="([\d.-]+)"/g)].map(([, x, y, r]) => [Number(x), Number(y), 2 * Number(r)]))
    const slots   = strokes('#FFFFFF').map(([x1, y1, x2, y2, w]) => [(x1 + x2) / 2, (y1 + y2) / 2, w])
    return { pads: [...new Map([...groups, ...paths, ...ovals].map(box => [box.map(value => value.toFixed(3)).join(), box])).values()], holes: [...holes, ...slots] }
}

// CAIXAS TRANSLADADAS PARA O CANTO DO CONJUNTO E EM ORDEM, PARA COMPARAR SEM DEPENDER DA ORIGEM
const relative = (boxes: Box[], origin: [number, number]) => boxes.map(box => [box[0] - origin[0], box[1] - origin[1], box[2] - origin[0], box[3] - origin[1]]).sort((a, b) => a.map(value => value.toFixed(2)).join() < b.map(value => value.toFixed(2)).join() ? -1 : 1)
const cornerOf = (boxes: Box[]): [number, number] => [Math.min(...boxes.map(box => box[0])), Math.min(...boxes.map(box => box[1]))]

describe.skipIf(!HAS_KICAD)('footprint do KiCad como PCB de peça (spec 08 §3)', () => {
    it('lê pads, furos, giro e camadas; o pad de cada número é um conector', () => {
        const dip = footprint('Package_DIP', 'DIP-8_W7.62mm')
        expect(padsOf(dip).map(pad => pad.number)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
        expect(dip.pads[0]).toMatchObject({ type: 'thru_hole', shape: 'roundrect', drill: [0.8, 0.8] })

        const usb = footprint('Connector_USB', 'USB_A_Connfly_DS1098_Horizontal')
        expect(usb.pads.some(pad => pad.type === 'np_thru_hole')).toBe(true)
        expect(padsOf(usb).every(pad => pad.type !== 'np_thru_hole')).toBe(true)
    })

    it('cada conector desenhado no SVG ocupa a caixa do pad, no cobre certo: passante nos dois, SMD só no de cima', () => {
        for (const [library, name] of FOOTPRINTS) {
            const fp    = footprint(library, name)
            const ids   = new Map(padsOf(fp).map((pad, i) => [pad.number, i]))
            const svg   = new SvgFile(footprintSvg(fp, ids))
            svg.update()
            const mm    = (box: Box): Box => box.map(value => value / PX_PER_INCH * 25.4) as Box
            const ours  = padsOf(fp).map(pad => mm(svg.getBox(`connector${ids.get(pad.number)}${pad.drill ? 'pin' : 'pad'}`, pad.drill ? 'copper0' : 'copper1') ?? [0, 0, 0, 0]))
            const model = padsOf(fp).map(padBox)
            const shift = [ours[0][0] - model[0][0], ours[0][1] - model[0][1]]
            model.forEach((box, i) => box.forEach((value, k) => expect(Math.abs(ours[i][k] - value - shift[k % 2]), `${name} pad ${padsOf(fp)[i].number}`).toBeLessThan(1e-6)))
            padsOf(fp).filter(pad => pad.drill).forEach(pad => expect(svg.getBox(`connector${ids.get(pad.number)}pin`, 'copper1'), `${name} pad ${pad.number} no cobre de cima`).not.toBeNull())
        }
    })
})

describe.skipIf(!HAS_CLI)('oráculo kicad-cli: pads e furos batem com o fp export svg (spec 08 §3, fase 5)', () => {
    it.each(FOOTPRINTS)('%s:%s', (library, name) => {
        const output = path.join(OUT, '..', 'footprints', library)
        fs.mkdirSync(output, { recursive: true })
        cli('fp', 'export', 'svg', '-o', output, '--fp', name, '--layers', 'F.Cu', path.join(ROOTS.footprints, `${library}.pretty`))

        const fp     = footprint(library, name)
        const kicad  = kicadPads(fs.readFileSync(path.join(output, `${name}.svg`), 'utf8'))
        const boxes  = [...new Map(fp.pads.filter(pad => isTop(pad) && pad.type !== 'np_thru_hole').map(padBox).map(box => [box.map(value => value.toFixed(3)).join(), box])).values()]
        const ours   = relative(boxes, cornerOf(boxes))
        const theirs = relative(kicad.pads, cornerOf(kicad.pads))
        expect(ours.length, `${name}: pads`).toBe(theirs.length)
        ours.forEach((box, i) => box.forEach((value, k) => expect(Math.abs(value - theirs[i][k]), `${name}: pad ${i} ${box.join()} × ${theirs[i].join()}`).toBeLessThan(TOLERANCE)))

        const drilled = fp.pads.filter(pad => pad.drill && pad.type === 'thru_hole' && isTop(pad))
        const origin  = cornerOf(boxes)
        const ourHoles = drilled.map(pad => [pad.at[0] - origin[0], pad.at[1] - origin[1], Math.min(...pad.drill as [number, number])].map(value => value.toFixed(2)).join()).sort()
        const kiHoles  = kicad.holes.map(([x, y, d]) => [x - cornerOf(kicad.pads)[0], y - cornerOf(kicad.pads)[1], d].map(value => value.toFixed(2)).join()).sort()
        expect(ourHoles, `${name}: furos`).toEqual(kiHoles)
    })
})

const everywhere = (point: Point) => Object.fromEntries(VIEWS.map(view => [view, point])) as Record<typeof VIEWS[number], Point>

describe.skipIf(!HAS_KICAD)('símbolo e footprint do KiCad como peça de três vistas (spec 08 §4)', () => {
    it('a Library monta a peça pelo moduleId cm:Biblioteca:Símbolo, com pinos nas três vistas e o pacote para o .fzz', async () => {
        const library = makeLibrary()
        const r       = kicadId('Device', 'R')
        const timer   = kicadId('Timer', 'NE555P')
        const ground  = kicadId('power', 'GND')
        expect(await library.load([r, timer, ground])).toBe(3)

        const part = library.getPart(r)
        expect(part?.title).toBe('R')
        expect(part?.label).toBe('R')
        expect(part?.connectors.map(connector => connector.id)).toEqual(['connector0', 'connector1'])
        expect(part?.properties['kicad symbol']).toBe('Device:R')
        expect(library.getPart(timer)?.connectors).toHaveLength(8)
        expect(library.getPart(timer)?.properties.package).toBe('DIP-8_W7.62mm')

        for (const moduleId of [r, timer])
            for (const [view, layer] of [['schematicView', 'schematic'], ['breadboardView', 'breadboard'], ['pcbView', 'copper0'], ['pcbView', 'copper1']] as const)
                library.getPart(moduleId)?.connectors.forEach(connector => expect(library.getPins(moduleId, view, layer).get(connector.id), `${moduleId} ${connector.id} ${layer}`).toBeDefined())

        expect(Object.keys(library.getPart(ground)?.views ?? {}).sort()).toEqual(['iconView', 'schematicView'])
        expect(library.getBundleFiles([r]).map(file => file.name).sort()).toEqual(['part.cm_Device_R.fzp', 'svg.breadboard.cm_Device_R_bread.svg', 'svg.pcb.cm_Device_R_pcb.svg', 'svg.schematic.cm_Device_R_schem.svg'])
        expect(await library.load([kicadId('Device', 'NaoExiste')])).toBe(0)
    })

    it('footprint padrão pelos filtros do símbolo genérico e footprint escolhido no moduleId (SMD só no cobre de cima)', async () => {
        const library = makeLibrary()
        const smd     = kicadId('Device', 'R', 'Resistor_SMD:R_0805_2012Metric')
        await library.load([kicadId('Device', 'LED'), kicadId('Device', 'C_Polarized'), smd])

        expect(library.getPart(kicadId('Device', 'LED'))?.properties.package).toBe('LED_D5.0mm')
        expect(library.getPart(kicadId('Device', 'C_Polarized'))?.properties.package).toBe('CP_Radial_D5.0mm_P2.50mm')
        expect(library.getPart(smd)?.properties.package).toBe('R_0805_2012Metric')
        expect(library.getPart(smd)?.connectors.map(connector => [connector.type, `${connector.views.pcbView?.[0].layer}:${connector.views.pcbView?.[0].svgId}`])).toEqual([['pad', 'copper1:connector0pad'], ['pad', 'copper1:connector1pad']])
    })

    it('um fio no esquemático entre duas peças do KiCad liga as mesmas portas na protoboard e na PCB', async () => {
        const library = makeLibrary()
        const r       = kicadId('Device', 'R')
        await library.load([r, 'WireModuleID'])

        const placed  = [[0, 0], [400, 0]].reduce((doc, point) => createInstance(doc, library, r, everywhere(point as Point)), emptyDoc())
        const wired   = createWire(placed, library, 'schematicView', keyOf('1', 'connector1'), keyOf('2', 'connector0'))
        const netlist = new Netlist(wired, library, await loadWasm())
        netlist.update()

        VIEWS.forEach(view => expect(netlist.getNet(view, keyOf('1', 'connector1')), view).toContain(keyOf('2', 'connector0')))
    })
})

// FONTE DC DO FRITZING, A PEÇA DO KICAD NO MEIO E O TERRA: FIOS PELO NÚMERO DO PINO DO KICAD
const series = async (library: Library, parts: string[], wires: [string, string][], change: (doc: Doc) => Doc = doc => doc) => {
    const placed  = parts.reduce((doc, moduleId, i) => createInstance(doc, library, moduleId, everywhere([300 * i, 0])), emptyDoc())
    const wired   = change(wires.reduce((doc, [a, b]) => createWire(doc, library, 'schematicView', a, b), placed))
    const netlist = new Netlist(wired, library, await loadWasm())
    netlist.update()
    const circuit = buildCircuit(wired, library, netlist, true)
    const ngspice = new Ngspice(await createNgspice())
    ngspice.setup()
    const result  = ngspice.run(circuit.deck)
    expect(result.error, circuit.deck).toBeNull()
    return { circuit, sim: new Simulation(wired, library, circuit, result.vectors) }
}

describe.skipIf(!HAS_KICAD)('peças básicas do KiCad simulam como as do Fritzing (spec 08 §4)', () => {
    it('resistor e LED do KiCad com a fonte DC: o LED acende com (5 − 2) / 220 Ω e a resistência é editável no inspetor', async () => {
        const library = makeLibrary()
        const parts   = ['5_DCPowerSupplyModuleID', kicadId('Device', 'R'), kicadId('Device', 'LED'), 'GroundModuleID']
        await library.load([...parts, 'WireModuleID'])

        expect(getPropertyDefs(kicadId('Device', 'R')).map(item => item.name)).toContain('resistance')
        expect(library.getPart(kicadId('Device', 'LED'))?.connectors.map(connector => connector.name)).toEqual(['cathode', 'anode'])

        const wires: [string, string][] = [['1/connector1', '2/connector0'], ['2/connector1', '3/connector1'], ['3/connector0', '4/connector0'], ['1/connector0', '4/connector0']]
        const { circuit, sim } = await series(library, parts, wires, doc => setProperty(doc, '2', 'resistance', '220Ω'))
        expect(circuit.deck).toMatch(/^D\S+ \S+ \S+ LED_GENERIC$/m)
        expect(sim.getCurrent('3', 0)).toBeGreaterThan(0.010)
        expect(sim.getCurrent('3', 0)).toBeLessThan(0.016)
        expect(sim.getEffect('3', 0).light).toBeGreaterThan(0)
        expect(sim.getEffect('2', 0).smoke).toBe(false)
    })

    it('eletrolítico do KiCad carrega pelo resistor do KiCad com o degrau na fonte: τ = 1 kΩ · 100 µF', async () => {
        const library = makeLibrary()
        const parts   = ['5_DCPowerSupplyModuleID', kicadId('Device', 'R'), kicadId('Device', 'C_Polarized'), 'GroundModuleID']
        await library.load([...parts, 'WireModuleID'])

        const wires: [string, string][] = [['1/connector1', '2/connector0'], ['2/connector1', '3/connector0'], ['3/connector1', '4/connector0'], ['1/connector0', '4/connector0']]
        const { sim } = await series(library, parts, wires, doc => setProperty(setProperty(setProperty(doc, '1', SIGNAL_KEY, 'step'), '2', 'resistance', '1kΩ'), '3', 'capacitance', '100µF'))
        const step    = getStepResponse(sim.vectors.time, Float64Array.from(sim.vectors.time, (_, i) => sim.getBetween(keyOf('3', 'connector0'), keyOf('3', 'connector1'), i)), 0, Infinity)
        expect(step?.tau).toBeGreaterThan(0.097)
        expect(step?.tau).toBeLessThan(0.103)
        expect(Array.from({ length: sim.steps }, (_, i) => sim.getEffect('3', i).smoke).some(Boolean)).toBe(false)
    })
})

const GRID = PX_PER_INCH / 10    // px ENTRE DOIS FUROS DA PROTOBOARD

// SEÇÃO 12 DO PLANO: TODO SÍMBOLO COM PINOS ENTRA NA PROTOBOARD, PELO FOOTPRINT PASSANTE DE 0,1 in OU PELA PLACA ADAPTADORA
describe.skipIf(!HAS_KICAD)('toda peça das bibliotecas entra na protoboard (spec 08 §3, seção 12 do plano)', () => {
    it('em todos os símbolos, cada pino tem lugar na protoboard e os pinos caem na grade de 0,1 in', () => {
        const failures: string[] = []
        const counts   = { footprint: 0, adapter: 0, schematic: 0 }

        for (const file of listFiles(ROOTS.symbols, '', '.kicad_sym')) {
            const [folder, base] = file.split('/')
            const [library, name] = [folder.replace('.kicad_symdir', ''), base.replace('.kicad_sym', '')]
            const symbol = load(library, name)

            if (!symbol || symbol.power || !pinsOf(symbol).length) {
                counts.schematic++
                continue
            }

            const field     = footprintOf(symbol)
            const where     = footprintPath(field)
            const footprint = where && fs.existsSync(path.join(ROOTS.footprints, where)) ? readFootprint(fs.readFileSync(path.join(ROOTS.footprints, where), 'utf8')) : null
            const bundle    = kicadBundle(kicadId(library, name), symbol, footprint, field)
            const plugs     = [...bundle.parts[0].text.matchAll(/<breadboardView><p layer="breadboard" svgId="(connector\d+pin)"/g)].map(match => match[1])
            const text      = bundle.svgs.find(item => item.name.startsWith('svg.breadboard.'))?.text ?? ''
            counts[text.includes('fill="#2d5a3d"') ? 'adapter' : 'footprint']++

            if (plugs.length !== pinsOf(symbol).length) {
                failures.push(`${library}:${name}: ${plugs.length} de ${pinsOf(symbol).length} pinos na protoboard`)
                continue
            }

            const svg     = new SvgFile(text)
            svg.update()
            const centers = plugs.map(id => svg.getBox(id)).map(box => box ? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2] : [NaN, NaN])
            const off     = centers.filter(([x, y]) => [x - centers[0][0], y - centers[0][1]].some(delta => !(Math.abs(delta / GRID - Math.round(delta / GRID)) < 0.05)))

            if (off.length)
                failures.push(`${library}:${name}: ${off.length} pinos fora da grade`)
        }

        writeReport('kicad-breadboard-report.txt', `footprint passante: ${counts.footprint}\nplaca adaptadora: ${counts.adapter}\nsó esquemático (alimentação ou sem pinos): ${counts.schematic}\n${failures.join('\n')}\n`)
        expect(failures.slice(0, 20)).toEqual([])
        expect(counts.footprint + counts.adapter).toBeGreaterThan(20000)
    })
})
