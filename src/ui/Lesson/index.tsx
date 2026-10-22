import { parseSi } from '../../core/Properties'
import { getLesson } from '../../core/Lesson'
import type { Part } from '../../core/Part'
import { useStore } from '../Store'
import { t } from '../../core/Text'

// CARTÃO DIDÁTICO DA PEÇA: O QUE É, COMO FUNCIONA, A FÓRMULA E A FÓRMULA COM OS VALORES DO CIRCUITO ABERTO; ABERTO NO MODO INICIANTE
export const LessonCard = ({ modelIndex, part, properties }: { modelIndex: string, part: Part, properties: Record<string, string> }) => {
    const level      = useStore(state => state.level)
    const simulation = useStore(state => state.simulation)
    const result     = simulation.enabled ? simulation.result : null
    const reading    = result?.getReading(modelIndex, Math.min(simulation.step, result.steps - 1))
    const lesson     = getLesson(part)
    const get        = (key: string, symbol: string) => properties[key] ? parseSi(properties[key], symbol) : null
    const lines      = lesson.live({ V: reading?.voltage ?? null, I: reading?.current ?? null, get }).filter(line => line !== false)

    return (
        <details className="sec lesson" open={level === 1}>
            <summary><h3>{t('Como funciona')}</h3></summary>
            <p>{t(lesson.what)}</p>
            <p>{t(lesson.how)}</p>
            {lesson.formula && <p className="num formula">{t(lesson.formula)}</p>}
            {lines.map(line => <p key={line} className="num formula live">{line}</p>)}
        </details>
    )
}
