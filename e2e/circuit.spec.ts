import { test, expect } from './Fixtures'

test('do esquemático vazio ao gráfico, salvar e reabrir', async ({ app, page }) => {
    await page.getByRole('tab', { name: 'Esquemático' }).click()

    const source    = await app.place('Fonte DC', [-420, 0])
    const resistor  = await app.place('Resistor', [-200, -120])
    const capacitor = await app.place('Capacitor', [0, 60])
    const ground    = await app.place('Terra', [-420, 200])
    const dc        = await app.pins(source)
    const r         = await app.pins(resistor)
    const c         = await app.pins(capacitor)

    await app.wire(dc['V+'], r['Pin 0'])
    await app.wire(r['Pin 1'], c['0'])
    await app.wire(c['1'], dc['V-'])
    await app.wire((await app.pins(ground)).GND, dc['V-'])

    const views = await page.evaluate(([a, b]) => {
        const { netlist } = cm.store.getState()
        return (['breadboardView', 'schematicView', 'pcbView'] as const).map(view => ({ joined: netlist?.getNet(view, a).includes(b), left: netlist?.getStatus(view).left }))
    }, [r['Pin 1'], c['0']])
    expect(views.map(view => view.joined)).toEqual([true, true, true])
    expect(views.map(view => view.left === 0)).toEqual([false, true, false])

    for (const view of ['Protoboard', 'PCB', 'Esquemático']) {
        await page.getByRole('tab', { name: view }).click()
        await expect(page.getByRole('tab', { name: view })).toHaveAttribute('aria-selected', 'true')
    }

    await page.getByRole('button', { name: 'Simular' }).click()
    await expect.poll(() => app.simulated()).toBe('op')

    await page.getByRole('tablist', { name: 'Tipo de análise' }).getByRole('tab', { name: 'Transitório' }).click()
    await expect.poll(() => app.simulated()).toBe('tran')
    await expect(page.getByRole('img', { name: 'Formas de onda da simulação no tempo' })).toBeVisible()

    const dock = page.getByRole('region', { name: 'Simulação' })
    await dock.getByRole('tab', { name: 'Ajustes' }).click()
    await dock.getByRole('button', { name: /^Degrau/ }).click()
    await expect.poll(() => app.simulated()).toBe('tran')
    await dock.getByRole('tab', { name: 'Resposta' }).click()
    await expect(dock.getByText('Constante τ (63%)')).toBeVisible()

    await dock.getByRole('tab', { name: 'Ajustes' }).click()
    await dock.getByRole('button', { name: /^Onda quadrada/ }).click()
    await expect.poll(() => app.simulated()).toBe('tran')
    await dock.getByRole('tab', { name: 'Medidas' }).click()

    const count = await app.count()
    const edges = await app.edges()
    const saved = await app.download(() => page.keyboard.press('Control+s'))
    expect(saved.name).toMatch(/\.fzz$/)
    await expect(page.getByText('Salvo', { exact: true })).toBeVisible()

    app.answers.push(true)
    await page.keyboard.press('Control+n')
    await expect.poll(() => app.count()).toBe(0)

    await app.upload(saved.path)
    await expect.poll(() => app.count()).toBe(count)
    expect(await app.edges()).toBe(edges)
})

test('Arquivo: Novo pergunta com alterações, Abrir pelo menu e por Ctrl+O, Salvar guarda as pontas de prova', async ({ app, page }) => {
    const resistor = await app.place('Resistor', [-300, 0])
    await page.getByRole('toolbar', { name: 'Ferramentas' }).getByRole('button', { name: 'Ponta de tensão: clique num fio ou terminal' }).click()
    await page.mouse.click(...await app.terminal((await app.pins(resistor))['Pin 0']))
    await expect.poll(() => page.evaluate(() => cm.store.getState().doc.probes.length)).toBe(1)
    await page.keyboard.press('Escape')

    const saved = await app.download(() => app.menu('Arquivo', 'Salvar'))
    await page.keyboard.press('Delete')

    app.answers.push(false)
    await app.menu('Arquivo', 'Novo')
    expect(await app.count()).toBe(1)
    app.answers.push(true)
    await app.menu('Arquivo', 'Novo')
    await expect.poll(() => app.count()).toBe(0)
    await expect(page.getByRole('heading', { name: 'sem título' })).toBeVisible()
    await expect(page.getByText('Novo', { exact: true })).toBeVisible()

    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), app.menu('Arquivo', 'Abrir…')])
    await chooser.setFiles(saved.path)
    await expect.poll(() => app.count()).toBe(1)
    expect(await page.evaluate(() => cm.store.getState().doc.probes.length)).toBe(1)
    await expect(page.getByText('Salvo', { exact: true })).toBeVisible()

    const [again] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Control+o')])
    await again.setFiles(saved.path)
    await expect.poll(() => app.message()).toMatch(/aberto$/)
})

test('Fio por cliques: Backspace desfaz a última dobra, Esc cancela e o botão direito deixa a ponta solta', async ({ app, page }) => {
    await page.getByRole('tab', { name: 'Esquemático' }).click()
    const resistor = await app.place('Resistor', [-300, 0])
    const start    = await app.terminal((await app.pins(resistor))['Pin 1'])
    const wiring   = () => page.locator('#canvas g[pointer-events="none"] polyline').first()
    const points   = async () => (await wiring().getAttribute('points')) ?? ''

    await page.mouse.click(...start)
    await page.mouse.move(start[0] + 120, start[1] + 10)
    await page.mouse.click(start[0] + 120, start[1] + 10)
    await page.mouse.move(start[0] + 240, start[1] + 140)
    const one = await points()
    await page.mouse.move(start[0] + 120, start[1] + 140)
    await page.mouse.click(start[0] + 120, start[1] + 140)
    await page.mouse.move(start[0] + 240, start[1] + 140)
    expect(await points()).not.toBe(one)
    await page.keyboard.press('Backspace')
    await expect.poll(points).toBe(one)

    await page.keyboard.press('Escape')
    await expect(wiring()).toHaveCount(0)
    expect((await app.wires()).length).toBe(0)

    await page.mouse.click(...start)
    await page.mouse.move(start[0] + 160, start[1] + 90)
    await page.mouse.click(start[0] + 160, start[1] + 90, { button: 'right' })
    await expect.poll(async () => (await app.wires()).length).toBeGreaterThan(0)
    await expect.poll(() => app.message()).toMatch(/ponta solta$/)

    await page.keyboard.press('Control+z')
    await page.mouse.click(...start)
    await page.keyboard.down('Alt')
    await page.mouse.move(start[0] + 100, start[1] + 70)
    await page.mouse.click(start[0] + 100, start[1] + 70, { button: 'right' })
    await page.keyboard.up('Alt')
    await expect.poll(async () => (await app.wires()).length).toBe(1)
    const [line] = await app.wires()
    const [, , dx, dy] = (await app.state(line))?.geometry.line ?? [0, 0, 0, 0]
    expect(Math.abs(dx) > 1 && Math.abs(dy) > 1).toBe(true)
})

test('Simular com fonte, resistor e LED: leituras no circuito, Problemas sem erro e Parar volta a Simular', async ({ app, page }) => {
    await page.getByRole('tab', { name: 'Esquemático' }).click()
    const source = await app.place('Fonte DC', [-450, 0])
    const r      = await app.place('Resistor', [-200, -150])
    const led    = await app.place('LED', [50, 0])
    const ground = await app.place('Terra', [-450, 220])
    const dc     = await app.pins(source)
    await app.wire(dc['V+'], (await app.pins(r))['Pin 0'])
    await app.wire((await app.pins(r))['Pin 1'], (await app.pins(led)).anode)
    await app.wire((await app.pins(led)).cathode, dc['V-'])
    await app.wire((await app.pins(ground)).GND, dc['V-'])

    await page.getByRole('button', { name: 'Simular' }).click()
    await expect.poll(() => app.simulated()).toBe('op')
    await page.mouse.click(...await app.center(r))
    await expect(page.getByRole('complementary', { name: 'Inspetor' }).locator('.kv').filter({ hasText: 'Corrente' }).first()).toContainText('A')
    await page.getByRole('navigation', { name: 'Painéis' }).getByRole('button', { name: 'Problemas' }).click()
    await expect(page.getByRole('region', { name: 'Problemas' })).not.toContainText(/simulação falhou|erro da simulação/i)
    await page.getByRole('button', { name: 'Parar' }).click()
    await expect(page.getByRole('button', { name: 'Simular' })).toBeVisible()
})
