import { useEffect, useMemo, useState } from 'react'
import { splitKey, type Doc } from '../../core/Document'
import type { Library } from '../../core/Library'
import { formatSi } from '../../core/Properties'
import { familyOf, type Simulation } from '../../engine/Simulation'
import type { Found } from '../../workers/Indexer'
import { Grapher, type Series } from '../Grapher'
import { useStore } from '../Store'

const PALETTE  = ['#facc15', '#4ade80', '#60a5fa', '#f472b6', '#fb923c', '#a78bfa', '#2dd4bf', '#f87171']
const DEFAULTS = 3     // CURVAS MOSTRADAS QUANDO NÃO HÁ INSTRUMENTO NO CIRCUITO
const BUTTON   = 'rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-100 disabled:opacity-40'
const MODES: [string, string, string][] = [['V', 'Voltmeter', 'V'], ['A', 'Ammeter', 'A'], ['Ω', 'Ohmmeter', 'Ω']]

const nameOf = (doc: Doc, library: Library, key: string) => {
    const [modelIndex, connectorId] = splitKey(key)
    const instance                  = doc.instances[modelIndex]
    const connector                 = library.getPart(instance?.moduleIdRef ?? '')?.connectors.find(item => item.id === connectorId)
    return `${instance?.title ?? modelIndex}.${connector?.name ?? connectorId}`
}

// CURVAS POSSÍVEIS: TENSÃO DE CADA NET EM RELAÇÃO AO TERRA E CORRENTE DE CADA FONTE (SPEC 04 §8.6)
const getOptions = (result: Simulation): Series[] => {
    const simulated = new Set(result.circuit.simulated)
    const members   = [...result.circuit.nodes].filter(([key, node]) => node !== '0' && simulated.has(splitKey(key)[0]))
    const nodes     = [...new Map(members.reverse().map(([key, node]) => [node, key])).entries()].sort((a, b) => Number(a[0]) - Number(b[0]))
    const voltages  = nodes.map(([node, key]): Series => ({ id: `v:${node}`, label: `V(${nameOf(result.doc, result.library, key)})`, unit: 'V', color: '', values: result.getNodeSeries(node) }))
    const currents  = Object.keys(result.vectors).filter(name => name.endsWith('#branch')).map((name): Series => ({ id: `i:${name}`, label: `I(${name.replace('#branch', '').toUpperCase()})`, unit: 'A', color: '', values: result.vectors[name] }))
    return [...voltages, ...currents]
}

const getProbes = (result: Simulation) => result.circuit.simulated.flatMap(modelIndex => {
    const part    = result.getPart(modelIndex)
    const family  = part ? familyOf(part) : null
    const variant = (part?.properties.variant ?? '').toLowerCase()
    const node    = (key: string | null) => key && result.isWired(key) ? [`v:${result.circuit.nodes.get(key)}`] : []

    if (family === 'oscilloscope')
        return [1, 2, 3, 4].flatMap(channel => node(result.findKey(modelIndex, name => name === `v${channel} probe`)))

    if (family === 'multimeter' && variant.startsWith('ammeter'))
        return [`i:${result.getCurrentName(modelIndex)}`]

    return family === 'multimeter' ? node(result.findKey(modelIndex, name => name === 'v probe')) : []
})

const Meter = ({ modelIndex, result, step, variants }: { modelIndex: string, result: Simulation | null, step: number, variants: Found[] }) => {
    const { doc, library, swap } = useStore.getState()
    const instance = doc.instances[modelIndex]
    const part     = library.getPart(instance?.moduleIdRef ?? '')
    const variant  = part?.properties.variant ?? ''
    const ac       = variant.toLowerCase().includes('(ac)')
    const unit     = MODES.find(([, prefix]) => variant.startsWith(prefix))?.[2] ?? ''
    const reading  = result?.circuit.simulated.includes(modelIndex) ? result.getEffect(modelIndex, step).display?.[0] ?? '' : ''

    const choose = (prefix: string, coupling: boolean) => {
        const name   = prefix === 'Ohmmeter' ? 'Ohmmeter' : `${prefix} (${coupling ? 'AC' : 'DC'})`
        const target = variants.find(entry => entry.properties.variant === name)

        if (target && target.moduleId !== instance?.moduleIdRef)
            void swap(modelIndex, target.moduleId)
    }

    return (
        <div className="rounded-lg border border-neutral-300 bg-neutral-50 p-2">
            <div className="mb-1 flex items-center justify-between text-xs text-neutral-600"><span className="font-semibold">{instance?.title}</span><span>{variant}</span></div>
            <div className="flex items-baseline justify-end gap-2 rounded bg-[#c7d3b6] px-3 py-1 font-mono text-3xl text-neutral-900 shadow-inner" style={{ whiteSpace: 'pre' }}>{reading.trim() ? reading : '-----'}<span className="text-base">{unit}</span></div>
            <div className="mt-2 flex gap-1">
                {MODES.map(([label, prefix]) => <button key={label} className={`${BUTTON} ${variant.startsWith(prefix) ? 'bg-neutral-800 text-white hover:bg-neutral-700' : ''}`} onClick={() => choose(prefix, ac)}>{label}</button>)}
                <span className="flex-1" />
                {[false, true].map(coupling => <button key={String(coupling)} className={`${BUTTON} ${unit !== 'Ω' && ac === coupling ? 'bg-neutral-800 text-white hover:bg-neutral-700' : ''}`} disabled={unit === 'Ω'} onClick={() => choose(variant.startsWith('Ammeter') ? 'Ammeter' : 'Voltmeter', coupling)}>{coupling ? 'AC' : 'DC'}</button>)}
            </div>
        </div>
    )
}

export const SimulationPanel = () => {
    const simulation              = useStore(state => state.simulation)
    const doc                     = useStore(state => state.doc)
    const library                 = useStore(state => state.library)
    const catalog                 = useStore(state => state.catalog)
    const [variants, setVariants] = useState<Found[]>([])
    const { result, step }        = simulation
    const { play, pause, seek, setSimulation } = useStore.getState()

    useEffect(() => {
        let live = true
        catalog.family('Multimeter').then(found => live && setVariants(found))
        return () => {
            live = false
        }
    }, [catalog])

    useEffect(() => {
        if (!simulation.playing || result?.circuit.analysis.type !== 'tran')
            return

        const interval = result.circuit.analysis.interval
        let frame      = 0

        const tick = () => {
            const next = Math.min(result.steps - 1, Math.floor((performance.now() - simulation.started) / interval))
            setSimulation({ step: next, playing: next < result.steps - 1 })

            if (next < result.steps - 1)
                frame = requestAnimationFrame(tick)
        }

        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
    }, [simulation.playing, simulation.started, result, setSimulation])

    const options  = useMemo(() => result ? getOptions(result) : [], [result])
    const probes   = useMemo(() => result ? getProbes(result) : [], [result])
    const chosen   = [...new Set(simulation.series.length ? simulation.series : probes.length ? probes : options.slice(0, DEFAULTS).map(option => option.id))]
    const series   = chosen.flatMap((id, i) => options.filter(option => option.id === id).map(option => ({ ...option, color: PALETTE[i % PALETTE.length] })))
    const meters   = Object.values(doc.instances).filter(instance => (library.getPart(instance.moduleIdRef)?.properties.family ?? '').toLowerCase() === 'multimeter').map(instance => instance.modelIndex)
    const analysis = result?.circuit.analysis
    const toggle   = (id: string) => setSimulation({ series: chosen.includes(id) ? chosen.filter(other => other !== id) : [...chosen, id] })

    const restart = () => {
        seek(0)
        play()
    }

    const status   = simulation.busy                ? 'simulando…' :
                     simulation.error               ? `erro: ${simulation.error}` :
                     analysis?.type === 'tran'      ? `transitório de ${formatSi(analysis.t0, 's')} a ${formatSi(analysis.t1, 's')}, ${result?.steps} pontos` :
                     analysis                       ? 'ponto de operação (DC)' : 'aguardando o circuito'

    return (
        <section className="flex h-72 shrink-0 flex-col border-t border-neutral-300 bg-white">
            <header className="flex items-center gap-2 border-b border-neutral-200 px-3 py-1 text-xs">
                <span className="font-semibold text-emerald-700">Simulação</span>
                <span className={simulation.error ? 'text-red-600' : 'text-neutral-500'}>{status}</span>
                {analysis?.type === 'tran' && result && (
                    <div className="ml-auto flex items-center gap-2">
                        <button className={BUTTON} onClick={simulation.playing ? pause : play}>{simulation.playing ? '❚❚ Pausar' : '▶ Tocar'}</button>
                        <button className={BUTTON} onClick={restart}>⟲ Reiniciar</button>
                        <input type="range" min={0} max={result.steps - 1} value={step} onChange={event => seek(Number(event.target.value))} className="w-48" />
                        <span className="w-20 font-mono">t = {formatSi(result.getTime(step), 's', 3)}</span>
                    </div>
                )}
            </header>
            <div className="flex min-h-0 flex-1">
                <div className="flex w-80 shrink-0 flex-col gap-2 overflow-y-auto border-r border-neutral-200 p-2">
                    {meters.length ? meters.map(modelIndex => <Meter key={modelIndex} modelIndex={modelIndex} result={result} step={step} variants={variants} />) : <p className="text-xs text-neutral-500">Arraste um multímetro (bin Simulador ou busca "multimeter") e ligue as pontas para medir tensão, corrente ou resistência.</p>}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex flex-wrap gap-1 border-b border-neutral-200 px-2 py-1">
                        {options.map(option => <button key={option.id} className={`${BUTTON} ${chosen.includes(option.id) ? 'border-neutral-800 font-semibold' : 'text-neutral-500'}`} onClick={() => toggle(option.id)}>{option.label}</button>)}
                    </div>
                    {analysis?.type === 'tran' && result?.vectors.time ? <div className="min-h-0 flex-1 p-1"><Grapher time={result.vectors.time} series={series} step={step} /></div> : (
                        <table className="m-2 self-start text-xs">
                            <tbody>
                                {series.map(item => <tr key={item.id}><td className="pr-4 font-mono"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: item.color }} />{item.label}</td><td className="font-mono">{formatSi(item.values[0] ?? 0, item.unit, 4)}</td></tr>)}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </section>
    )
}
