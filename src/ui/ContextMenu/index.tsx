import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'

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
        <ul className={`menu-pop ${leaf ? 'scroll' : ''}`} role="menu">
            {items.map((entry, i) => entry === null ? <li key={i} className="menu-sep" role="separator" /> : (
                <li key={i} onMouseEnter={() => setOpen(i)}>
                    <button className={`menu-item ${entry.items && open === i ? 'open' : ''}`} role="menuitem" disabled={entry.disabled} onClick={() => choose(entry)}>
                        <span className="check">{entry.checked && <Icon name="check" />}</span>
                        <span className="label">{entry.label}</span>
                        {entry.shortcut && <kbd>{entry.shortcut}</kbd>}
                        {entry.items && <Icon name="chevronRight" className="ic arrow" />}
                    </button>
                    {entry.items && open === i && !entry.disabled && <div className={`absolute top-0 -mt-1.5 ${left ? 'right-full' : 'left-full'}`}><MenuList items={entry.items} close={close} left={left} /></div>}
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
        <div ref={ref} className="fixed z-[60]" style={{ left: place[0], top: place[1] }} onContextMenu={event => event.preventDefault()}>
            <MenuList items={items} close={close} left={place[0] > innerWidth - 2 * SUBMENU} />
        </div>
    )
}
