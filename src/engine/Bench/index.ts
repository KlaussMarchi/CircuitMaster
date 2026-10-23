import { emptyDoc, type Doc, type Probe, type ProbeKind } from '../../core/Document'
import { VIEWS } from '../../core/Layer'
import type { Library } from '../../core/Library'
import type { Point } from '../../core/Geometry'
import { FREQUENCY_KEY, SIGNAL_KEY, SWITCH_KEY, type Event } from '../../core/Spice'
import { alignToGrid, connectByPath, createInstance, rotateInstances } from '../Edit'

type View     = typeof VIEWS[number]
type Placed   = [moduleId: string, at: Point, degrees: number, properties: Record<string, string>]
export type Bench = { id: string, title: string, summary: string, parts: Placed[], wires: [string, string][], probes: [ProbeKind, string, Point][], switching?: Record<string, Event[]> }

const GRID   = 9     // PX: GRADE DE 0,1 in DO ESQUEMÁTICO E DA PROTOBOARD
const SPREAD: Record<View, number> = { breadboardView: 3, schematicView: 1, pcbView: 2 }    // AS PEÇAS NÃO SE SOBREPÕEM NAS VISTAS DE PEÇAS MAIORES

const DC     = '5_DCPowerSupplyModuleID'
const SINE   = '1_SinePowerSupplyModuleID'
const LED    = 'LED-genedb611bf8177f41ac9c325217070f0c62ColorLEDModuleID'
const CERAMIC = '100milCeramicCapacitorModuleID'
const RES    = 'ResistorModuleID'
const ELECTRO = 'SmallElectrolyticCapacitorModuleID'
const IND    = '56bed03878064b8286b71d5240035138InductorModuleID'
const GND    = 'GroundModuleID'
const NPN    = 'NPN-to92-ebc'
const OPAMP  = 'AnalogDevices_OP27GPZ'
const BUTTON = '20A9BBEE34_ST-2leadbutton-horizon'
const PRESSED: Record<string, string> = { [BUTTON]: `${BUTTON}_pressed` }    // VARIANTE ACIONADA DE CADA CHAVE DOS CIRCUITOS DE TESTE

// CIRCUITOS PRONTOS PARA TESTAR A SIMULAÇÃO: PEÇA, CENTRO NO ESQUEMÁTICO, ROTAÇÃO E VALORES (O SINAL VEM DA PRÓPRIA FONTE); LIGAÇÕES POR PORTA (ÍNDICE DE CRIAÇÃO/CONECTOR) E PONTAS (SPEC 04 §8.9)
export const BENCHES: Bench[] = [
    {
        id: 'led',
        title: 'LED com resistor',
        summary: 'Fonte de 5 V, 220 Ω e LED vermelho: o resistor limita a corrente a (5 − 2,2) / 220 ≈ 13 mA e o LED acende.',
        parts: [[DC, [0, 0], 0, { voltage: '5V' }], [RES, [90, -72], 0, { resistance: '220Ω' }], [LED, [180, 0], 0, {}], [GND, [90, 72], 0, {}]],
        wires: [['1/connector1', '2/connector0'], ['2/connector1', '3/connector1'], ['3/connector0', '4/connector0'], ['1/connector0', '4/connector0']],
        probes: [['current', '2/connector0', [-14, -30]], ['voltage', '3/connector1', [10, -26]]]
    },
    {
        id: 'rc',
        title: 'Carga do capacitor (RC)',
        summary: 'Fonte de 5 V ligada em t = 0 num RC de 1 kΩ e 100 µF: τ = 100 ms.',
        parts: [[DC, [0, 0], 0, { voltage: '5V', [SIGNAL_KEY]: 'step' }], [RES, [90, -72], 0, { resistance: '1kΩ' }], [ELECTRO, [180, 0], 0, { capacitance: '100µF' }], [GND, [90, 72], 0, {}]],
        wires: [['1/connector1', '2/connector0'], ['2/connector1', '3/connector1'], ['3/connector0', '4/connector0'], ['1/connector0', '4/connector0']],
        probes: [['voltage', '3/connector1', [10, -26]], ['current', '2/connector0', [-14, -30]]]
    },
    {
        id: 'square',
        title: 'Carga e descarga (onda quadrada)',
        summary: 'A fonte em onda quadrada de 0 a 5 V e 1 Hz no mesmo RC: carga e descarga a cada meio período.',
        parts: [[DC, [0, 0], 0, { voltage: '5V', [SIGNAL_KEY]: 'square', [FREQUENCY_KEY]: '1Hz' }], [RES, [90, -72], 0, { resistance: '1kΩ' }], [ELECTRO, [180, 0], 0, { capacitance: '100µF' }], [GND, [90, 72], 0, {}]],
        wires: [['1/connector1', '2/connector0'], ['2/connector1', '3/connector1'], ['3/connector0', '4/connector0'], ['1/connector0', '4/connector0']],
        probes: [['voltage', '3/connector1', [10, -26]], ['voltage', '1/connector1', [-60, -26]]]
    },
    {
        id: 'lowpass',
        title: 'Filtro passa-baixa (RC)',
        summary: 'Senoide de 5 V na frequência de corte fc = 1/(2πRC) ≈ 159 Hz, com 1 kΩ e 1 µF: a saída fica com 71% da entrada e atrasada 45°.',
        parts: [[DC, [0, 0], 0, { voltage: '5V', [SIGNAL_KEY]: 'sine' }], [RES, [90, -72], 0, { resistance: '1kΩ' }], [CERAMIC, [180, 0], 90, { capacitance: '1µF' }], [GND, [90, 72], 0, {}]],
        wires: [['1/connector1', '2/connector0'], ['2/connector1', '3/connector1'], ['3/connector0', '4/connector0'], ['1/connector0', '4/connector0']],
        probes: [['voltage', '1/connector1', [-60, -26]], ['voltage', '3/connector1', [10, -26]]]
    },
    {
        id: 'rlc',
        title: 'RLC série com sobressinal',
        summary: '22 Ω, 10 mH e 10 µF: resposta subamortecida (ζ ≈ 0,35) com sobressinal de cerca de 30%.',
        parts: [[DC, [0, 0], 0, { voltage: '5V', [SIGNAL_KEY]: 'step' }], [RES, [72, -72], 0, { resistance: '22Ω' }], [IND, [162, -72], 90, { inductance: '10mH' }], [ELECTRO, [252, 0], 0, { capacitance: '10µF' }], [GND, [126, 72], 0, {}]],
        wires: [['1/connector1', '2/connector0'], ['2/connector1', '3/connector1'], ['3/connector0', '4/connector1'], ['4/connector0', '5/connector0'], ['1/connector0', '5/connector0']],
        probes: [['voltage', '4/connector1', [10, -26]]]
    },
    {
        id: 'opamp',
        title: 'Amplificador inversor (amp-op)',
        summary: 'OP27 com ganho −10 kΩ/1 kΩ = −10 em ±9 V: entrada de 0,5 V e 1 kHz, saída de 5 V em oposição de fase.',
        parts: [[OPAMP, [216, 0], 0, {}], [SINE, [63, 18], 0, { amplitude: '0.5V', frequency: '1kHz' }], [RES, [126, -18], 0, { resistance: '1kΩ' }], [RES, [198, -81], 0, { resistance: '10kΩ' }], [DC, [324, -63], 0, { voltage: '9V' }], [DC, [324, 72], 180, { voltage: '9V' }], [GND, [63, 63], 0, {}], [GND, [153, 54], 0, {}], [GND, [324, -18], 0, {}], [GND, [324, 117], 0, {}]],
        wires: [['2/connector0', '3/connector0'], ['3/connector1', '1/connector2'], ['4/connector0', '1/connector2'], ['4/connector1', '1/connector6'], ['1/connector3', '8/connector0'], ['2/connector1', '7/connector0'], ['5/connector1', '1/connector7'], ['5/connector0', '9/connector0'], ['6/connector0', '1/connector4'], ['6/connector1', '10/connector0']],
        probes: [['voltage', '2/connector0', [-70, -40]], ['voltage', '1/connector6', [12, -10]]]
    },
    {
        id: 'bjt',
        title: 'Amplificador com transistor (emissor comum)',
        summary: 'NPN polarizado por divisor 47 kΩ/10 kΩ em 9 V, ganho ≈ −Rc/Re = −4,7 para um sinal de 0,2 V e 1 kHz.',
        parts: [[NPN, [234, 36], 0, {}], [RES, [171, -36], 90, { resistance: '47kΩ' }], [RES, [171, 108], 90, { resistance: '10kΩ' }], [RES, [243, -36], 90, { resistance: '4.7kΩ' }], [RES, [243, 108], 90, { resistance: '1kΩ' }], [ELECTRO, [117, 36], 90, { capacitance: '10µF' }], [SINE, [54, 72], 0, { amplitude: '0.2V', frequency: '1kHz' }], [DC, [342, 36], 0, { voltage: '9V' }], [GND, [54, 126], 0, {}], [GND, [207, 171], 0, {}], [GND, [342, 90], 0, {}]],
        wires: [['4/connector1', '1/connector2'], ['5/connector0', '1/connector0'], ['2/connector1', '1/connector1'], ['3/connector0', '1/connector1'], ['6/connector1', '1/connector1'], ['7/connector0', '6/connector0'], ['7/connector1', '9/connector0'], ['5/connector1', '10/connector0'], ['3/connector1', '10/connector0'], ['8/connector1', '4/connector0'], ['2/connector0', '4/connector0'], ['8/connector0', '11/connector0']],
        probes: [['voltage', '7/connector0', [-70, -40]], ['voltage', '1/connector2', [14, -30]]]
    },
    {
        id: 'switch',
        title: 'Chave temporizada (RC)',
        summary: 'O botão fecha em t = 100 ms e abre em t = 500 ms: o capacitor carrega por 1 kΩ e depois descarrega em 2,2 kΩ.',
        parts: [[DC, [0, 0], 0, { voltage: '5V' }], [BUTTON, [72, -72], 0, {}], [RES, [162, -72], 0, { resistance: '1kΩ' }], [ELECTRO, [252, 0], 0, { capacitance: '100µF' }], [RES, [324, 0], 90, { resistance: '2.2kΩ' }], [GND, [162, 72], 0, {}]],
        wires: [['1/connector1', '2/connector0'], ['2/connector1', '3/connector0'], ['3/connector1', '4/connector1'], ['4/connector1', '5/connector0'], ['4/connector0', '6/connector0'], ['5/connector1', '6/connector0'], ['1/connector0', '6/connector0']],
        probes: [['voltage', '4/connector1', [10, -26]], ['current', '3/connector0', [-14, -30]]],
        switching: { 2: [[0.1, true], [0.5, false]] }
    }
]

export const BENCH_PARTS = [...new Set(BENCHES.flatMap(bench => bench.parts.flatMap(([moduleId]) => [moduleId, ...PRESSED[moduleId] ? [PRESSED[moduleId]] : []])))]

// SKETCH DO CIRCUITO DE TESTE: PEÇAS NAS TRÊS VISTAS, GIRADAS E COM OS VALORES NO ESQUEMÁTICO, NA GRADE, LIGADAS PELO CAMINHO ORTOGONAL NO ESQUEMÁTICO E NA PROTOBOARD, COM AS PONTAS DE PROVA
export const buildBench = (library: Library, bench: Bench): Doc => {
    const indexes = bench.parts.map((_, i) => String(i + 1))
    const placed  = bench.parts.reduce((doc, [moduleId, [x, y]]) => createInstance(doc, library, moduleId, Object.fromEntries(VIEWS.map(view => [view, [x * SPREAD[view], y * SPREAD[view]]])) as Record<View, Point>), emptyDoc())
    const turned  = bench.parts.reduce((doc, [, , degrees], i) => degrees ? rotateInstances(doc, library, 'schematicView', [indexes[i]], degrees) : doc, placed)
    const valued  = { ...turned, instances: Object.fromEntries(Object.entries(turned.instances).map(([index, instance]) => [index, { ...instance, properties: { ...instance.properties, ...bench.parts[Number(index) - 1]?.[3] } }])) }
    const aligned = alignToGrid(valued, library, 'schematicView', indexes, GRID)
    const sheet   = bench.wires.reduce((doc, [a, b]) => connectByPath(doc, library, 'schematicView', a, b, GRID, true).doc, aligned)
    const wired   = bench.wires.reduce((doc, [a, b]) => connectByPath(doc, library, 'breadboardView', a, b, GRID, true).doc, sheet)
    const probes  = bench.probes.map(([kind, key, offset], i): Probe => ({ id: `P${i + 1}`, kind, view: 'schematicView', key, t: 0.5, offset, flip: false }))
    const plans   = Object.fromEntries(Object.entries(bench.switching ?? {}).map(([index, events]) => [index, { released: bench.parts[Number(index) - 1][0], pressed: PRESSED[bench.parts[Number(index) - 1][0]], events }]))
    return { ...wired, probes, projectProperties: bench.switching ? { [SWITCH_KEY]: JSON.stringify(plans) } : {} }
}
