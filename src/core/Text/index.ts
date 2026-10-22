export type Language = 'pt' | 'en'

export const LANGUAGES: [Language, string, string][] = [['pt', 'Português (Brasil)', 'pt-BR'], ['en', 'English', 'en']]

let words: Record<string, string> = {}
let tag   = 'pt-BR'

// TEXTO NA LÍNGUA ESCOLHIDA: A CHAVE É O PRÓPRIO TEXTO EM PORTUGUÊS E {0}, {1}… RECEBEM OS VALORES; SEM TRADUÇÃO, FICA O PORTUGUÊS
export const t = (text: string, ...values: (string | number)[]) => (words[text] ?? text).replace(/\{(\d)\}/g, (_, i: string) => String(values[Number(i)] ?? ''))

export const setWords = (language: Language, next: Record<string, string>) => {
    words = next
    tag   = LANGUAGES.find(([id]) => id === language)?.[2] ?? 'pt-BR'
}

// ETIQUETA BCP 47 DA LÍNGUA (DATAS E O lang DOS DOCUMENTOS EXPORTADOS)
export const getTag = () => tag
