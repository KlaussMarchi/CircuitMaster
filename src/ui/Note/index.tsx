import { useEffect, useMemo, useRef } from 'react'
import type { NoteItem } from '../../engine/Drawing'

const FILL     = '#ffe9c8'
const BORDER   = '#fabc4f'
const BAND     = 7       // PX DA BORDA INFERIOR E DO CANTO DOBRADO (SPEC 02 §10.5)
const GRIP     = 10      // PX DA ALÇA DE REDIMENSIONAR
const PT_TO_PX = 90 / 72

const TAGS    = new Set(['p', 'div', 'span', 'b', 'strong', 'i', 'em', 'u', 'br', 'ul', 'ol', 'li', 'a', 'sub', 'sup', 'font'])
const DROPPED = new Set(['script', 'style', 'head', 'title', 'meta', 'link', 'iframe', 'object', 'embed', 'svg', 'math'])
const STYLES  = new Set(['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'text-indent', 'white-space', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right'])
const LINK    = /^(https?:|mailto:)/i

const escapeText = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const escapeAttribute = (text: string) => escapeText(text).replaceAll('"', '&quot;')

const cleanStyle = (style: string | null) => (style ?? '').split(';').map(item => item.split(':')).filter(([name, value]) => value !== undefined && STYLES.has(name.trim().toLowerCase()) && !/url\(|expression|javascript:/i.test(value)).map(([name, value]) => `${name.trim().toLowerCase()}:${value.trim().replace(/([\d.]+)pt\b/g, (_, size: string) => `${(Number(size) * PT_TO_PX).toFixed(2)}px`)}`).join(';')

// HTML DA NOTA É DADO DO ARQUIVO: SÓ FORMATAÇÃO DE TEXTO, ESTILOS DE TEXTO E LINKS http/https/mailto SOBREVIVEM; pt VIRA px DE CENA (SPEC 02 §10.5)
export const sanitizeNote = (html: string) => {
    const document = new DOMParser().parseFromString(html, 'text/html')

    const clean = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE)
            return escapeText(node.textContent ?? '')

        if (node.nodeType !== Node.ELEMENT_NODE)
            return ''

        const element = node as Element
        const tag     = element.tagName.toLowerCase()
        const inner   = [...element.childNodes].map(clean).join('')
        const style   = cleanStyle(element.getAttribute('style'))
        const href    = element.getAttribute('href') ?? ''
        const link    = tag === 'a' && LINK.test(href) ? ` href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer"` : ''

        if (DROPPED.has(tag))
            return ''

        if (tag === 'br')
            return '<br>'

        if (tag === 'body')
            return `<div${style ? ` style="${escapeAttribute(style)}"` : ''}>${inner}</div>`

        return TAGS.has(tag) ? `<${tag}${style ? ` style="${escapeAttribute(style)}"` : ''}${link}>${inner}</${tag}>` : inner
    }

    return clean(document.body)
}

const textStyle = { fontFamily: '"Noto Sans", sans-serif', fontSize: `${8.5 * PT_TO_PX}px`, lineHeight: '0.9', color: 'grey', padding: `${BAND / 2}px`, width: '100%', height: '100%', overflow: 'hidden', overflowWrap: 'anywhere', outline: 'none' } as const

// NOTA DA VISTA: PAPEL COM CANTO DOBRADO, BORDA INFERIOR, TEXTO RICO SANEADO E ALÇA DE REDIMENSIONAR; EM EDIÇÃO O TEXTO VIRA contentEditable
export const NoteShape = ({ item, editing, finish }: { item: NoteItem, editing: boolean, finish: (html: string) => void }) => {
    const ref  = useRef<HTMLDivElement>(null)
    const html = useMemo(() => sanitizeNote(item.html), [item.html])
    const { x, y, width: w, height: h } = item

    useEffect(() => {
        if (editing)
            ref.current?.focus()
    }, [editing])

    return (
        <g data-index={item.modelIndex}>
            <polygon points={`${x},${y} ${x + w - BAND},${y} ${x + w},${y + BAND} ${x + w},${y + h} ${x},${y + h}`} fill={FILL} />
            <polygon points={`${x + w - BAND},${y} ${x + w},${y + BAND} ${x + w - BAND},${y + BAND}`} fill={BORDER} />
            <line x1={x} y1={y + h - BAND / 2} x2={x + w} y2={y + h - BAND / 2} stroke={BORDER} strokeWidth={BAND} />
            <foreignObject x={x} y={y} width={w} height={h - BAND}>
                <div ref={ref} style={textStyle} contentEditable={editing} suppressContentEditableWarning onBlur={event => editing && finish(sanitizeNote(event.currentTarget.innerHTML))} dangerouslySetInnerHTML={{ __html: html }} />
            </foreignObject>
            <rect data-grip={item.modelIndex} data-overlay x={x + w - GRIP} y={y + h - GRIP} width={GRIP} height={GRIP} fill={BORDER} fillOpacity={0.6} style={{ cursor: 'nwse-resize' }} />
        </g>
    )
}
