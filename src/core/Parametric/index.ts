// PORTADO DE fritzing-app/src/items/{dip,mysterypart,screwterminal}.cpp, src/utils/textutils.cpp (incrementTemplateString) E resources/templates (GPL-3.0-or-later; Copyright (c) Fritzing GmbH)
import { MIL_PER_INCH } from '../Units'

// arg() DO QString: TROCA TODAS AS MARCAS %N DE MENOR NÚMERO
const arg = (text: string, value: string | number) => {
    const marks = [...text.matchAll(/%(\d+)/g)].map(match => Number(match[1]))
    return marks.length ? text.replaceAll(new RegExp(`%${Math.min(...marks)}(?!\\d)`, 'g'), String(value)) : text
}

const num = (value: number) => String(Number(value.toPrecision(6)))    // QString::number(double)

// incrementTemplateString: CADA [v] DA CÓPIA i VIRA v + passo·(i + início); %1 VIRA O NÚMERO QUE copy DÁ (OU FICA, SEM copy)
const repeat = (template: string, count: number, step: number, start = 0, copy: ((i: number) => number) | null = i => i) => Array.from({ length: count }, (_, i) => {
    const filled = template.replace(/\[([.\d]+)\]/g, (_, value: string) => num(Number(value) + (i + start) * step))
    return copy ? arg(filled, copy(i)) : filled
}).join('')

const UNIT       = 100    // MIL, NewUnit DO SchematicRectConstants (0,1 in)
const PIN_WIDTH  = 1000 * 0.246944 / 25.4
const PIN_COLOR  = '#787878'
const SIP_BREAD  = `<?xml version="1.0" encoding="utf-8"?>
<svg version="1.2" baseProfile="tiny" id="svg2" xmlns="http://www.w3.org/2000/svg"
	 width="%1in" height="0.3in" viewBox="0 0 [20.0] 30.0">

<g id="breadboard">
  <rect id="middle" x="0" y="0" fill="#303030" width="[20.0]" height="27.0" />
  <rect id="top" x="0" y="0" fill="#3D3D3D" width="[20.0]" height="2.46"/>
  <rect id="bottom" x="0" y="24.54" fill="#000000" width="[20.0]" height="2.46"/>

  <polygon id="right" fill="#141414" points="[20.0],0 [19.25],2.46 [19.25],24.54 [20.0],27.0"/>
  <polygon id="left" fill="#1F1F1F" points="0,0 0.75,2.46 0.75,24.54 0,27.0"/>

  <polygon id="left-upper-rect" fill="#1C1C1C" points="5,8.5 0.75,8.46 0.56,10.58 0.56,13.5 5,13.5"/>
  <polygon id="left-lower-rect" fill="#383838" points="0.75,18.55 5,18.55 5,13.5 0.56,13.5 0.56,16.42"/>

  <path id="slot" fill="#262626" d="M0.56,10.58v5.83c1.47-0.17,2.62-1.4,2.62-2.92C3.18,11.97,2.04,10.75,0.56,10.58z"/>
  <path id="cover" fill="#303030" d="M0.75,2.46V8.45c2.38,0.45,4.19,2.53,4.19,5.04c0,2.51-1.8,4.6-4.19,5.05V18.55h5.0V2.46H0.75z"/>
  <circle fill="#212121" cx="6.5" cy="20.47" r="2.06"/>

  <text id="label" x="6.5" y="15.0" fill="#e6e6e6" stroke="none" font-family="OCRA" text-anchor="start" font-size="8" >IC</text>

  <rect id="connector0pin" x="3.5" y="25.66" fill="#8C8C8C" width="3" height="4.34"/>
  <rect id="connector0terminal" x="3.5" y="27.0" fill="#8C8C8C" width="3" height="3"/>
  <polygon fill="#8C8C8C" points="3.5,25.66 3.5,27.66 6.5,27.66 8.5,26.74 8.5,25.66 	"/>

  <rect id="connector%2pin" x="[13.5]" y="25.66" fill="#8C8C8C" width="3" height="4.34"/>
  <rect id="connector%2terminal" x="[13.5]" y="27.0" fill="#8C8C8C" width="3" height="3"/>
  <polygon fill="#8C8C8C" points="[11.5],25.66 [11.5],26.74 [13.5],27.66 [16.5],27.66 [16.5],25.66"/>

%3

</g>
</svg>`
const SCREW_BREAD = ` <g id="plus%1" transform="translate([0],0)">
  <g>
   <path fill="#3A5C8E" d="M49.0302,81.9883c19.0567,0,34.5743,-15.7579,34.5743,-35.1715L14.4423,46.8168C14.4286,66.2442,29.9326,81.9883,49.0302,81.9883z" />
   <path fill="#123C66" d="M49.0302,11.6592c-19.0839,0,-34.5879,15.7718,-34.5879,35.1576l69.1622,0C83.6044,27.4033,68.1141,11.6592,49.0302,11.6592z" />
  </g>
  <g>
   <g>
    <path fill="#8B8B8B" d="M49.0302,75.3417c-15.4904,0,-28.0678,-12.7947,-28.0678,-28.5526c0,-15.7302,12.5774,-28.5387,28.0678,-28.5387c15.4768,0,28.0542,12.7947,28.0542,28.5387C77.0707,62.547,64.4933,75.3417,49.0302,75.3417L49.0302,75.3417z" />
    <path d="M49.0302,18.8043c15.2045,0,27.5097,12.5454,27.5097,27.9848c0,15.4533,-12.3052,27.9987,-27.5097,27.9987S21.4932,62.2424,21.4932,46.7891C21.4796,31.3497,33.812,18.8043,49.0302,18.8043M49.0302,17.7796c-15.749,0,-28.585,13.0301,-28.585,29.0511c0,16.021,12.8088,29.0788,28.585,29.0788c15.7218,0,28.5578,-13.0162,28.5578,-29.0788C77.5744,30.8096,64.7655,17.7796,49.0302,17.7796L49.0302,17.7796z" />
   </g>
   <g>
    <path fill="#707070" d="M22.3236,40.2395C21.8199,42.3581,21.4796,44.5736,21.4796,46.8307c0,2.28476,0.340298,4.45874,0.843939,6.63273l53.386,0c0.503641,-2.1186,0.843939,-4.32027,0.843939,-6.63273c0,-2.25707,-0.313074,-4.43105,-0.843939,-6.59119L22.3236,40.2395z" />
   </g>
   <g>
    <rect width="12.9586" x="42.5373" y="23.083" fill="#545252" height="47.4676" stroke-width="0" />
    <rect width="40.8222" x="28.6123" y="40.2395" fill="#545252" height="13.1685" stroke-width="0" />
   </g>
   <g opacity="0.5" >
    <path d="M49.0302,21.1167c13.8978,0,25.2365,11.5346,25.2365,25.6724c0,14.1655,-11.3387,25.6862,-25.2365,25.6862c-13.925,0,-25.2637,-11.5346,-25.2637,-25.6862C23.7528,32.6513,35.0915,21.1167,49.0302,21.1167M49.0302,18.8043c-15.2045,0,-27.5369,12.5454,-27.5369,27.9848c0,15.4533,12.3324,27.9987,27.5369,27.9987s27.5097,-12.5454,27.5097,-27.9987C76.5671,31.3497,64.2347,18.8043,49.0302,18.8043L49.0302,18.8043z" />
   </g>
  </g>
 </g>
 <g id="maul%1" transform="translate([0],0)">
  <rect width="69.1758" x="14.4286" y="93.966" fill="#103656" height="28.151" stroke-width="0" />
  <rect width="69.1758" x="14.4286" y="122.131" fill="#254E89" height="29.2034" stroke-width="0" />
  <rect width="33.8665" x="32.0833" y="122.491" fill="#254E89" height="35.0745" stroke-width="0" />
  <rect width="63.5405" x="17.2599" y="96.4307" fill="#8D8C8C" height="52.868" stroke-width="0" />
  <path fill="#A0A0A0" d="M49.0302,146.197c15.0684,0,27.3327,-9.08365,27.3327,-20.3551l-54.7199,0C21.6702,137.113,33.9209,146.197,49.0302,146.197z" />
  <path fill="#565656" d="M49.0302,105.584c-15.0956,0,-27.3872,9.08365,-27.3872,20.3136l54.7199,0C76.3493,114.667,64.1258,105.584,49.0302,105.584z" />
  <ellipse fill="#383838" cx="49.0165" cy="125.897" rx="21.2074" ry="15.7579" stroke-width="0" />
  <g>
   <polygon fill="#919291" points="30.8446,116.467,21.8335,103.631,17.2599,103.271,18.1175,96.0569,80.8004,96.9431,79.9292,104.157,76.989,103.271,67.0115,116.467" />
   <g>
    <path fill="#57585A" d="M79.0581,97.8293l0,4.55567L77.0027,102.385L76.1179,102.385L75.6142,103.105L66.5895,115.581L31.7158,115.581L22.5413,103.091L22.0105,102.385L21.1529,102.385L19.0159,102.385L19.0159,97.8293L79.0581,97.8293M80.8004,96.0569L17.2599,96.0569l0,8.10051l3.8794,0l9.7053,13.1962l36.5889,0l9.54196,-13.1962l3.79773,0L80.8004,96.0569L80.8004,96.0569z" />
   </g>
  </g>
  <rect width="28.5034" x="34.7785" y="149.105" fill="#8C8C8C" height="20.8398" stroke-width="0" />
 </g>
 <rect width="31.5235" x="[34.2884]" y="109.874" fill="none" height="60.0844" id="connector%1pin" stroke-width="0" />`

// SIP NA PROTOBOARD: O PRIMEIRO E O ÚLTIMO PINO NO MODELO, OS DO MEIO REPETIDOS A CADA 0,1 IN (Dip::makeBreadboardSipSvg)
export const breadboardSip = (pins: number) => {
    const svg   = repeat(SIP_BREAD, 1, 10 * (pins - 2), 1, null)
    const pin   = "<rect id='connector%1pin' x='[13.5]' y='25.66' fill='#8C8C8C' width='3' height='4.34'/>\n<rect id='connector%1terminal' x='[13.5]' y='27.0' fill='#8C8C8C' width='3' height='3'/>\n<polygon fill='#8C8C8C' points='[11.5],25.66 [11.5],26.74 [13.5],27.66 [16.5],27.66 [18.5],26.74 [18.5],25.66'/>\n"
    const inner = pins > 2 ? repeat(pin, pins - 2, 10, 0, i => i + 1) : ''
    return arg(arg(arg(svg, num(pins * 10 / 100)), pins - 1), inner)
}

// MYSTERY PART EM FILEIRA NA PROTOBOARD (MysteryPart::makeBreadboardSipSvg)
export const breadboardMysterySip = (pins: number) => {
    const header = "<?xml version='1.0' encoding='utf-8'?>\n<svg version='1.2' baseProfile='tiny' id='svg2' xmlns='http://www.w3.org/2000/svg' \nwidth='%1in' height='0.27586in' viewBox='0 0 [6.0022] 27.586'>\n<g id='breadboard'>\n<rect width='[6.0022]' x='0' y='0' height='24.17675' fill='#000000' id='upper' stroke-width='0' />\n<rect width='[6.0022]' x='0' y='22' fill='#404040' height='3.096' id='lower' stroke-width='0' />\n<text id='label' x='2.5894' y='13' fill='#e6e6e6' stroke='none' font-family='Droid Sans' text-anchor='start' font-size='7.3' >?</text>\n<circle fill='#8C8C8C' cx='[1.0022]' cy='5' r='3' stroke-width='0' />\n<text x='[1.0022]' y='6.7' font-family='Droid Sans' text-anchor='middle' font-weight='bold' stroke-width='0' font-size='5.5' >?</text>\n%2\n</g>\n</svg>\n"
    const svg    = repeat(header, 1, 10 * (pins - 1), 1, null)
    const pin    = "<rect id='connector%1terminal' stroke='none' stroke-width='0' x='[1.87]' y='25.586' fill='#8C8C8C' width='2.3' height='2.0'/>\n<rect id='connector%1pin' stroke='none' stroke-width='0' x='[1.87]' y='23.336' fill='#8C8C8C' width='2.3' height='4.25'/>\n"
    const width  = Number(svg.match(/viewBox='0 0 ([\d.]+)/)?.[1] ?? 0)
    return arg(arg(svg, num(width / 100)), repeat(pin, pins, 10))
}

// MYSTERY PART EM DUAS FILEIRAS: {v} SEGUE O ESPAÇAMENTO, [v] O NÚMERO DE PINOS (MysteryPart::makeBreadboardDipSvg)
export const breadboardMysteryDip = (pins: number, spacingMils: number) => {
    const spacing = spacingMils / 10
    const wide    = (text: string) => repeat(text, 1, spacing - 10, 1, null)
    let header    = wide("<?xml version='1.0' encoding='utf-8'?>\n<svg version='1.2' baseProfile='tiny' xmlns='http://www.w3.org/2000/svg' \nwidth='.percent.1in' height='%1in' viewBox='0 0 {16.0022} [12.0]'>\n<g id='breadboard'>\n.percent.2\n<rect width='{16.0022}' x='0' y='2.5' height='[6.5]' fill='#000000' id='upper' stroke-width='0' />\n<rect width='{16.0022}' x='0' y='[6.5]' fill='#404040' height='3.096' id='lower' stroke-width='0' />\n<text id='label' x='2.5894' y='{{6.0}}' fill='#e6e6e6' stroke='none' font-family='Droid Sans' text-anchor='start' font-size='7.3' >?</text>\n<circle fill='#8C8C8C' cx='11.0022' cy='{{7.5}}' r='3' stroke-width='0' />\n<text x='11.0022' y='{{9.2}}' font-family='Droid Sans' text-anchor='middle' font-weight='bold' stroke-width='0' font-size='5.5' >?</text>\n.percent.3\n</g>\n</svg>\n")
    header        = arg(header, num(Number(header.match(/viewBox='0 0 \{[\d.]+\} ([\d.]+)/)?.[1] ?? 0) / 100))
    const marks   = spacing === 10 ? ['8.0', '5.5', '7.2'] : [num(6 + (spacing - 10) / 2), '7.5', '9.2']
    header        = header.replace('{{6.0}}', marks[0]).replace('{{7.5}}', marks[1]).replace('{{9.2}}', marks[2]).replaceAll('.percent.', '%').replaceAll('{', '[').replaceAll('}', ']')
    const svg     = repeat(header, 1, 10 * ((pins - 4) / 2), 1, null)
    const top     = "<rect id='connector%1terminal' x='[1.87]' y='1' fill='#8C8C8C' stroke='none' stroke-width='0' width='2.3' height='0'/>\n<rect id='connector%1pin' x='[1.87]' y='0' fill='#8C8C8C' stroke='none' stroke-width='0' width='2.3' height='3.5'/>\n"
    const bottom  = wide("<rect id='connector%1terminal' x='{1.87}' y='[11.0]' fill='#8C8C8C' stroke='none' stroke-width='0' width='2.3' height='0'/>\n<rect id='connector%1pin' x='{1.87}' y='[7.75]' fill='#8C8C8C' stroke='none' stroke-width='0' width='2.3' height='4.25'/>\n").replaceAll('{', '[').replaceAll('}', ']')
    const width   = Number(svg.match(/viewBox='0 0 ([\d.]+)/)?.[1] ?? 0)
    return arg(arg(arg(svg, num(width / 100)), repeat(top, pins / 2, 10, 0, i => pins - (i + 1))), repeat(bottom, pins / 2, 10))
}

// BORNE COM PARAFUSO NA PROTOBOARD: CORPO ESTICADO E UM BLOCO POR PINO A CADA 0,1 IN (ScrewTerminal::makeBreadboardSvg)
export const breadboardScrew = (pins: number) => {
    const header = "<?xml version='1.0' encoding='UTF-8' standalone='no'?>\n<svg xmlns:svg='http://www.w3.org/2000/svg' xmlns='http://www.w3.org/2000/svg' version='1.2' baseProfile='tiny' width='%1in' height='0.17in' viewBox='0 0 [100] 170' >\n<g id='breadboard' >\n<polygon id='background' fill='#254E89' points='[96.012],39.9487 [96.012],0 0,0 0,39.9487 3.98829,39.9487 3.98829,72.4061 0,72.4061 0,157.607 [96.012],157.607 [96.012],72.4061 [100],72.4061 [100],39.9487' />\n<rect id='upperstripe' width='[92.745]' x='1.75594' y='2.38169' fill='#456DAB' height='5.76036' stroke-width='0' />\n<rect id='lowerrect' width='[96.012]' x='0' y='86.1147' fill='#123C66' height='71.4784' stroke-width='0' />\n"
    return repeat(arg(header, num(0.1 * pins)), 1, 100 * (pins - 1), 1, null) + repeat(SCREW_BREAD, pins, 100) + '</g>\n</svg>'
}

// BORNE NO ESQUEMÁTICO: UM PINO COM O CÍRCULO DO PARAFUSO A CADA 0,1 IN (ScrewTerminal::makeSchematicSvg)
export const schematicScrew = (pins: number) => {
    const inch   = UNIT / MIL_PER_INCH
    const points = 72 * inch
    const width  = 72 * PIN_WIDTH / MIL_PER_INCH
    const length = 2 * points
    const header = arg(arg(arg(arg("<?xml version='1.0' encoding='utf-8'?>\n<svg version='1.1' baseProfile='basic' id='svg2' xmlns:svg='http://www.w3.org/2000/svg'\nxmlns='http://www.w3.org/2000/svg'  x='0px' y='0px' width='%1in'\nheight='percent1in' viewBox='0 0 %2 [percent2]' xml:space='preserve'>\n<g id='schematic'>\n", num(inch + 2 * inch)), num(points + length)).replaceAll('percent', '%'), num(inch * pins)), num(points))
    const pin    = [PIN_COLOR, num(width), num(width / 2), num(length - width), num(points / 2), num((points - width) / 2), num(length + points / 2 - width), num(points / 2 - width)].reduce(arg, "<line id='connectorpercent1pin' fill='none' stroke='%1' stroke-width='%2' stroke-linecap='round' stroke-linejoin='round' x1='%3' y1='[%5]' x2='%4' y2='[%5]'/>\n<rect id='connectorpercent1terminal' x='0' y='[%6]' width='0' height='%2'/>\n<circle fill='none' stroke-width='%2' stroke='%1' cx='%7' cy='[%5]' r='%8' />\n").replaceAll('percent', '%')
    return repeat(header, 1, points * (pins - 1), 1, null) + repeat(pin, pins, points) + '</g>\n</svg>'
}

// BORNE NA PCB: FUROS NA COLUNA, MOLDURA E DIVISÃO NA SERIGRAFIA (ScrewTerminal::makePcbSvg)
export const pcbScrew = (pins: number, spacingIn: number) => {
    const dpi      = 1000
    const width    = spacingIn < 0.15 ? 0.256 : 0.48
    const vertical = spacingIn < 0.15 ? 0.196 : 0.38
    const cx       = vertical * dpi / 2 + 10
    const top      = spacingIn * dpi / 2 + 25
    const header   = [num(width), num(width * dpi), num(pins * spacingIn + 0.04), num((width - 0.02) * dpi), num(vertical * dpi), num(cx - 30), num(top - 30)].reduce(arg, "<?xml version='1.0' encoding='UTF-8'?>\n<svg baseProfile='tiny' version='1.2' height='%3in' width='%1in' viewBox='0 0 %2 [40.0]' >\n<g id='silkscreen'>\n<line id='vertical-left' stroke='black' stroke-width='10' x1='20' x2='20' y1='20' y2='[30.0]'/>\n<line id='bottom' stroke='black' stroke-width='10' x1='20' x2='%4' y1='[30.0]' y2='[30.0]'/>\n<line id='vertical-right' stroke='black' stroke-width='10' x1='%4' x2='%4' y1='[30.0]' y2='20'/>\n<line id='top' stroke='black' stroke-width='10' x1='%4' x2='20' y1='20' y2='20'/>\n<line id='mid-vertical' stroke='black' stroke-width='5' x1='%5' x2='%5' y1='[30.0]' y2='20'/>\n</g>\n<g id='copper1'>\n<g id='copper0'>\n<rect id='square' width='60' height='60' x='%6' y='%7' fill='none' stroke='rgb(255, 191, 0)' stroke-width='20' />\n")
    const holes    = Array.from({ length: pins }, (_, i) => `<circle cx='${num(cx)}' cy='${num(top + i * dpi * spacingIn)}' fill='none' id='connector${i}pin' r='30' stroke='rgb(255, 191, 0)' stroke-width='20'/>\n`).join('')
    return repeat(header, 1, pins * dpi * spacingIn, 1, null) + holes + '</g>\n</g>\n</svg>\n'
}
