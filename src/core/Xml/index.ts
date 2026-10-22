import { DOMParser, ParseError, XMLSerializer, type Element } from '@xmldom/xmldom'

export type XmlElement = Element

const parser     = new DOMParser({ onError: () => {} })
const serializer = new XMLSerializer()

// TEXTO SEM ELEMENTO RAIZ VIRA NULO: O XMLDOM LANÇA ParseError NO ERRO FATAL MESMO COM onError
export const parseXml = (text: string) => {
    try {
        return parser.parseFromString(text, 'text/xml').documentElement
    } catch (error) {
        if (error instanceof ParseError)
            return null

        throw error
    }
}

export const serializeXml = (element: XmlElement) => serializer.serializeToString(element)

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
