import type { Box, Point } from '../../core/Geometry'
import type { Probe } from '../../core/Document'

export const PROBE_COLORS = ['var(--accent)', 'var(--amber)', '#5b9bf0', '#e5566f', '#a78bfa', '#22b8cf', '#f472b6', '#84cc16']    // AS DUAS PRIMEIRAS SEGUEM O TEMA; AS OUTRAS SÃO CORES FIXAS DE DADOS (DESIGN.md §3)

const FONT    = 4.2     // PX DE CENA: UM POUCO MENOR QUE OS RÓTULOS DAS PEÇAS
const LINE    = 5.4
const PAD     = 1.4
const ADVANCE = 0.62    // LARGURA DO CARACTERE MONOESPAÇADO EM UNIDADES DA FONTE
const DOT     = 1.5
const ARROW   = 2.4
const GAP     = 7       // PX DE CENA ENTRE O PONTO MEDIDO E A CAIXA
const SAMPLE  = '0.000 mA'

export const probeColor = (index: number) => PROBE_COLORS[index % PROBE_COLORS.length]

export const getProbeSize = (id: string, lines: string[]): Point => [2 * PAD + (id.length + 1 + Math.max(0, ...lines.map(line => line.length))) * FONT * ADVANCE, Math.max(1, lines.length) * LINE + PAD]

// LADO DA CAIXA EM RELAÇÃO AO PONTO MEDIDO: O PRIMEIRO (ACIMA À DIREITA, ABAIXO À DIREITA, ACIMA À ESQUERDA, ABAIXO À ESQUERDA) QUE NÃO COBRE PEÇA, RÓTULO OU OUTRA PONTA
export const getProbeOffset = (anchor: Point, id: string, rows: number, taken: Box[]): Point => {
    const [w, h]  = getProbeSize(id, Array.from({ length: rows }, () => SAMPLE))
    const options = [[GAP, -GAP - h], [GAP, GAP], [-GAP - w, -GAP - h], [-GAP - w, GAP]] as Point[]
    const free    = options.find(([dx, dy]) => !taken.some(box => anchor[0] + dx < box[2] && box[0] < anchor[0] + dx + w && anchor[1] + dy < box[3] && box[1] < anchor[1] + dy + h))
    return free ?? options[0]
}

// PONTA DE PROVA NA VISTA: MARCA NO PONTO MEDIDO (SETA NO SENTIDO POSITIVO DA CORRENTE), LINHA DE CHAMADA E CAIXA COM O NOME E AS LEITURAS (ESTILO MULTISIM)
export const ProbeShape = ({ probe, anchor, along, color, lines, selected }: { probe: Probe, anchor: Point, along: Point | null, color: string, lines: string[], selected: boolean }) => {
    const [x, y]  = [anchor[0] + probe.offset[0], anchor[1] + probe.offset[1]]
    const [w, h]  = getProbeSize(probe.id, lines)
    const near: Point = [Math.min(Math.max(anchor[0], x), x + w), Math.min(Math.max(anchor[1], y), y + h)]
    const tip     = along && [anchor[0] + along[0] * ARROW, anchor[1] + along[1] * ARROW]
    const side    = along && [along[1] * ARROW * 0.62, -along[0] * ARROW * 0.62]
    const back    = along && side && [[anchor[0] - along[0] * ARROW + side[0], anchor[1] - along[1] * ARROW + side[1]], [anchor[0] - along[0] * ARROW - side[0], anchor[1] - along[1] * ARROW - side[1]]]
    const text    = x + PAD + (probe.id.length + 1) * FONT * ADVANCE

    return (
        <g data-probe={probe.id} data-overlay style={{ cursor: 'move' }}>
            <line x1={anchor[0]} y1={anchor[1]} x2={near[0]} y2={near[1]} stroke={color} strokeWidth={0.4} strokeDasharray="1.2 0.8" pointerEvents="none" />
            {tip && back ? <polygon points={[tip, ...back].map(point => point.join(',')).join(' ')} fill={color} stroke="var(--well)" strokeWidth={0.3} /> : <circle cx={anchor[0]} cy={anchor[1]} r={DOT} fill={color} stroke="var(--well)" strokeWidth={0.4} />}
            <rect x={x - 0.8} y={y - 0.8} width={w + 1.6} height={h + 1.6} rx={1.8} fill="none" stroke={color} strokeOpacity={selected ? 0.5 : 0} strokeWidth={0.6} />
            <rect x={x} y={y} width={w} height={h} rx={1.2} fill="var(--surface)" stroke={color} strokeWidth={0.4} />
            <text x={x + PAD} y={y + PAD / 2 + FONT} fontSize={FONT} fontWeight={600} fill={color} fontFamily="var(--font)">{probe.id}</text>
            {lines.map((line, i) => <text key={i} x={text} y={y + PAD / 2 + FONT + i * LINE} fontSize={FONT} fill="var(--text)" fontFamily="var(--mono)" style={{ whiteSpace: 'pre' }}>{line}</text>)}
        </g>
    )
}
