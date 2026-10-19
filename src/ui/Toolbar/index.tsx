import { useRef, type ChangeEvent } from 'react'
import { VIEWS, VIEW_LABELS } from '../../core/Layer'
import { useStore } from '../Store'

const BUTTON = 'rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent'

export const Toolbar = () => {
    const view      = useStore(state => state.view)
    const ready     = useStore(state => state.ready)
    const samples   = useStore(state => state.samples)
    const name      = useStore(state => state.name)
    const past      = useStore(state => state.past.length)
    const future    = useStore(state => state.future.length)
    const selected  = useStore(state => state.selection.length)
    const enabled   = useStore(state => state.simulation.enabled)
    const transient = useStore(state => state.simulation.transient)
    const fileRef   = useRef<HTMLInputElement>(null)
    const { open, save, openSample, setView, undo, redo, rotate, remove, setViewport, setSimulation } = useStore.getState()

    const actions = [
        { label: 'Desfazer', hint: 'Ctrl+Z', apply: undo, enabled: past > 0 },
        { label: 'Refazer', hint: 'Ctrl+Shift+Z', apply: redo, enabled: future > 0 },
        { label: 'Girar', hint: '] horário, [ anti-horário', apply: () => rotate(90), enabled: selected > 0 },
        { label: 'Apagar', hint: 'Delete', apply: () => remove(false), enabled: selected > 0 },
        { label: 'Enquadrar', hint: 'Ctrl+0', apply: () => setViewport(view, undefined), enabled: true }
    ]

    const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        event.target.value = ''

        if (file)
            await open(file.name, new Uint8Array(await file.arrayBuffer()))
    }

    return (
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-neutral-300 bg-white px-3">
            <span className="mr-2 font-semibold text-emerald-700">CircuitMaster</span>
            <button className={BUTTON} disabled={!ready} title="Ctrl+O: sketch .fzz/.fz ou peças .fzpz/.fzbz" onClick={() => fileRef.current?.click()}>Abrir</button>
            <button className={BUTTON} disabled={!ready} title="Ctrl+S: grava o sketch em .fzz" onClick={save}>Salvar</button>
            <input id="open-file" ref={fileRef} type="file" accept=".fzz,.fz,.fzpz,.fzbz" hidden onChange={onFile} />
            <select className={`${BUTTON} max-w-56`} disabled={!ready} value="" onChange={event => openSample(event.target.value)}>
                <option value="">Exemplos do Fritzing…</option>
                {samples.map(file => <option key={file} value={file}>{file.replace(/\.fzz$/, '')}</option>)}
            </select>
            <nav className="ml-3 flex overflow-hidden rounded border border-neutral-300">
                {VIEWS.map((item, i) => <button key={item} className={`px-3 py-1 ${item === view ? 'bg-emerald-600 text-white' : 'hover:bg-neutral-100'}`} title={`Ctrl+${i + 1}`} onClick={() => setView(item)}>{VIEW_LABELS[item]}</button>)}
            </nav>
            <div className="ml-3 flex gap-1">
                {actions.map(action => <button key={action.label} className={BUTTON} title={action.hint} disabled={!action.enabled} onClick={action.apply}>{action.label}</button>)}
            </div>
            <div className="ml-3 flex items-center gap-1">
                <button className={`rounded border px-3 py-1 font-semibold ${enabled ? 'border-red-600 bg-red-600 text-white hover:bg-red-700' : 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'}`} disabled={!ready} title="liga o simulador ngspice" onClick={() => setSimulation({ enabled: !enabled, result: null, error: null, playing: false, step: 0 })}>{enabled ? '■ Parar' : '▶ Simular'}</button>
                <select className={BUTTON} value={transient ? 'tran' : 'op'} onChange={event => setSimulation({ transient: event.target.value === 'tran' })}>
                    <option value="op">Ponto de operação (DC)</option>
                    <option value="tran">Transitório</option>
                </select>
            </div>
            <span className="ml-auto truncate text-neutral-500">{name}</span>
        </header>
    )
}
