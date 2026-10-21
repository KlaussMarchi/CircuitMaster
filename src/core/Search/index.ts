import type { Part } from '../Part'
import { featuredRank, normalize } from '../Featured'

export type Searchable = { moduleId: string, title: string, family: string, haystack: string }
export type Words      = { title: string[], family: string[], rest: string[], titleText: string, familyText: string, restText: string }

const WEIGHTS  = [10, 4, 1]     // TÍTULO, FAMÍLIA, RESTO (DESCRIÇÃO, TAGS, PROPRIEDADES)
const FEATURED = 1000           // PEÇA SUGERIDA CUJAS PALAVRAS CASAM COM A BUSCA VEM ANTES DE TUDO
const IN_BIN   = [15, 10]       // PEÇAS DOS BINS CORE E SIMULADOR ANTES DAS DEMAIS

// TERMOS EM PORTUGUÊS QUE O ACERVO ESCREVE EM INGLÊS
const SYNONYMS: Record<string, string[]> = {
    fonte: ['source', 'supply', 'power'], alimentacao: ['power', 'supply'], tensao: ['voltage'], corrente: ['current'], resistencia: ['resistor'], resistor: ['resistance'],
    capacitor: ['capacitance'], condensador: ['capacitor'], capacitancia: ['capacitor'], eletrolitico: ['electrolytic'], ceramico: ['ceramic'], tantalo: ['tantalum'], polarizado: ['polarized'], indutor: ['inductor'], bobina: ['inductor', 'coil'], bateria: ['battery'], pilha: ['battery'],
    terra: ['ground', 'gnd'], massa: ['ground'], diodo: ['diode'], retificador: ['rectifier'], chave: ['switch'], interruptor: ['switch'], botao: ['button', 'pushbutton'],
    potenciometro: ['potentiometer'], amplificador: ['amplifier', 'opamp', 'op amp'], operacional: ['opamp', 'op amp', 'operational'], gerador: ['generator', 'source'],
    senoide: ['sine', 'sinusoidal'], seno: ['sine'], pulso: ['pulse'], quadrada: ['square'], luz: ['light', 'led'], lampada: ['lamp', 'light'], rele: ['relay'],
    falante: ['speaker'], temperatura: ['temperature'], umidade: ['humidity'], distancia: ['distance'], ultrassom: ['ultrasonic'], transformador: ['transformer'],
    cristal: ['crystal'], regulador: ['regulator'], fusivel: ['fuse'], conector: ['connector', 'header'], placa: ['board'], microcontrolador: ['microcontroller'],
    tela: ['display', 'lcd'], visor: ['display'], teclado: ['keypad'], medidor: ['meter'], multimetro: ['multimeter'], osciloscopio: ['oscilloscope'], temporizador: ['timer'],
    porta: ['gate'], logica: ['logic'], campainha: ['buzzer', 'piezo'], antena: ['antenna'], sonoro: ['buzzer', 'speaker']
}

const split = (text: string) => text.split(/[^a-z0-9µ+]+/).filter(Boolean)

// TEXTO ONDE A BUSCA PROCURA: TÍTULO, DESCRIÇÃO SEM HTML, URL, AUTOR, moduleId, TAGS E PROPRIEDADES
export const haystackOf = (part: Part) => [part.title, part.description.replace(/<[^>]*>/g, ' '), part.url, part.author, part.moduleId, ...part.tags, ...Object.entries(part.properties).flat()].join('\n').toLowerCase()

export const prepare = (entry: Searchable): Words => {
    const [titleText, familyText, restText] = [entry.title, entry.family, entry.haystack].map(normalize)
    return { title: split(titleText), family: split(familyText), rest: split(restText), titleText, familyText, restText }
}

// NOTA DE UM TERMO NUM CAMPO: PALAVRA IGUAL (3), PALAVRA QUE COMEÇA POR ELE (2) OU TRECHO DO TEXTO, PARA TERMOS DE 3 LETRAS OU MAIS (1)
const fieldScore = (list: string[], text: string, term: string) => list.includes(term) ? 3 : list.some(word => word.startsWith(term)) ? 2 : term.length >= 3 && text.includes(term) ? 1 : 0

// MELHOR NOTA DO TERMO (OU DE UM SINÔNIMO) PONDERADA POR CAMPO; ZERO SE NÃO APARECE
const termScore = (found: Words, term: string) => Math.max(...[term, ...SYNONYMS[term] ?? []].map(alternative => WEIGHTS[0] * fieldScore(found.title, found.titleText, alternative) + WEIGHTS[1] * fieldScore(found.family, found.familyText, alternative) + WEIGHTS[2] * fieldScore(found.rest, found.restText, alternative)))

// BUSCA SEM ACENTO E COM SINÔNIMOS: TODO TERMO TEM DE APARECER (NA SUGERIDA, BASTA CASAR COM AS PALAVRAS DELA); AS SUGERIDAS QUE CASAM VÊM PRIMEIRO, DEPOIS A NOTA (TÍTULO > FAMÍLIA > RESTO) E QUEM ESTÁ NOS BINS CORE E SIMULADOR (SPEC 01 §7)
export const rankParts = <T extends Searchable>(list: T[], words: Map<string, Words>, text: string, bins: Set<string>[]) => {
    const terms  = split(normalize(text))
    const scored = list.flatMap(entry => {
        const found  = words.get(entry.moduleId)
        const scores = found ? terms.map(term => termScore(found, term)) : []
        const rank   = featuredRank(entry.moduleId, terms)
        const bonus  = (rank >= 0 ? FEATURED - rank : 0) + IN_BIN.reduce((sum, value, i) => sum + (bins[i]?.has(entry.moduleId) ? value : 0), 0)
        return terms.length && (rank >= 0 || (scores.length && scores.every(score => score > 0))) ? [[entry, scores.reduce((sum, score) => sum + score, 0) + bonus] as const] : []
    })
    return scored.sort((a, b) => b[1] - a[1] || a[0].title.localeCompare(b[0].title)).map(([entry]) => entry)
}
