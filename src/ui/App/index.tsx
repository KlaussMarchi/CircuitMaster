import { lazy, Suspense, useEffect, type ChangeEvent } from 'react'
import { useStore } from '../Store'
import { Topbar } from '../Topbar'
import { Rail, toggleSheet } from '../Rail'
import { LeftPanel } from '../LeftPanel'
import { Stage } from '../Stage'
import { SimulationPanel } from '../SimulationPanel'
import { SidePanel } from '../SidePanel'
import { StatusBar } from '../StatusBar'
import { Dialog } from '../Dialog'
import { Boundary } from '../Boundary'
import { Palette } from '../Palette'
import { getKeyMap, keyOf } from '../Keys'

// EDITOR DE PEÇAS SÓ CARREGA QUANDO ABRE: FORA DO JAVASCRIPT INICIAL (FRIZING_KICAD §8); A PALETA FICA NO INICIAL PARA O PRIMEIRO Ctrl+K NÃO PERDER TECLAS
const PartEditor = lazy(() => import('../PartEditor').then(module => ({ default: module.PartEditor })))

const EditorSlot = () => useStore(state => state.editing) ? <Suspense fallback={null}><PartEditor /></Suspense> : null

const onKey = (event: KeyboardEvent) => {
    const state  = useStore.getState()
    const action = getKeyMap(state.keys).get(keyOf(event))

    if (!action || state.editing || (action.id !== 'palette' && (event.target as HTMLElement).closest('input, select, textarea, [contenteditable="true"]')))
        return

    event.preventDefault()
    action.apply(state)
}

// ABA ESCONDIDA OU FECHANDO GRAVA JÁ O SALVAMENTO AUTOMÁTICO AGENDADO
const onHide = () => document.visibilityState === 'hidden' && void useStore.getState().autosave.flush()

const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (file)
        await useStore.getState().open(file.name, new Uint8Array(await file.arrayBuffer()))
}

// JANELA DO EDITOR: BARRA SUPERIOR, TRILHO, PAINEL ESQUERDO, PALCO COM A DOCA DE SIMULAÇÃO, INSPETOR E BARRA DE STATUS (DESIGN.md §6)
export const App = () => {
    useEffect(() => {
        useStore.getState().setup().catch(error => useStore.setState({ message: `falha ao iniciar: ${error}` }))
        window.addEventListener('keydown', onKey)
        document.addEventListener('visibilitychange', onHide)
        window.addEventListener('pagehide', onHide)
        return () => {
            window.removeEventListener('keydown', onKey)
            document.removeEventListener('visibilitychange', onHide)
            window.removeEventListener('pagehide', onHide)
        }
    }, [])

    return (
        <div className="app">
            <Boundary name="Barra superior" className="topbar"><Topbar /></Boundary>
            <div className="shell">
                <Boundary name="Trilho" className="rail"><Rail /></Boundary>
                <Boundary name="Painel lateral" className="left card"><LeftPanel /></Boundary>
                <main className="center">
                    <Boundary name="Quadro" className="stage card"><Stage /></Boundary>
                    <Boundary name="Simulação" className="dock card"><SimulationPanel /></Boundary>
                </main>
                <Boundary name="Inspetor" className="inspector card"><SidePanel /></Boundary>
                <button className="sheet-scrim" aria-label="Fechar painel" onClick={() => toggleSheet(null)} />
            </div>
            <Boundary name="Barra de status" className="status"><StatusBar /></Boundary>
            <input id="open-file" type="file" accept=".fzz,.fz,.fzpz,.fzbz,.fzb" hidden onChange={onFile} />
            <Boundary name="Diálogo" className="modal" close={() => useStore.setState({ dialog: null })}><Dialog /></Boundary>
            <Boundary name="Editor de peças" className="modal" close={() => useStore.getState().editPart(null)}><EditorSlot /></Boundary>
            <Boundary name="Paleta de comandos" className="modal" close={() => useStore.setState({ dialog: null })}><Palette /></Boundary>
        </div>
    )
}
