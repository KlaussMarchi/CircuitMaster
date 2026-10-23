import fs from 'node:fs'
import { test, expect, type App } from './Fixtures'

const SOAK_MS  = 30 * 60000    // MEIA HORA, COMO PEDE A SEÇÃO 6 DO PLANO
const SAMPLE   = 5             // VOLTAS ENTRE DUAS MEDIDAS DE MEMÓRIA
const GROWTH   = 30            // MB QUE O HEAP PODE CRESCER ENTRE A PRIMEIRA E A ÚLTIMA MEDIDA, DEPOIS DO GC
const REPORT   = 'build/soak-report.txt'
const MB       = 1024 * 1024

const heap = async (app: App) => {
    const client = await app.page.context().newCDPSession(app.page)
    await client.send('Performance.enable')
    await client.send('HeapProfiler.collectGarbage')
    const { metrics } = await client.send('Performance.getMetrics')
    await client.detach()
    return (metrics.find(metric => metric.name === 'JSHeapUsedSize')?.value ?? 0) / MB
}

// UMA VOLTA DE TRABALHO DE VERDADE: FECHAR AS ABAS DA VOLTA ANTERIOR, COLOCAR, LIGAR, GIRAR, MOVER, DESFAZER, TROCAR DE VISTA, SIMULAR E ABRIR UM EXEMPLO
const round = async (app: App) => {
    const page = app.page
    await page.evaluate(() => {
        const confirm  = window.confirm
        window.confirm = () => true    // AS ABAS DA VOLTA ANTERIOR FECHAM SEM PERGUNTAR: O QUE SE MEDE É SE A MEMÓRIA DELAS VOLTA
        const { sheets, sheet } = cm.store.getState()
        sheets.filter(item => item.id !== sheet).forEach(item => cm.store.getState().closeSheet(item.id))
        window.confirm = confirm
    })
    await page.evaluate(() => cm.store.getState().newSketch())
    await page.getByRole('tab', { name: 'Esquemático' }).click()
    const source = await app.place('Fonte DC', [-450, 0])
    const r      = await app.place('Resistor', [-200, -150])
    const led    = await app.place('LED', [50, 0])
    await app.wire((await app.pins(source))['V+'], (await app.pins(r))['Pin 0'])
    await app.wire((await app.pins(r))['Pin 1'], (await app.pins(led)).anode)
    await page.mouse.click(...await app.center(r))
    await page.keyboard.press(']')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+Shift+z')

    for (const tab of ['Protoboard', 'PCB', 'Esquemático'])
        await page.getByRole('tab', { name: tab }).click()

    await page.evaluate(() => cm.store.getState().openBench('rc'))
    await expect.poll(() => app.simulated()).toBe('tran')
    await page.evaluate(() => cm.store.getState().setSimulation({ enabled: false, result: null, error: null, playing: false, step: 0 }))
    await page.evaluate(() => cm.store.getState().openSample('core/Button.fzz'))
    await expect.poll(() => app.message()).toBe('Button.fzz aberto')
}

test('Meia hora de edição automatizada sem a memória crescer', async ({ app }) => {
    const started = Date.now()
    const sizes: [number, number][] = []
    let rounds = 0

    while (Date.now() - started < SOAK_MS) {
        await round(app)
        rounds += 1

        if (rounds % SAMPLE === 1)
            sizes.push([rounds, await heap(app)])
    }

    sizes.push([rounds, await heap(app)])
    const steady = sizes[1] ?? sizes[0]
    const last   = sizes[sizes.length - 1]
    fs.writeFileSync(REPORT, [`${rounds} voltas em ${((Date.now() - started) / 60000).toFixed(1)} min`, ...sizes.map(([at, mb]) => `volta ${String(at).padStart(4)}: ${mb.toFixed(1)} MB`), `crescimento: ${(last[1] - steady[1]).toFixed(1)} MB (limite ${GROWTH} MB)`, ''].join('\n'))
    expect(last[1] - steady[1], REPORT).toBeLessThan(GROWTH)
})
