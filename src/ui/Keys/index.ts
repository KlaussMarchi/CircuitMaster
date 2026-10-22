import type { useStore } from '../Store'

type State = ReturnType<typeof useStore.getState>

export type KeyAction = { id: string, label: string, keys: string[], apply: (state: State) => void }

const ZOOM_KEY = 1.25     // FATOR DE Ctrl++ / Ctrl+-

const nudge = (state: State, dx: number, dy: number) => {
    const step = state.doc.settings[state.view]?.alignToGrid === '0' ? 1 : state.getGrid()
    state.nudge(dx * step, dy * step)
}

// AÇÕES DE TECLADO COM AS TECLAS DO FRITZING (SPEC 02 §10.3); SÍMBOLOS JÁ TRAZEM O SHIFT NA PRÓPRIA TECLA (} = Shift+])
export const KEY_ACTIONS: KeyAction[] = [
    { id: 'palette', label: 'Paleta de comandos', keys: ['ctrl+k'], apply: state => state.setDialog('palette') },
    { id: 'new', label: 'Novo', keys: ['ctrl+n'], apply: state => state.newSketch() },
    { id: 'open', label: 'Abrir…', keys: ['ctrl+o'], apply: () => document.getElementById('open-file')?.click() },
    { id: 'save', label: 'Salvar', keys: ['ctrl+s'], apply: state => void state.save() },
    { id: 'undo', label: 'Desfazer', keys: ['ctrl+z'], apply: state => state.undo() },
    { id: 'redo', label: 'Refazer', keys: ['ctrl+shift+z', 'ctrl+y'], apply: state => state.redo() },
    { id: 'cut', label: 'Recortar', keys: ['ctrl+x'], apply: state => state.cut() },
    { id: 'copy', label: 'Copiar', keys: ['ctrl+c'], apply: state => state.copy() },
    { id: 'paste', label: 'Colar', keys: ['ctrl+v'], apply: state => void state.paste(false) },
    { id: 'pasteInPlace', label: 'Colar no lugar', keys: ['ctrl+shift+v'], apply: state => void state.paste(true) },
    { id: 'duplicate', label: 'Duplicar', keys: ['ctrl+d'], apply: state => void state.duplicate() },
    { id: 'selectAll', label: 'Selecionar tudo', keys: ['ctrl+a'], apply: state => state.selectAll() },
    { id: 'remove', label: 'Apagar', keys: ['delete', 'backspace'], apply: state => state.remove(false) },
    { id: 'removeMinus', label: 'Apagar sem fios', keys: ['alt+backspace'], apply: state => state.remove(true) },
    { id: 'escape', label: 'Cancelar, desmarcar', keys: ['escape'], apply: state => state.dialog ? state.setDialog(null) : state.tool !== 'select' ? state.setTool('select') : state.select([]) },
    { id: 'rotateCw', label: 'Girar 90° no sentido horário', keys: [']'], apply: state => state.rotate(90) },
    { id: 'rotateCcw', label: 'Girar 90° no sentido anti-horário', keys: ['['], apply: state => state.rotate(-90) },
    { id: 'flip', label: 'Espelhar horizontalmente', keys: ['|'], apply: state => state.view === 'schematicView' && state.flip(true) },
    { id: 'front', label: 'Trazer para frente', keys: ['ctrl+}'], apply: state => state.zOrder('front') },
    { id: 'forward', label: 'Avançar', keys: ['ctrl+]'], apply: state => state.zOrder('forward') },
    { id: 'backward', label: 'Recuar', keys: ['ctrl+['], apply: state => state.zOrder('backward') },
    { id: 'back', label: 'Enviar para trás', keys: ['ctrl+{'], apply: state => state.zOrder('back') },
    { id: 'up', label: 'Mover para cima', keys: ['arrowup'], apply: state => nudge(state, 0, -1) },
    { id: 'down', label: 'Mover para baixo', keys: ['arrowdown'], apply: state => nudge(state, 0, 1) },
    { id: 'left', label: 'Mover para a esquerda', keys: ['arrowleft'], apply: state => nudge(state, -1, 0) },
    { id: 'right', label: 'Mover para a direita', keys: ['arrowright'], apply: state => nudge(state, 1, 0) },
    { id: 'upFar', label: 'Mover 10 passos para cima', keys: ['shift+arrowup'], apply: state => nudge(state, 0, -10) },
    { id: 'downFar', label: 'Mover 10 passos para baixo', keys: ['shift+arrowdown'], apply: state => nudge(state, 0, 10) },
    { id: 'leftFar', label: 'Mover 10 passos para a esquerda', keys: ['shift+arrowleft'], apply: state => nudge(state, -10, 0) },
    { id: 'rightFar', label: 'Mover 10 passos para a direita', keys: ['shift+arrowright'], apply: state => nudge(state, 10, 0) },
    { id: 'zoomIn', label: 'Ampliar', keys: ['ctrl++', 'ctrl+='], apply: state => state.zoom(ZOOM_KEY) },
    { id: 'zoomOut', label: 'Reduzir', keys: ['ctrl+-'], apply: state => state.zoom(1 / ZOOM_KEY) },
    { id: 'fit', label: 'Enquadrar', keys: ['ctrl+0'], apply: state => state.setViewport(state.view, undefined) },
    { id: 'actual', label: '100%', keys: ['ctrl+)'], apply: state => state.setZoom(1) },
    { id: 'breadboard', label: 'Protoboard', keys: ['ctrl+1', '1'], apply: state => state.setView('breadboardView') },
    { id: 'schematic', label: 'Esquemático', keys: ['ctrl+2', '2'], apply: state => state.setView('schematicView') },
    { id: 'pcb', label: 'PCB', keys: ['ctrl+3', '3'], apply: state => state.setView('pcbView') },
    { id: 'area', label: 'Seletor de área', keys: ['v'], apply: state => state.setTool('area') },
    { id: 'hand', label: 'Editar e mover a vista', keys: ['h'], apply: state => state.setTool('select') },
    { id: 'autoroute', label: 'Autorotear', keys: ['ctrl+shift+a'], apply: state => void state.autoroute() },
    { id: 'drc', label: 'Verificar regras (DRC)', keys: ['ctrl+shift+d'], apply: state => void state.checkRules() },
    { id: 'preferences', label: 'Preferências…', keys: ['ctrl+,'], apply: state => state.setDialog('preferences') }
]

const SHOWN: Record<string, string> = { '}': 'Shift+]', '{': 'Shift+[', ')': 'Shift+0', escape: 'Esc', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→' }

const capital = (text: string) => text.length === 1 ? text.toUpperCase() : text[0].toUpperCase() + text.slice(1)

// TECLAS DE CADA AÇÃO: AS ESCOLHIDAS NAS PREFERÊNCIAS NO LUGAR DAS PADRÃO
export const getKeys = (custom: Record<string, string[]>, id: string) => custom[id] ?? KEY_ACTIONS.find(action => action.id === id)?.keys ?? []

// TECLA COMO APARECE NA TELA: ctrl+} → Ctrl+Shift+], ctrl++ → Ctrl++
export const showKey = (key: string) => {
    const main      = key.endsWith('++') || key === '+' ? '+' : key.split('+').pop() ?? ''
    const modifiers = key.slice(0, key.length - main.length).split('+').filter(Boolean)
    return [...modifiers.map(capital), SHOWN[main] ?? capital(main)].join('+')
}


// TECLA DO EVENTO NO FORMATO DA TABELA (shift+ SÓ PARA LETRAS E TECLAS NOMEADAS: O SÍMBOLO JÁ TRAZ O SHIFT)
export const keyOf = (event: { key: string, ctrlKey: boolean, metaKey: boolean, altKey: boolean, shiftKey: boolean }) => {
    const key   = event.key.toLowerCase()
    const shift = event.shiftKey && (key.length > 1 || /[a-z]/.test(key)) ? 'shift+' : ''
    return `${event.ctrlKey || event.metaKey ? 'ctrl+' : ''}${event.altKey ? 'alt+' : ''}${shift}${key}`
}

// MAPA TECLA → AÇÃO; A TECLA ESCOLHIDA PARA UMA AÇÃO SAI DAS PADRÃO DAS OUTRAS
export const getKeyMap = (custom: Record<string, string[]>) => {
    const taken = new Set(Object.values(custom).flat())
    return new Map(KEY_ACTIONS.flatMap(action => getKeys(custom, action.id).filter(key => custom[action.id] || !taken.has(key)).map(key => [key, action] as const)))
}

// PRIMEIRA TECLA QUE AINDA ACIONA A AÇÃO, COMO APARECE NOS MENUS (VAZIA SE OUTRA AÇÃO A TOMOU)
export const shortcutOf = (custom: Record<string, string[]>, id: string) => {
    const key = [...getKeyMap(custom)].find(([, action]) => action.id === id)?.[0]
    return key ? showKey(key) : undefined
}

// TECLAS DEPOIS DE ESCOLHER key PARA A AÇÃO id: SAI DE QUALQUER OUTRA ESCOLHIDA; null VOLTA AO PADRÃO
export const assignKey = (custom: Record<string, string[]>, id: string, key: string | null) => {
    const others = Object.fromEntries(Object.entries(custom).filter(([other]) => other !== id).map(([other, keys]) => [other, keys.filter(item => item !== key)]))
    return key === null ? others : { ...others, [id]: [key] }
}
