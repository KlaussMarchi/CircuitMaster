import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type MenuEntry = { label: string, shortcut?: string, disabled?: boolean, checked?: boolean, apply?: () => void, items?: MenuEntry[] } | null

const EDGE    = 4      // PX DE FOLGA ATÉ A BORDA DA JANELA
const SUBMENU = 260    // PX RESERVADOS PARA ABRIR SUBMENU À DIREITA

export const MenuList = ({ items, close, left }: { items: MenuEntry[], close: () => void, left: boolean }) => {
    const [open, setOpen] = useState<number | null>(null)
    const leaf            = items.every(entry => !entry?.items)

    const choose = (entry: NonNullable<MenuEntry>) => {
        if (!entry.apply || entry.disabled)
            return

        entry.apply()
        close()
    }

    return (
        <ul className={`min-w-60 select-none rounded-md border border-neutral-300 bg-white py-1 text-[13px] text-neutral-800 shadow-xl ${leaf ? 'max-h-[75vh] overflow-y-auto' : ''}`}>
            {items.map((entry, i) => entry === null ? <li key={i} className="my-1 border-t border-neutral-200" /> : (
                <li key={i} className="relative" onMouseEnter={() => setOpen(i)}>
                    <button className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-blue-600 hover:text-white disabled:text-neutral-400 disabled:hover:bg-transparent disabled:hover:text-neutral-400" disabled={entry.disabled} onClick={() => choose(entry)}>
                        <span className="w-4 text-center">{entry.checked ? '✓' : ''}</span>
                        <span className="flex-1 whitespace-nowrap">{entry.label}</span>
                        {entry.shortcut && <span className="pl-4 text-xs opacity-60">{entry.shortcut}</span>}
                        {entry.items && <span className="pl-2 opacity-60">▸</span>}
                    </button>
                    {entry.items && open === i && !entry.disabled && <div className={`absolute top-0 -mt-1 ${left ? 'right-full' : 'left-full'}`}><MenuList items={entry.items} close={close} left={left} /></div>}
                </li>
            ))}
        </ul>
    )
}

export const ContextMenu = ({ x, y, items, close }: { x: number, y: number, items: MenuEntry[], close: () => void }) => {
    const ref               = useRef<HTMLDivElement>(null)
    const [place, setPlace] = useState<[number, number]>([x, y])

    useLayoutEffect(() => {
        const box = ref.current?.getBoundingClientRect()

        if (box)
            setPlace([Math.max(EDGE, Math.min(x, innerWidth - box.width - EDGE)), Math.max(EDGE, Math.min(y, innerHeight - box.height - EDGE))])
    }, [x, y])

    useEffect(() => {
        const onDown = (event: PointerEvent) => {
            if (!ref.current?.contains(event.target as Node))
                close()
        }

        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape')
                close()
        }

        window.addEventListener('pointerdown', onDown, true)
        window.addEventListener('keydown', onKey, true)
        return () => {
            window.removeEventListener('pointerdown', onDown, true)
            window.removeEventListener('keydown', onKey, true)
        }
    }, [close])

    return (
        <div ref={ref} className="fixed z-50" style={{ left: place[0], top: place[1] }} onContextMenu={event => event.preventDefault()}>
            <MenuList items={items} close={close} left={place[0] > innerWidth - 2 * SUBMENU} />
        </div>
    )
}
