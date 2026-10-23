import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { normalize } from '../../core/Featured'
import { getCommands, type Command } from '../MenuBar'
import { useStore } from '../Store'
import { t } from '../../core/Text'

const SHOWN = 12    // COMANDOS NA LISTA

// TERMOS EM INGLÊS DO FRITZING E DO KICAD PARA CADA RÓTULO: QUEM VEM DE LÁ ACHA PELO NOME QUE CONHECE
const ALIASES: Record<string, string> = {
    'Novo': 'new sketch project', 'Abrir…': 'open file load', 'Exemplos': 'examples samples sketches', 'Salvar': 'save', 'Versões salvas automaticamente…': 'autosave backup recover versions local history rescue', 'Fechar sketch': 'close sketch tab document', 'Localizar peça no sketch…': 'find part in sketch search', 'Selecionar peças travadas': 'select all locked parts', 'Selecionar peças desatualizadas': 'select outdated obsolete parts',
    'Atualizar peças selecionadas': 'update selected parts swap obsolete', 'Exportar peça…': 'export part fzpz', 'Desligar todos os fios': 'disconnect all wires', 'Selecionar trilhas "não rotear"': 'select all dont autoroute traces',
    'Selecionar todos os jumpers': 'select all jumpers', 'Abrir recentes': 'open recent files history', 'Limpar recentes': 'clear recent files', 'Reverter': 'revert reload discard changes',
    'Salvar como…': 'save as rename', 'Salvar uma cópia…': 'save a copy duplicate file', 'Imprimir…': 'print printer paper', 'Salvar todos': 'save all', 'Copiar como texto': 'copy as text clipboard', 'Apagar com cliques': 'interactive delete tool eraser',
    'Seleção por laço': 'lasso polygon select', 'Zoom na seleção': 'zoom to selected objects', 'Zoom na área arrastada': 'zoom to selection area window', 'Desfazer o último zoom': 'undo last zoom', 'Refazer o último zoom': 'redo last zoom',
    'Centralizar na seleção': 'pan to center selected objects', 'Centralizar no cursor': 'center on cursor', 'Grade': 'grid', 'Próxima grade': 'switch to next grid', 'Grade anterior': 'switch to previous grid', 'Alternar grade rápida': 'cycle fast grid',
    'Editar grades…': 'edit grids', 'Colocar a origem da grade': 'grid origin place', 'Origem da grade no cursor': 'grid origin', 'Restaurar a origem da grade': 'reset grid origin', 'Unidades': 'units', 'Polegadas': 'inches imperial',
    'Milímetros': 'millimeters metric mm', 'Mils': 'mils thou', 'Alternar unidades': 'switch units', 'Coordenadas polares': 'polar coordinates', 'Cursor': 'crosshair cursor', 'Pequeno': 'small crosshairs',
    'Na janela toda': 'full window crosshairs', 'A 45°': '45 degree crosshairs', 'Sempre mostrar o cursor em cruz': 'always show crosshairs', 'Painel da esquerda': 'hide library tree parts panel sidebar',
    'Idioma': 'language english portuguese', 'Guia de uso': 'help documentation manual guide', 'Boas-vindas': 'welcome getting started', 'Ver na protoboard': 'cross probe breadboard', 'Ver no esquemático': 'select on schematic cross probe',
    'Ver na PCB': 'select on pcb cross probe',
    'PNG…': 'export image png', 'JPG…': 'export image jpg jpeg', 'SVG…': 'export image svg', 'PDF…': 'export image pdf plot', 'Gravável (PDF)…': 'etchable pdf', 'Gravável (SVG)…': 'etchable svg',
    'Tudo para fabricar (zip)…': 'fabrication outputs production gerber drill jobset manufacturing',
    'Gerber estendido (RS-274X)…': 'gerber fabrication outputs plot cam', 'Pick-and-place…': 'pick and place position file centroid', 'Lista de materiais (HTML)…': 'bill of materials bom', 'Lista de materiais (CSV)…': 'bill of materials bom csv',
    'Lista de materiais (PDF)…': 'bill of materials bom pdf', 'Netlist IPC-D-356A…': 'ipc netlist test', 'Netlist XML…': 'xml netlist', 'Netlist SPICE…': 'spice netlist cir',
    'Desfazer': 'undo', 'Refazer': 'redo', 'Histórico de desfazer': 'undo history', 'Recortar': 'cut', 'Copiar': 'copy', 'Colar': 'paste', 'Colar no lugar': 'paste in place', 'Duplicar': 'duplicate',
    'Apagar': 'delete remove', 'Apagar sem fios': 'delete minus', 'Selecionar tudo': 'select all', 'Desmarcar': 'deselect clear selection', 'Adicionar nota': 'add note text',
    'Ampliar': 'zoom in', 'Reduzir': 'zoom out', 'Enquadrar': 'fit in window zoom to fit', 'Tamanho real': 'actual size', '100%': '100 percent', 'Alinhar à grade': 'align to grid snap', 'Mostrar grade': 'show grid',
    'Fios ortogonais (90°)': 'orthogonal wires 90 degrees', 'Protoboard': 'breadboard view', 'Esquemático': 'schematic view eeschema', 'PCB': 'pcb view board pcbnew layout', 'Tema claro': 'light theme', 'Tema escuro': 'dark theme',
    'Autorotear': 'autoroute autorouter', 'Verificar regras (DRC)': 'drc design rules check', 'Regras do autorouter e DRC…': 'autorouter drc settings rules constraints', 'Preencher com terra': 'ground fill copper pour zone',
    'Preencher com cobre': 'copper fill pour zone', 'Remover preenchimento': 'remove copper fill unfill zones', 'Limpar sementes de terra': 'clear ground fill seeds', 'Mover trilha para a outra face': 'move trace to other side layer',
    'Não rotear automaticamente': "don't autoroute", 'Selecionar todas as trilhas': 'select all traces tracks', 'Selecionar todos os fios': 'select all wires', 'Selecionar trilhas autoroteáveis': 'select autoroutable traces',
    'Selecionar todas as vias': 'select all vias', 'Selecionar todos os preenchimentos': 'select all copper fills', 'Apagar trilhas autoroteadas': 'delete autorouted traces', 'Apagar fios autoroteados': 'delete autorouted wires',
    'Simular': 'simulate run simulation spice ngspice', 'Parar a simulação': 'stop simulation', 'Painel de simulação': 'simulation panel plot scope', 'Prontos': 'ready made circuits demos benches examples',
    'Ponta de tensão': 'voltage probe', 'Ponta de corrente': 'current probe', 'Ponta de tensão e corrente': 'voltage current probe', 'Remover todas as pontas de prova': 'remove all probes',
    'Paleta de comandos': 'command palette', 'Atalhos de teclado': 'keyboard shortcuts hotkeys', 'Sobre o CircuitMaster': 'about', 'Peças': 'parts library bins symbol footprint chooser', 'Projeto': 'project outline parts list nets', 'Problemas': 'problems drc erc violations',
    'Cobre de cima': 'top copper layer f.cu', 'Cobre de baixo': 'bottom copper layer b.cu', 'Serigrafia de cima': 'top silkscreen layer f.silkscreen', 'Serigrafia de baixo': 'bottom silkscreen layer b.silkscreen',
    'Placa': 'board layer edge cuts outline', 'Imagem das peças': 'part image layer fab', 'Ratsnest': 'ratsnest layer airwires', 'Mostrar todas as camadas': 'show all layers', 'Ocultar todas as camadas': 'hide all layers',
    'Escolher sementes…': 'choose ground fill seeds', 'Camadas': 'layers appearance', 'Protoboards': 'breadboard layer', 'Fios': 'wires layer', 'Rótulos das peças': 'part labels layer', 'Notas': 'notes layer', 'Réguas': 'rulers layer', 'Moldura': 'frame layer sheet', 'Texto': 'text layer',
    'Colorir fios pelo comprimento': 'color breadboard wires by length', 'Tamanho da grade…': 'set grid size', 'Restaurar a grade padrão': 'restore default grid size', 'Cor de fundo…': 'set background color',
    'Bin em ícones': 'show parts bin icon view', 'Bin em lista': 'show parts bin list view', 'Mostrar não roteadas': 'show unrouted ratsnest connections', 'Ver de baixo': 'view from below flip board view bottom',
    'As duas faces de cobre clicáveis': 'set both copper layers clickable', 'Só a face de cima clicável': 'set copper top layer clickable active', 'Só a face de baixo clicável': 'set copper bottom layer clickable active',
    'Modo da interface': 'mode beginner maker professional', 'Iniciante': 'beginner mode', 'Maker': 'maker mode', 'Profissional': 'professional pro mode',
    'Girar': 'rotate', 'Espelhar horizontalmente': 'flip horizontal mirror', 'Espelhar verticalmente': 'flip vertical mirror', 'Travar peça': 'lock part', 'Sticky': 'sticky', 'Mostrar rótulo da peça': 'show part label',
    'Editar (editor de peças)': 'edit part parts editor symbol editor footprint editor', 'Adicionar ao bin': 'add to bin', 'Trazer para frente': 'bring to front', 'Enviar para trás': 'send to back', 'Avançar': 'bring forward raise', 'Recuar': 'send backward lower'
}

// NOTA DE UM COMANDO: TODO TERMO TEM DE APARECER NO RÓTULO (NAS DUAS LÍNGUAS), NO CAMINHO OU NOS TERMOS EM INGLÊS; NO RÓTULO VALE MAIS, COMEÇO DE PALAVRA MAIS AINDA; NO EMPATE, O RÓTULO MAIS CURTO É O MAIS EXATO
const score = (command: Command, terms: string[]) => {
    const label = normalize(`${command.entry.label} ${t(command.entry.label)}`)
    const rest  = normalize(`${command.path.join(' ')} ${command.path.map(item => t(item)).join(' ')} ${ALIASES[command.entry.label] ?? ''}`)
    const words = label.split(/[^a-z0-9%]+/)
    const each  = terms.map(term => words.some(word => word.startsWith(term)) ? 4 : label.includes(term) ? 3 : rest.split(/[^a-z0-9%]+/).some(word => word.startsWith(term)) ? 2 : rest.includes(term) ? 1 : 0)
    return each.every(value => value > 0) ? each.reduce<number>((sum, value) => sum + value, 0) - (command.entry.disabled ? 0.5 : 0) - label.length / 1000 : 0
}

// PALETA DE COMANDOS (Ctrl+K): QUALQUER AÇÃO DOS MENUS PELO NOME EM PORTUGUÊS OU PELOS TERMOS DO FRITZING E DO KICAD, COM O CAMINHO E O ATALHO; ENTER EXECUTA
export const Palette = () => {
    const open              = useStore(state => state.dialog === 'palette')
    const [text, setText]   = useState('')
    const [index, setIndex] = useState(0)
    const terms             = normalize(text).split(/\s+/).filter(Boolean)
    const found             = useMemo(() => open ? getCommands(useStore.getState()).map(command => [command, terms.length ? score(command, terms) : 1] as const).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).slice(0, SHOWN).map(([command]) => command) : [], [open, text])

    useEffect(() => {
        setText('')
        setIndex(0)
    }, [open])

    if (!open)
        return null

    const close = () => useStore.setState({ dialog: null })

    const choose = (command: Command | undefined) => {
        if (!command || command.entry.disabled)
            return

        close()
        command.entry.apply?.()
    }

    const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setIndex((index + (event.key === 'ArrowDown' ? 1 : -1) + found.length) % Math.max(1, found.length))
        }

        if (event.key === 'Enter')
            choose(found[index])

        if (event.key === 'Escape')
            close()
    }

    return (
        <div className="modal palette" onPointerDown={event => event.target === event.currentTarget && close()}>
            <section className="card" role="dialog" aria-modal="true" aria-label={t('Paleta de comandos')}>
                <input autoFocus className="palette-in" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-label={t('Buscar comando')} placeholder={t('O que você quer fazer? (português ou inglês: copiar, autoroute, gerber…)')} value={text} onChange={event => { setText(event.target.value); setIndex(0) }} onKeyDown={onKey} />
                <ul id="palette-list" role="listbox" aria-label={t('Comandos')}>
                    {found.map((command, i) => (
                        <li key={`${command.path.join('/')}/${command.entry.label}`} role="option" aria-selected={i === index} aria-disabled={command.entry.disabled} className={i === index ? 'current' : ''} onPointerEnter={() => setIndex(i)} onClick={() => choose(command)}>
                            <span className="label">{t(command.entry.label)}</span>
                            <span className="muted path">{command.path.map(item => t(item)).join(' › ')}</span>
                            {command.entry.shortcut && <kbd>{command.entry.shortcut}</kbd>}
                        </li>
                    ))}
                    {!found.length && <li className="muted">{t('Nenhum comando para “{0}”. Tente outra palavra, em português ou em inglês.', text)}</li>}
                </ul>
            </section>
        </div>
    )
}
