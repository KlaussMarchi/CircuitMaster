import { BENCHES } from '../src/engine/Bench'
import { test, expect, type App } from './Fixtures'

const effect = (app: App, modelIndex: string) => app.page.evaluate(modelIndex => {
    const { result, step } = cm.store.getState().simulation
    return result?.getEffect(modelIndex, step) ?? null
}, modelIndex)

const probes = (app: App) => app.page.evaluate(() => cm.store.getState().doc.probes.map(probe => probe.kind))

for (const bench of BENCHES)
    test(`Circuito de teste "${bench.title}" abre ligado, com pontas, e simula no transitório`, async ({ app, page }) => {
        await app.menu('Simulação', 'Circuitos de teste', bench.title)
        await expect.poll(() => app.simulated(), { timeout: 30000 }).toBe('tran')
        expect((await probes(app)).length).toBe(bench.probes.length)
        await expect(page.getByRole('img', { name: 'Formas de onda da simulação no tempo' })).toBeVisible()

        const dock = page.getByRole('region', { name: 'Simulação' })
        await expect(dock.getByLabel('Medidas').getByText(/Inicial → final|Ganho|Período/).first()).toBeVisible()
        await expect(dock.getByRole('tablist', { name: 'Teste' }).getByRole('tab', { selected: true })).toHaveCount(1)
    })

test('Pontas V, A e V·A, LED aceso no ponto de operação, multímetro, fumaça e parar', async ({ app, page }) => {
    await page.getByRole('tab', { name: 'Esquemático' }).click()
    const source = await app.place('Fonte DC', [-450, 0])
    const r      = await app.place('Resistor', [-200, -150])
    const led    = await app.place('LED', [50, 0])
    const ground = await app.place('Terra', [-450, 220])
    const meter  = await app.place('Multímetro', [300, 200])
    const pins   = { dc: await app.pins(source), r: await app.pins(r), led: await app.pins(led), meter: await app.pins(meter) }

    await app.wire(pins.dc['V+'], pins.r['Pin 0'])
    await app.wire(pins.r['Pin 1'], pins.led.anode)
    await app.wire(pins.led.cathode, pins.dc['V-'])
    await app.wire((await app.pins(ground)).GND, pins.dc['V-'])
    await app.wire(pins.meter['V Probe'], pins.r['Pin 1'])
    await app.wire(pins.meter['COM Probe'], pins.led.cathode)

    const tools = page.getByRole('toolbar', { name: 'Ferramentas' })
    await tools.getByRole('button', { name: 'Ponta de tensão: clique num fio ou terminal' }).click()
    await page.mouse.click(...await app.terminal(pins.r['Pin 1']))
    await tools.getByRole('button', { name: 'Ponta de corrente: clique num fio ou terminal' }).click()
    await page.mouse.click(...await app.terminal(pins.r['Pin 0']))
    await tools.getByRole('button', { name: 'Ponta de tensão e corrente' }).click()
    await page.mouse.click(...await app.terminal(pins.led.anode))
    await expect.poll(() => probes(app)).toEqual(['voltage', 'current', 'both'])

    await app.menu('Simulação', 'Simular')
    await expect.poll(() => app.simulated()).toBe('op')
    await expect.poll(async () => (await effect(app, led))?.light ?? 0).toBeGreaterThan(0)
    await expect.poll(async () => (await effect(app, meter))?.display?.join('') ?? '').toMatch(/\d/)
    expect((await effect(app, r))?.smoke).toBe(false)

    const [probe] = await page.evaluate(() => cm.store.getState().doc.probes.map(probe => probe.id))
    await page.evaluate(id => cm.store.getState().selectProbe(id), probe)
    const panel = page.getByRole('complementary', { name: 'Inspetor' })
    await expect(panel.locator('.kv').filter({ hasText: 'Tensão' }).first()).not.toContainText('aperte Simular')

    await page.mouse.click(...await app.center(r))
    const ohms = panel.locator('.field').filter({ hasText: 'Resistência' }).locator('input')
    await ohms.fill('1Ω')
    await ohms.press('Enter')
    await expect.poll(async () => (await effect(app, r))?.smoke, { timeout: 30000 }).toBe(true)

    await page.getByRole('button', { name: 'Parar' }).click()
    await expect(page.getByRole('button', { name: 'Simular' })).toBeVisible()
    expect(await app.simulated()).toBe('nada')

    await app.menu('Simulação', 'Remover todas as pontas de prova')
    await expect.poll(async () => (await probes(app)).length).toBe(0)
})

test('Transitório: reproduzir, pausar, instante, janela e teste gravados no .fzz', async ({ app, page }) => {
    await app.menu('Simulação', 'Circuitos de teste', 'Carga e descarga (onda quadrada)')
    await expect.poll(() => app.simulated(), { timeout: 30000 }).toBe('tran')
    const dock = page.getByRole('region', { name: 'Simulação' })
    const step = () => page.evaluate(() => cm.store.getState().simulation.step)

    await dock.getByRole('button', { name: 'Pausar' }).or(dock.getByRole('button', { name: 'Reproduzir' })).click()
    await dock.getByRole('slider', { name: 'Instante da simulação' }).fill('0')
    await expect.poll(step).toBe(0)
    await dock.getByRole('button', { name: 'Reproduzir' }).click()
    await expect.poll(step).toBeGreaterThan(0)
    await dock.getByRole('button', { name: 'Pausar' }).click()

    await dock.getByRole('tablist', { name: 'Teste' }).getByRole('tab', { name: 'Senoide' }).click()
    await expect.poll(() => page.evaluate(() => Object.values(cm.store.getState().doc.projectProperties).join(' '))).toContain('sine')
    await expect.poll(() => app.simulated()).toBe('tran')
    const end = dock.getByRole('textbox', { name: 'Fim da janela' })
    await end.fill('5')
    await dock.getByRole('combobox', { name: 'Unidade de fim da janela' }).selectOption('ms')
    await end.press('Enter')
    await expect.poll(() => app.simulated()).toBe('tran')
    await expect.poll(() => page.evaluate(() => {
        const analysis = cm.store.getState().simulation.result?.circuit.analysis
        return analysis?.type === 'tran' ? analysis.t1 : null
    })).toBeCloseTo(0.005)

    const saved = await app.download(() => app.menu('Arquivo', 'Salvar'))
    app.answers.push(true)
    await app.menu('Arquivo', 'Novo')
    await app.upload(saved.path)
    await expect.poll(() => page.evaluate(() => Object.values(cm.store.getState().doc.projectProperties).join(' '))).toContain('custom')
})

test('Chave: selo abre e fecha; comutação no tempo programada no inspetor', async ({ app, page }) => {
    await page.getByRole('tab', { name: 'Esquemático' }).click()
    const toggle  = await app.place('Chave', [-420, 0])
    const module  = () => page.evaluate(modelIndex => cm.store.getState().doc.instances[modelIndex]?.moduleIdRef, toggle)
    const before  = await module()

    await page.locator(`[data-switch="${toggle}"]`).click()
    await expect.poll(module).not.toBe(before)
    await page.locator(`[data-switch="${toggle}"]`).click()
    await expect.poll(module).toBe(before)

    await page.mouse.click(...await app.center(toggle))
    const panel = page.getByRole('complementary', { name: 'Inspetor' })
    await panel.getByRole('button', { name: 'Programar comutação' }).click()
    await expect(panel.getByRole('button', { name: 'Remover comutação' })).toHaveCount(1)
    await panel.getByRole('button', { name: 'Adicionar comutação' }).click()
    await expect(panel.getByRole('button', { name: 'Remover comutação' })).toHaveCount(2)
    await panel.getByRole('button', { name: 'Remover comutação' }).first().click()
    await expect(panel.getByRole('button', { name: 'Remover comutação' })).toHaveCount(1)
})

test('Osciloscópio ligado ao circuito mostra o traço no transitório', async ({ app, page }) => {
    await app.menu('Simulação', 'Circuitos de teste', 'Carga e descarga (onda quadrada)')
    await expect.poll(() => app.simulated(), { timeout: 30000 }).toBe('tran')
    const [node, ground] = await page.evaluate(() => {
        const { doc } = cm.store.getState()
        return [doc.probes[0]?.key ?? '', `${Object.values(doc.instances).find(instance => instance.moduleIdRef === 'GroundModuleID')?.modelIndex}/connector0`]
    })
    await page.evaluate(() => cm.store.getState().setZoom(0.5))
    const scope = await app.place('Osciloscópio', [500, 0])
    const pins  = await app.pins(scope)
    await page.keyboard.press('Control+0')
    await app.paint()
    await app.wire(pins['V1 Probe'], node)
    await app.wire(pins['COM Probe'], ground)
    await expect.poll(async () => Object.values((await effect(app, scope))?.scope ?? {}).flat().length, { timeout: 30000 }).toBeGreaterThan(0)
})

test('Painel único: abre sozinho ao simular, curvas com busca e caixa, medidas da curva escolhida, teste e opções no cabeçalho', async ({ app, page }) => {
    const dock     = page.getByRole('region', { name: 'Simulação' })
    const curves   = dock.getByLabel('Curvas')
    const readings = dock.getByLabel('Medidas')
    await page.evaluate(() => cm.store.getState().setShow({ chart: false }))
    await expect(dock.getByRole('button', { name: 'Abrir simulação' })).toHaveAttribute('aria-expanded', 'false')

    await app.menu('Simulação', 'Circuitos de teste', 'RLC série com sobressinal')
    await expect.poll(() => app.simulated(), { timeout: 30000 }).toBe('tran')
    await expect(dock.getByRole('button', { name: 'Recolher simulação' })).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('img', { name: 'Formas de onda da simulação no tempo' })).toBeVisible()
    await expect(readings).toContainText('Sobressinal')
    await app.shoot('painel-simulacao')

    const boxes = curves.getByRole('checkbox')
    const total = await boxes.count()
    expect(total).toBeGreaterThan(1)
    await curves.getByRole('searchbox', { name: 'Buscar curva' }).fill('P1')
    await expect(boxes).toHaveCount(await curves.locator('.curve').filter({ hasText: 'P1' }).count())
    await curves.getByRole('searchbox', { name: 'Buscar curva' }).fill('')
    await expect(boxes).toHaveCount(total)

    const label = await curves.locator('.curve').nth(1).textContent() ?? ''
    await curves.locator('.curve').nth(1).click()
    await expect(readings.getByRole('heading')).toHaveText(label)
    const shown = () => page.evaluate(() => cm.store.getState().simulation.series.length)
    await boxes.nth(1).click()
    const before = await shown()
    await boxes.nth(1).click()
    await expect.poll(shown).not.toBe(before)

    await dock.getByRole('tablist', { name: 'Teste' }).getByRole('tab', { name: 'Manual' }).click()
    await expect(dock.getByRole('textbox', { name: 'Início da janela' })).toBeVisible()
    await dock.getByRole('button', { name: 'Mais opções da simulação' }).click()
    await expect(dock.getByRole('dialog', { name: 'Opções da simulação' })).toContainText('Amostragem do teste manual')
    await page.keyboard.press('Escape')
    await expect(dock.getByRole('dialog', { name: 'Opções da simulação' })).toHaveCount(0)
})
