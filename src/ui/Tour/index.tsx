import { useEffect, useLayoutEffect, useState } from 'react'
import type { Level } from '../Modes'
import { useStore } from '../Store'

type Step = [string, string, string]

const GAP   = 8      // PX ENTRE O ALVO E O CARTÃO
const EDGE  = 8      // PX DE FOLGA ATÉ A BORDA DA JANELA
const WIDTH = 320    // LARGURA DO CARTÃO

// PASSOS DE CADA MODO: ALVO NA TELA, TÍTULO E O QUE FAZER; OS DE MAKER E PROFISSIONAL SÓ MOSTRAM O QUE O MODO ACRESCENTA
const STEPS: Record<Level, Step[]> = {
    1: [
        ['.lp', 'Peças', 'Escolha uma peça e clique no quadro (ou arraste). Os básicos vêm primeiro; a busca entende português e inglês.'],
        ['.canvas', 'Fios', 'Clique num terminal, clique para cada dobra e clique no terminal de destino. O botão direito deixa a ponta solta.'],
        ['.viewtabs', 'Vistas', 'Protoboard, esquemático e PCB mostram o mesmo circuito: o que muda numa aparece nas outras.'],
        ['.topright', 'Simular', 'Um clique liga o simulador: os valores aparecem no circuito e o painel com o gráfico abre embaixo.'],
        ['.inspector', 'Inspetor', 'Valores da peça selecionada, como ela funciona e a medição ao vivo durante a simulação.'],
        ['.menubar', 'Achar qualquer ação', 'Ctrl+K abre a paleta de comandos: digite o que quer fazer, em português ou em inglês.']
    ],
    2: [
        ['.viewtabs', 'Placa', 'Na PCB, a legenda das camadas liga e desliga cada uma e o DRC marca os problemas no desenho.'],
        ['.inspector', 'Roteamento', 'Na aba Roteamento: criar a placa em volta das peças, rotear, regras e preenchimento de cobre.'],
        ['.menubar', 'Fabricar', 'Arquivo › Exportar › Para produção gera Gerber, furação, montagem, BOM e IPC num zip só.']
    ],
    3: [
        ['.menubar', 'Menus completos', 'Sementes de terra, trilhas fixas, netlists e IPC aparecem nos menus; Ctrl+K acha tudo de qualquer modo.'],
        ['.menubar', 'Preferências', 'Editar › Preferências (Ctrl+,): roda do mouse, fio curvo e a tecla de cada ação.']
    ]
}

const visible = (selector: string) => {
    const box = document.querySelector(selector)?.getBoundingClientRect()
    return box && box.width > 0 && box.height > 0 ? box : null
}

// TOUR CURTO DO MODO: UM PASSO POR VEZ PERTO DO ALVO, QUE GANHA A LINHA DE SELEÇÃO; PULAR OU TERMINAR MARCA O MODO COMO VISTO
export const Tour = () => {
    const tour   = useStore(state => state.tour)
    const dialog = useStore(state => state.dialog)
    const [index, setIndex] = useState(0)
    const [box, setBox]     = useState<DOMRect | null>(null)
    const steps  = tour ? STEPS[tour].filter(([selector]) => visible(selector)) : []
    const step   = steps[index]
    const finish = () => {
        setIndex(0)
        useStore.getState().finishTour()
    }

    useLayoutEffect(() => {
        const place = () => setBox(step ? visible(step[0]) : null)
        place()
        window.addEventListener('resize', place)
        return () => window.removeEventListener('resize', place)
    }, [step?.[0]])

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => event.key === 'Escape' && useStore.getState().tour && finish()
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    if (!tour || dialog || !step || !box)
        return null

    const below = box.bottom + GAP + 160 < innerHeight
    const left  = Math.max(EDGE, Math.min(box.left, innerWidth - WIDTH - EDGE))
    const top   = box.height > innerHeight / 2 ? box.top + box.height / 2 : below ? box.bottom + GAP : Math.max(EDGE, box.top - GAP - 160)

    return (
        <>
            <div className="tour-target" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} />
            <section className="card tour" role="dialog" aria-label={`Tour: ${step[1]}`} style={{ left, top, width: WIDTH }}>
                <p className="num muted">{index + 1} de {steps.length}</p>
                <h3>{step[1]}</h3>
                <p>{step[2]}</p>
                <div className="acts">
                    <button className="btn sm" onClick={finish}>Pular</button>
                    <button className="btn primary sm" autoFocus onClick={() => index + 1 < steps.length ? setIndex(index + 1) : finish()}>{index + 1 < steps.length ? 'Próximo' : 'Começar'}</button>
                </div>
            </section>
        </>
    )
}
