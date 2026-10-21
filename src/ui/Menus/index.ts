import type { Point } from '../../core/Geometry'
import { WIRE_FLAGS } from '../../core/Document'
import { Scene } from '../../engine/Scene'
import { WIRE_COLORS } from '../../engine/Drawing'
import { bendToVia, clearGroundFillSeeds, deleteItems, deleteRatsnest, joinWires, setAutoroutable, setGroundFillSeed, setLabelVisible, setLayerHidden, setLocked, setSticky, setTraceSide, setWireColor, splitWire, straightenWire, viaToBend, type ZMode } from '../../engine/Edit'
import { getConfig } from '../Pcb'
import type { MenuEntry } from '../ContextMenu'
import { isEditable, useStore } from '../Store'

export type Target = { kind: 'part' | 'wire' | 'ratsnest', modelIndex: string, key: string | null, point: Point, rat: [string, string] | null }

const COLOR_NAMES: Record<string, string> = { blue: 'azul', red: 'vermelho', black: 'preto', yellow: 'amarelo', green: 'verde', grey: 'cinza', white: 'branco', orange: 'laranja', ochre: 'ocre', cyan: 'ciano', brown: 'marrom', purple: 'roxo', pink: 'rosa' }
const SILKSCREEN  = ['silkscreen', 'silkscreen0']
const AUTOROUTE   = 32

const Z_ITEMS: [string, string, ZMode][] = [['Trazer para frente', 'Ctrl+Shift+]', 'front'], ['Avançar', 'Ctrl+]', 'forward'], ['Recuar', 'Ctrl+[', 'backward'], ['Enviar para trás', 'Ctrl+Shift+[', 'back']]

const ROTATIONS: [string, string, number, boolean][] = [['Girar 45° no sentido horário', '', 45, true], ['Girar 90° no sentido horário', ']', 90, false], ['Girar 180°', '', 180, false], ['Girar 90° no sentido anti-horário', '[', -90, false], ['Girar 45° no sentido anti-horário', '', -45, true]]

// BIN NOVO COM O NOME PEDIDO; CANCELAR NÃO CRIA
export const promptBin = (moduleIds: string[]) => {
    const title = window.prompt('Nome do novo bin', `Bin ${useStore.getState().userBins.length + 1}`)

    if (title !== null)
        useStore.getState().createBin(title, moduleIds)
}

const zMenu = (disabled: boolean): MenuEntry => ({ label: 'Elevar e rebaixar', disabled, items: Z_ITEMS.map(([label, shortcut, mode]) => ({ label, shortcut, apply: () => useStore.getState().zOrder(mode) })) })

// MENU DE PEÇA DA VISTA CORRENTE (SPEC 02 §10.1)
const partMenu = (target: Target): MenuEntry[] => {
    const { doc, library, view, selection, edit, rotate, flip, copy, duplicate, remove, addToMine, userBins, addToBin, editPart } = useStore.getState()
    const scene     = new Scene(doc, library, view)
    const chosen    = selection.filter(modelIndex => !scene.isWire(modelIndex))
    const partOf    = (modelIndex: string) => library.getPart(doc.instances[modelIndex]?.moduleIdRef ?? '')
    const isLocked  = (modelIndex: string) => scene.getView(modelIndex)?.locked ?? false
    const free      = chosen.filter(modelIndex => !isLocked(modelIndex))
    const part      = partOf(target.modelIndex)
    const shown     = Object.values(doc.instances).filter(instance => scene.isShown(instance)).length
    const labelled  = chosen.filter(modelIndex => scene.getView(modelIndex)?.label || ['part', 'jumper', 'symbol'].includes(partOf(modelIndex)?.kind ?? ''))
    const visible   = labelled.filter(modelIndex => scene.getView(modelIndex)?.label?.visible)
    const silk      = chosen.filter(modelIndex => partOf(modelIndex)?.views.pcbView?.layers.some(layer => SILKSCREEN.includes(layer)))
    const silkOff   = silk.length > 0 && silk.every(modelIndex => scene.getView(modelIndex)?.hidden.some(layer => SILKSCREEN.includes(layer)))
    const seed      = target.key ? scene.getView(target.modelIndex)?.connectors.find(connector => `${target.modelIndex}/${connector.id}` === target.key)?.groundFillSeed ?? false : false
    const sticky    = (part?.views[view]?.sticky.length ?? 0) > 0
    const stickyOn  = doc.instances[target.modelIndex]?.properties.sticky === 'true'
    const turn45    = free.some(modelIndex => partOf(modelIndex)?.kind !== 'breadboard')
    const canFlip   = (horizontal: boolean) => view === 'schematicView' && free.some(modelIndex => horizontal ? partOf(modelIndex)?.views[view]?.flipHorizontal : partOf(modelIndex)?.views[view]?.flipVertical)
    const locked    = chosen.some(isLocked)
    const modules   = [...new Set(chosen.map(modelIndex => doc.instances[modelIndex]?.moduleIdRef ?? ''))]

    return [
        { label: 'Girar', disabled: !free.length, items: ROTATIONS.map(([label, shortcut, degrees, fine]) => ({ label, shortcut, disabled: fine && !turn45, apply: () => rotate(degrees) })) },
        ...view === 'schematicView' ? [{ label: 'Espelhar horizontalmente', shortcut: '|', disabled: !canFlip(true), apply: () => flip(true) }, { label: 'Espelhar verticalmente', disabled: !canFlip(false), apply: () => flip(false) }] : [],
        zMenu(chosen.length >= shown),
        { label: 'Travar peça', checked: locked, disabled: !chosen.length, apply: () => edit(current => setLocked(current, view, chosen, !locked)) },
        ...sticky ? [{ label: 'Sticky', checked: stickyOn, apply: () => edit(current => setSticky(current, [target.modelIndex], !stickyOn)) }] : [],
        null,
        { label: 'Copiar', shortcut: 'Ctrl+C', apply: copy },
        { label: 'Duplicar', shortcut: 'Ctrl+D', apply: () => void duplicate() },
        { label: 'Apagar', shortcut: 'Delete', disabled: !free.length, apply: () => remove(false) },
        { label: 'Apagar sem fios', shortcut: 'Alt+Backspace', disabled: !free.length, apply: () => remove(true) },
        null,
        { label: 'Editar (editor de peças)', disabled: !isEditable(part), apply: () => editPart(target.modelIndex) },
        { label: 'Adicionar ao bin', items: [
            { label: 'Meus itens', apply: () => addToMine(modules) },
            ...userBins.map((bin, i): MenuEntry => ({ label: bin.title, apply: () => addToBin(i, modules) })),
            null,
            { label: 'Novo bin…', apply: () => promptBin(modules) }
        ] },
        null,
        { label: visible.length === labelled.length && labelled.length ? 'Ocultar rótulo da peça' : 'Mostrar rótulo da peça', disabled: !labelled.length, apply: () => edit(current => setLabelVisible(current, library, view, labelled, visible.length !== labelled.length)) },
        ...view === 'pcbView' ? [
            { label: silkOff ? 'Mostrar serigrafia da peça' : 'Ocultar serigrafia da peça', disabled: !silk.length, apply: () => edit(current => setLayerHidden(current, view, silk, SILKSCREEN, !silkOff)) },
            ...part?.kind === 'via' ? [{ label: 'Converter via em dobra', disabled: viaToBend(doc, library, target.modelIndex) === doc, apply: () => edit(current => viaToBend(current, library, target.modelIndex)) }] : [],
            null,
            { label: 'Definir semente de preenchimento de terra', checked: seed, disabled: !target.key, apply: () => edit(current => setGroundFillSeed(current, target.key ?? '', !seed)) },
            { label: 'Limpar sementes de preenchimento de terra', apply: () => edit(clearGroundFillSeeds) }
        ] : []
    ]
}

// MENU DE FIO, TRILHA OU LINHA DE RATSNEST (SPEC 02 §10.2)
const wireMenu = (target: Target): MenuEntry[] => {
    const { doc, library, view, edit, connect, select } = useStore.getState()
    const scene  = new Scene(doc, library, view)
    const isRat  = target.kind === 'ratsnest'
    const wire   = target.modelIndex
    const state  = scene.getView(wire)
    const bend   = target.key ? scene.getBendpoint(target.key) : null
    const flags  = state?.geometry.wireFlags ?? 0
    const trace  = (flags & (WIRE_FLAGS.pcbView | WIRE_FLAGS.schematicView)) !== 0
    const colors = view === 'pcbView' ? [] : WIRE_COLORS[view]
    const rat    = target.rat ?? ['', '']

    const removeWire = (minus: boolean) => {
        edit(current => deleteItems(current, library, view, [wire], minus))
        select([])
    }

    return [
        zMenu(isRat),
        null,
        ...colors.length ? [{ label: 'Cor do fio', disabled: isRat, items: colors.map(([name, color]) => ({ label: COLOR_NAMES[name], checked: state?.wire?.color.toLowerCase() === color, apply: () => edit(current => setWireColor(current, view, [wire], color)) })) }] : [],
        ...view === 'pcbView' ? [{ label: state?.layer === 'copper0trace' ? 'Mover para a face de cima' : 'Mover para a face de baixo', disabled: isRat || !trace, apply: () => edit(current => setTraceSide(current, wire)) }] : [],
        { label: view === 'breadboardView' ? 'Criar fio a partir do ratsnest' : 'Criar trilha a partir do ratsnest', disabled: !isRat, apply: () => void connect(rat[0], rat[1]) },
        ...view !== 'breadboardView' ? [{ label: 'Não rotear automaticamente', checked: trace && (flags & AUTOROUTE) === 0, disabled: isRat || !trace, apply: () => edit(current => setAutoroutable(current, wire, (flags & AUTOROUTE) === 0)) }] : [],
        null,
        { label: isRat ? 'Apagar linha de ratsnest' : 'Apagar fio', shortcut: 'Delete', apply: () => isRat ? edit(current => deleteRatsnest(current, library, view, rat[0], rat[1])) : removeWire(false) },
        { label: 'Apagar fio até as dobras', disabled: isRat, apply: () => removeWire(true) },
        null,
        { label: bend ? 'Remover dobra' : 'Adicionar dobra', disabled: isRat || (bend !== null && bend.length !== 2), apply: () => edit(current => bend ? joinWires(current, library, view, bend[0]) : splitWire(current, view, wire, target.point).doc) },
        ...view === 'pcbView' ? [{ label: 'Converter dobra em via', disabled: isRat || !bend, apply: () => edit(current => bendToVia(current, library, bend?.[0] ?? '', getConfig(current.settings.pcbView).holeSize)) }] : [],
        { label: 'Endireitar curva', disabled: isRat || !state?.wire?.bezier, apply: () => edit(current => straightenWire(current, view, wire)) }
    ]
}

export const getMenu = (target: Target) => target.kind === 'part' ? partMenu(target) : wireMenu(target)
