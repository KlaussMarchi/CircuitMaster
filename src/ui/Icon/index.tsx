// TRAÇOS DE CADA ÍCONE NUMA GRADE 24×24, LINHA DE 1,5 NA COR DO TEXTO (DESIGN.md §5)
const ICONS: Record<string, string[]> = {
    file: ['M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z', 'M14 3v5h5', 'M12 11.5v6', 'M9 14.5h6'],
    open: ['M3.5 7.5A1.5 1.5 0 0 1 5 6h4.5l2 2H19a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z'],
    save: ['M5 3.5h10.5l5 5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z', 'M7.5 3.5v4.5h7V3.5', 'M7 20.5v-6h10v6'],
    undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
    redo: ['m15 14 5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
    rotate: ['M20 12a8 8 0 1 1-2.35-5.65', 'M20 4v5h-5'],
    flip: ['M12 3v18', 'M9 7 3.5 17H9z', 'M15 7l5.5 10H15z'],
    trash: ['M4 7h16', 'M9.5 7V4.5h5V7', 'M6.5 7l.9 12.6A1.5 1.5 0 0 0 8.9 21h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7', 'M10 11v6', 'M14 11v6'],
    fit: ['M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9', 'M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9', 'M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15', 'M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15', 'M9 9h6v6H9z'],
    zoomIn: ['M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z', 'm20 20-4.8-4.8', 'M10.5 7.5v6', 'M7.5 10.5h6'],
    zoomOut: ['M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z', 'm20 20-4.8-4.8', 'M7.5 10.5h6'],
    play: ['M7 4.5v15l12.5-7.5z'],
    stop: ['M6.5 6.5h11v11h-11z'],
    pause: ['M7.5 5h3v14h-3z', 'M13.5 5h3v14h-3z'],
    restart: ['M4 12a8 8 0 1 0 2.35-5.65', 'M4 4v5h5'],
    sliders: ['M4 7h9', 'M17 7h3', 'M4 17h3', 'M11 17h9', 'M15 4.5v5', 'M9 14.5v5'],
    wave: ['M2.5 12h3.5l2.5-6.5 4 13 3-9 1.5 2.5h4.5'],
    project: ['M6 3.5h8.5l4 4V20a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5V4A.5.5 0 0 1 6 3.5z', 'M14 3.5V8h4.5', 'M8.5 12h7', 'M8.5 15.5h7'],
    chip: ['M7.5 7.5h9v9h-9z', 'M10 3.5v4', 'M14 3.5v4', 'M10 16.5v4', 'M14 16.5v4', 'M3.5 10h4', 'M3.5 14h4', 'M16.5 10h4', 'M16.5 14h4'],
    search: ['M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z', 'm20 20-4.8-4.8'],
    breadboard: ['M3.5 6.5h17v11h-17z', 'M7 10h.01', 'M10.5 10h.01', 'M14 10h.01', 'M17.5 10h.01', 'M7 14h.01', 'M10.5 14h.01', 'M14 14h.01', 'M17.5 14h.01'],
    schematic: ['M2 12h4l1.5-3.5 3 7 3-7 3 7 1.5-3.5h4'],
    pcb: ['M4 4h16v16H4z', 'M8 8h2.5v2.5H8z', 'M9.25 10.5V16h6', 'M15.25 16v-4.5', 'M14 11.5h2.5'],
    wire: ['M5 18.5h5.5v-13H19', 'M5 18.5h.01', 'M19 5.5h.01'],
    note: ['M5 4h14v10.5L13.5 20H5z', 'M13.5 20v-5.5H19'],
    close: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
    more: ['M6.5 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0z', 'M13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0z', 'M19.5 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0z'],
    chevronDown: ['m6.5 9.5 5.5 5.5 5.5-5.5'],
    chevronRight: ['m9.5 6.5 5.5 5.5-5.5 5.5'],
    chevronLeft: ['m14.5 6.5-5.5 5.5 5.5 5.5'],
    grid: ['M4 4h16v16H4z', 'M4 12h16', 'M12 4v16'],
    gauge: ['M4.5 17a8 8 0 1 1 15 0', 'm12 13 3.5-4.5', 'M12 13h.01'],
    route: ['M5 19V9.5A4.5 4.5 0 0 1 9.5 5H15', 'm12 2 3 3-3 3', 'M5 19h.01', 'M19 15v4', 'M17 17h4'],
    check: ['m5 12.5 4.5 4.5L19 7.5'],
    info: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M12 11v5', 'M12 8h.01'],
    clock: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M12 7.5V12l3 2'],
    panel: ['M4 5h16v14H4z', 'M4 15h16'],
    select: ['M5 4l6.5 16 2.3-6.7L20.5 11z'],
    hand: ['M8 13V5.5a1.5 1.5 0 0 1 3 0V11', 'M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5', 'M14 10.5V5.5a1.5 1.5 0 0 1 3 0V12', 'M17 11.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.6-2.2L4.6 15.6a1.5 1.5 0 0 1 2.2-2L8 15'],
    duplicate: ['M8 8h11v11H8z', 'M5 16V5h11'],
    sun: ['M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z', 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4'],
    moon: ['M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z'],
    parts: ['M7 7h10v10H7z', 'M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4'],
    layers: ['M12 3.5l9 4.8-9 4.8-9-4.8z', 'M3 12.5l9 4.8 9-4.8', 'M3 16.7l9 4.8 9-4.8'],
    alert: ['M12 4l9.5 16.5h-19z', 'M12 10v4.5M12 17.5v.01'],
    help: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1 1-1.1 1.8M12 16.8v.01'],
    plus: ['M12 5v14M5 12h14'],
    minus: ['M5 12h14'],
    reset: ['M4 12a8 8 0 1 0 2.6-5.9L4 8.5', 'M4 4v4.5h4.5'],
    flask: ['M9 3h6', 'M10 3v6l-5.5 9.5A1.5 1.5 0 0 0 5.8 21h12.4a1.5 1.5 0 0 0 1.3-2.5L14 9V3', 'M7.5 15h9']
}

const PROBE = ['M4 20l4.5-4.5', 'M7.5 12.5l4 4', 'M10 10l5.5-5.5a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L13 13z', 'M3 21h.01']

export type IconName = keyof typeof ICONS

export const Icon = ({ name, className = 'ic' }: { name: IconName, className?: string }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {ICONS[name].map(d => <path key={d} d={d} />)}
    </svg>
)

// PONTA DE PROVA (A AGULHA DO INSTRUMENTO)
export const ProbeIcon = ({ className = 'ic' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {PROBE.map(d => <path key={d} d={d} />)}
    </svg>
)
