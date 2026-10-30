import { useEffect, useRef, useState, type KeyboardEvent, type WheelEvent } from 'react'
import { formatSi, getPropertyDefs, parseSi, parseValue, type PropertyDef } from '../../core/Properties'
import type { Point } from '../../core/Geometry'
import { setProperty } from '../../engine/Edit'
import { Icon } from '../Icon'
import { nameOf } from '../../core/Properties'
import { useStore } from '../Store'
import { t } from '../../core/Text'

const MAIN    = ['resistance', 'capacitance', 'inductance', 'amplitude', 'pulsed voltage', 'voltage', 'maximum resistance']
const PAIRED: Record<string, string> = { amplitude: 'frequency', 'pulsed voltage': 'period' }    // FONTE ALTERNADA E PULSADA MOSTRAM TAMBÉM O TEMPO
const PREFIX: Record<string, string[]> = { 'Ω': ['', 'k', 'M'], F: ['p', 'n', 'µ', 'm'], H: ['µ', 'm', ''], V: ['m', ''], Hz: ['', 'k', 'M'], s: ['µ', 'm', ''] }
const FACTOR: Record<string, number> = { p: 1e-12, n: 1e-9, 'µ': 1e-6, m: 1e-3, '': 1, k: 1e3, M: 1e6 }
const HERTZ: Record<string, number> = { Hz: 1, kHz: 1e3 }    // NO PERÍODO A UNIDADE PODE SER FREQUÊNCIA: O NÚMERO VIRA 1/f
const E12     = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2]
const SERIES: Record<string, number[]> = { 'Ω': E12, F: E12, H: E12, V: [1, 1.2, 1.5, 1.8, 2, 2.5, 3, 3.3, 3.6, 4, 4.5, 5, 6, 7.5, 9], Hz: [1, 2, 5], s: [1, 2, 5] }

// CAMPOS PRINCIPAIS DA PEÇA: O VALOR QUE DEFINE O COMPONENTE (R, C, L OU A TENSÃO DA FONTE) E, NA FONTE ALTERNADA OU PULSADA, O TEMPO DELA
export const getMainDefs = (moduleId: string, names: string[]) => {
    const defs  = getPropertyDefs(moduleId).filter(def => def.numeric && def.editable && PREFIX[def.symbol] && names.includes(def.name))
    const first = MAIN.map(name => defs.find(def => def.name === name)).find(def => def !== undefined)
    const pair  = first && PAIRED[first.name] ? defs.find(def => def.name === PAIRED[first.name]) : undefined
    return [first, pair].filter((def): def is PropertyDef => def !== undefined)
}

// PRÓXIMO VALOR DA SÉRIE ACIMA OU ABAIXO DO ATUAL, NAS DÉCADAS VIZINHAS
const stepOf = (value: number, symbol: string, direction: number) => {
    const decade = Math.floor(Math.log10(value) + 1e-9)
    const values = [-1, 0, 1].flatMap(shift => SERIES[symbol].map(base => +(base * 10 ** (decade + shift)).toPrecision(4)))
    return direction > 0 ? values.find(item => item > value * (1 + 1e-9)) : values.reverse().find(item => item < value * (1 - 1e-9))
}

const shown    = (value: number, unit: string) => String(+(HERTZ[unit] ? 1 / (value * HERTZ[unit]) : value / FACTOR[unit]).toPrecision(4))

const prefixOf = (value: number, symbol: string) => [...PREFIX[symbol]].reverse().find(prefix => Math.abs(value) >= FACTOR[prefix] * (1 - 1e-9)) ?? PREFIX[symbol][0]

const Field = ({ modelIndex, def, value, focus }: { modelIndex: string, def: PropertyDef, value: string, focus: number }) => {
    const number          = parseSi(value, def.symbol)
    const input           = useRef<HTMLInputElement>(null)
    const [unit, setUnit] = useState(number ? prefixOf(number, def.symbol) : PREFIX[def.symbol][0])
    const [text, setText] = useState('')

    useEffect(() => {
        const prefix = HERTZ[unit] || !number ? unit : prefixOf(number, def.symbol)
        setUnit(prefix)
        setText(number === null ? '' : shown(number, prefix))
    }, [number])

    useEffect(() => {
        if (focus)
            input.current?.select()
    }, [focus])

    const commit = (next: number | null | undefined) => {
        if (next === null || next === undefined || !Number.isFinite(next) || (def.min !== null && next < def.min) || (def.max !== null && next > def.max))
            return useStore.setState({ message: t('{0}: use um valor entre {1} e {2}', nameOf(def.name), formatSi(def.min ?? 0, def.symbol), formatSi(def.max ?? Infinity, def.symbol)) })

        if (next !== number)
            useStore.getState().edit(doc => setProperty(doc, modelIndex, def.name, formatSi(next, def.symbol)))
    }

    const units  = [...PREFIX[def.symbol].map(prefix => [prefix, `${prefix}${def.symbol}`]), ...(def.name === 'period' ? Object.keys(HERTZ).map(name => [name, name]) : [])]
    const typed  = (raw: string, prefix: string) => !raw.trim() ? null : parseValue(def.name, raw, def.symbol) !== null && /[a-zA-Zµ]/.test(raw) ? parseValue(def.name, raw, def.symbol) : HERTZ[prefix] ? 1 / (Number(raw.replace(',', '.')) * HERTZ[prefix]) : Number(raw.replace(',', '.')) * FACTOR[prefix]
    const step   = (direction: number) => commit(stepOf(number || (FACTOR[unit] ?? 1), def.symbol, direction))
    // ENTRE TEMPO E FREQUÊNCIA SÓ CONVERTE O QUE APARECE; DENTRO DA MESMA GRANDEZA MANTÉM O NÚMERO E GRAVA
    const onUnit = (next: string) => {
        setUnit(next)

        if (!HERTZ[next] !== !HERTZ[unit])
            return number !== null && setText(shown(number, next))

        commit(typed(text, next))
    }
    const onWheel = (event: WheelEvent<HTMLInputElement>) => step(event.deltaY < 0 ? 1 : -1)

    const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter')
            event.currentTarget.blur()

        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            step(event.key === 'ArrowUp' ? 1 : -1)
        }

        if (event.key === 'Escape')
            setText(number === null ? '' : shown(number, unit))
    }

    return (
        <label className="qf">
            <span>{nameOf(def.name)}</span>
            <span className="qrow">
                <button className="icon-btn" aria-label={t('Diminuir {0}', nameOf(def.name).toLowerCase())} title={t('Valor anterior da série (↓ ou roda)')} onClick={() => step(-1)}><Icon name="chevronLeft" /></button>
                <span className="in time">
                    <input ref={input} inputMode="decimal" value={text} aria-label={nameOf(def.name)} onChange={event => setText(event.target.value)} onBlur={() => text.trim() && commit(typed(text, unit))} onKeyDown={onKey} onWheel={onWheel} />
                    <select aria-label={t('Unidade')} value={unit} onChange={event => onUnit(event.target.value)}>{units.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select>
                </span>
                <button className="icon-btn" aria-label={t('Aumentar {0}', nameOf(def.name).toLowerCase())} title={t('Próximo valor da série (↑ ou roda)')} onClick={() => step(1)}><Icon name="chevronRight" /></button>
            </span>
        </label>
    )
}

// EDITOR RÁPIDO SOBRE A PEÇA SELECIONADA: O VALOR PRINCIPAL COM A UNIDADE E ‹ › PELA SÉRIE DE VALORES COMERCIAIS; A RODA E AS SETAS TAMBÉM ANDAM NA SÉRIE
export const QuickValue = ({ modelIndex, at, focus }: { modelIndex: string, at: Point, focus: number }) => {
    const instance = useStore(state => state.doc.instances[modelIndex])
    const library  = useStore(state => state.library)
    const part     = library.getPart(instance?.moduleIdRef ?? '')
    const defs     = part ? getMainDefs(part.moduleId, Object.keys(part.properties)) : []

    if (!instance || !part || !defs.length)
        return null

    return (
        <div className="quick" style={{ left: at[0], top: at[1] }} onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
            <b>{instance.title}</b>
            {defs.map((def, i) => <Field key={def.name} modelIndex={modelIndex} def={def} value={instance.properties[def.name] ?? part.properties[def.name] ?? ''} focus={i === 0 ? focus : 0} />)}
        </div>
    )
}
