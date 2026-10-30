import type * as Xmldom from '@xmldom/xmldom'

export type XmlElement = Xmldom.Element

// O XMLDOM (80 KB) FICA FORA DO JAVASCRIPT INICIAL: ENTRA POR core/Xml/xmldom, CARREGADO NO setup DO STORE, NOS WORKERS QUE LEEM XML E NO
// NODE DOS TESTES. O DOMParser NATIVO NÃO SERVE: NO CHROMIUM LÊ OS SVG DO ACERVO EM QUASE O DOBRO DO TEMPO E DEVOLVE HTML NO ERRO
let xmldom: typeof Xmldom | null = null
let parser: Xmldom.DOMParser | null = null
let serializer: Xmldom.XMLSerializer | null = null

export const useXmldom = (module: typeof Xmldom) => {
    xmldom     = module
    parser     = new module.DOMParser({ onError: () => {} })
    serializer = new module.XMLSerializer()
}

const ready = () => {
    if (!xmldom || !parser || !serializer)
        throw new Error('core/Xml: xmldom não registrado (importe core/Xml/xmldom antes de ler XML)')

    return { xmldom, parser, serializer }
}

// TEXTO SEM ELEMENTO RAIZ VIRA NULO: O XMLDOM LANÇA ParseError NO ERRO FATAL MESMO COM onError
export const parseXml = (text: string) => {
    const { xmldom, parser } = ready()

    try {
        return parser.parseFromString(text, 'text/xml').documentElement
    } catch (error) {
        if (error instanceof xmldom.ParseError)
            return null

        throw error
    }
}

export const serializeXml = (element: XmlElement) => ready().serializer.serializeToString(element)

export const tagOf = (element: XmlElement) => element.localName ?? element.tagName.split(':').pop() ?? ''

export const childrenOf = (element: XmlElement | undefined) => {
    const result: XmlElement[] = []

    for (let i = 0; element && i < element.childNodes.length; i++) {
        const node = element.childNodes[i]

        if (node.nodeType === 1)
            result.push(node as XmlElement)
    }

    return result
}

export const childNamed = (element: XmlElement | undefined, tag: string) => childrenOf(element).find(child => tagOf(child) === tag)

export const childrenNamed = (element: XmlElement | undefined, tag: string) => childrenOf(element).filter(child => tagOf(child) === tag)

export const textOf = (element: XmlElement | undefined) => element?.textContent ?? ''

export const walk = (element: XmlElement, visit: (element: XmlElement) => void) => {
    visit(element)
    childrenOf(element).forEach(child => walk(child, visit))
}
