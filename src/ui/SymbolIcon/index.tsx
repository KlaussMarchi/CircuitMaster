import { useEffect, useRef, useState } from 'react'
import { useStore } from '../Store'

const symbols = new Map<string, Promise<string | null>>()

const symbolUrl = (moduleId: string) => {
    if (!symbols.has(moduleId))
        symbols.set(moduleId, import('../../core/KicadPart').then(module => module.readSymbolSvg(moduleId, useStore.getState().catalog.read)).then(text => text && URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }))))

    return symbols.get(moduleId) as Promise<string | null>
}

// ÍCONE DA PEÇA DAS BIBLIOTECAS DE SÍMBOLOS: O DESENHO DO ESQUEMÁTICO, FEITO QUANDO O ITEM APARECE NA TELA (UMA BUSCA LISTA CENTENAS); filter É A INVERSÃO DO TEMA ESCURO, COMO NO QUADRO
export const SymbolIcon = ({ moduleId, filter }: { moduleId: string, filter: string | undefined }) => {
    const [url, setUrl] = useState<string | null>(null)
    const ref           = useRef<HTMLSpanElement>(null)

    useEffect(() => {
        let live = true
        const observer = new IntersectionObserver(([seen]) => {
            if (!seen?.isIntersecting)
                return

            observer.disconnect()
            void symbolUrl(moduleId).then(found => live && setUrl(found))
        })

        if (ref.current)
            observer.observe(ref.current)

        return () => {
            live = false
            observer.disconnect()
        }
    }, [moduleId])

    if (url)
        return <img src={url} alt="" draggable={false} style={filter ? { filter } : undefined} />

    return <span ref={ref} className="glyph" />
}
