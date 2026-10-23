import { lazy, Suspense, useEffect, type ChangeEvent } from 'react'
import { useStore } from '../Store'
import { Topbar } from '../Topbar'
import { Rail, toggleSheet } from '../Rail'
import { LeftPanel } from '../LeftPanel'
import { Stage } from '../Stage'
import { SimulationPanel } from '../SimulationPanel'
import { SidePanel } from '../SidePanel'
import { StatusBar } from '../StatusBar'
import { Boundary } from '../Boundary'
import { Palette } from '../Palette'
import { getKeyMap, keyOf } from '../Keys'
import { t } from '../../core/Text'

// EDITOR DE PEÇAS, DIÁLOGOS E TOUR SÓ CARREGAM QUANDO ABREM: FORA DO JAVASCRIPT INICIAL (FRIZING_KICAD §8); A PALETA FICA NO INICIAL PARA O PRIMEIRO Ctrl+K NÃO PERDER TECLAS
const PartEditor = lazy(() => import('../PartEditor').then(module => ({ default: module.PartEditor })))
const Dialog     = lazy(() => import('../Dialog').then(module => ({ default: module.Dialog })))
const Tour       = lazy(() => import('../Tour').then(module => ({ default: module.Tour })))

const EditorSlot = () => useStore(state => state.editing) ? <Suspense fallback={null}><PartEditor /></Suspense> : null
const DialogSlot = () => useStore(state => state.dialog !== null && state.dialog !== 'palette') ? <Suspense fallback={null}><Dialog /></Suspense> : null
const TourSlot   = () => useStore(state => state.tour !== null) ? <Suspense fallback={null}><Tour /></Suspense> : null

const NATIVE = new Set(['click', 'doubleClick', 'resetOrigin'])    // Enter, End E ESPAÇO NUM BOTÃO FOCADO SÃO DO PRÓPRIO BOTÃO

const onKey = (event: KeyboardEvent) => {
    const state  = useStore.getState()
    const action = getKeyMap(state.keys).get(keyOf(event))

    if (!action || state.editing || (action.id !== 'palette' && (event.target as HTMLElement).closest('input, select, textarea, [contenteditable="true"]')))
        return

    if (NATIVE.has(action.id) && (event.target as HTMLElement).closest('button, a, [role="menuitem"], [role="tab"], [role="option"]'))
        return

    event.preventDefault()
    action.apply(state)
}

// ABA ESCONDIDA OU FECHANDO GRAVA JÁ O SALVAMENTO AUTOMÁTICO AGENDADO
const onHide = (event: Event) => (event.type === 'pagehide' || document.visibilityState === 'hidden') && void useStore.getState().autosave.flush()    // NA RECARGA A PÁGINA SAI AINDA VISÍVEL

const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (file)
        await useStore.getState().open(file.name, new Uint8Array(await file.arrayBuffer()))
}

// JANELA DO EDITOR: BARRA SUPERIOR, TRILHO, PAINEL ESQUERDO, PALCO COM A DOCA DE SIMULAÇÃO, INSPETOR E BARRA DE STATUS (DESIGN.md §6)
export const App = () => {
    const language = useStore(state => state.language)
    const hidden   = useStore(state => state.leftHidden)

    useEffect(() => {
        useStore.getState().setup().then(() => Promise.all([import('../Output'), import('../Lesson'), import('../Dialog'), import('../Tour')]).catch(() => null), error => useStore.setState({ message: t('falha ao iniciar: {0}', String(error)) }))    // DEPOIS DA ABERTURA: EXPORTAR E O CARTÃO DIDÁTICO SEGUEM FUNCIONANDO SEM REDE
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
        <div className="app" key={language}>
            <Boundary name="Barra superior" className="topbar"><Topbar /></Boundary>
            <div className={`shell${hidden ? ' no-left' : ''}`}>
                <Boundary name="Trilho" className="rail"><Rail /></Boundary>
                <Boundary name="Painel lateral" className="left card"><LeftPanel /></Boundary>
                <main className="center">
                    <Boundary name="Quadro" className="stage card"><Stage /></Boundary>
                    <Boundary name="Simulação" className="dock card"><SimulationPanel /></Boundary>
                </main>
                <Boundary name="Inspetor" className="inspector card"><SidePanel /></Boundary>
                <button className="sheet-scrim" aria-label={t('Fechar painel')} onClick={() => toggleSheet(null)} />
            </div>
            <Boundary name="Barra de status" className="status"><StatusBar /></Boundary>
            <input id="open-file" type="file" accept=".fzz,.fz,.fzpz,.fzbz,.fzb" hidden onChange={onFile} />
            <Boundary name="Diálogo" className="modal" close={() => useStore.setState({ dialog: null })}><DialogSlot /></Boundary>
            <Boundary name="Editor de peças" className="modal" close={() => useStore.getState().editPart(null)}><EditorSlot /></Boundary>
            <Boundary name="Paleta de comandos" className="modal" close={() => useStore.setState({ dialog: null })}><Palette /></Boundary>
            <Boundary name="Tour" className="modal" close={() => useStore.getState().finishTour()}><TourSlot /></Boundary>
        </div>
    )
}
