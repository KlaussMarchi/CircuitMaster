import type { MenuEntry } from '../ContextMenu'

export type Level = 1 | 2 | 3

export const LEVELS: [Level, string, string][] = [
    [1, 'Iniciante', 'o essencial para montar, ligar, simular e exportar'],
    [2, 'Maker', 'mais ajustes de placa, camadas, vias e saídas para fabricar'],
    [3, 'Profissional', 'tudo: sementes de terra, trilhas fixas, netlists e IPC']
]

// ITENS DE MENU QUE SÓ APARECEM A PARTIR DO MODO; O RESTO APARECE EM TODOS E A PALETA ACHA TUDO EM QUALQUER MODO
const ADVANCED: Record<string, Level> = {
    'Colar no lugar': 2, 'Apagar sem fios': 2, 'Elevar e rebaixar': 2, 'Travar peça': 2, 'Sticky': 2, '100%': 2, 'Fios ortogonais (90°)': 2, 'Camadas da PCB': 2,
    'Gravável (PDF)…': 2, 'Gravável (SVG)…': 2, 'Netlist SPICE…': 2, 'Regras do autorouter e DRC…': 2, 'Mover trilha para a outra face': 2, 'Selecionar todas as vias': 2,
    'Selecionar todos os preenchimentos': 2, 'Converter via em dobra': 2, 'Converter dobra em via': 2,
    'Tamanho real': 3, 'Pick-and-place…': 3, 'Netlist IPC-D-356A…': 3, 'Netlist XML…': 3, 'Definir semente de preenchimento de terra': 3, 'Limpar sementes de preenchimento de terra': 3,
    'Limpar sementes de terra': 3, 'Selecionar trilhas autoroteáveis': 3, 'Não rotear automaticamente': 3, 'Ocultar serigrafia da peça': 3, 'Mostrar serigrafia da peça': 3
}

export const levelOf = (label: string): Level => ADVANCED[label] ?? 1

// ITENS DO MODO, SEM SEPARADOR NO COMEÇO, NO FIM OU REPETIDO
export const shownIn = (items: MenuEntry[], level: Level) => items.filter(entry => !entry || levelOf(entry.label) <= level).filter((entry, i, list) => entry !== null || (i > 0 && i < list.length - 1 && list[i - 1] !== null))
