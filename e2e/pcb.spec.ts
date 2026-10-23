import { test, expect, type App } from './Fixtures'

const TRACE      = 4
const AUTOROUTED = 32

const census = (app: App) => app.page.evaluate(([TRACE, AUTOROUTED]) => {
    const { doc, library, drc, netlist } = cm.store.getState()
    const instances = Object.values(doc.instances)
    const kindOf    = (moduleId: string) => library.getPart(moduleId)?.kind
    const traces    = instances.filter(instance => instance.moduleIdRef === 'WireModuleID' && ((instance.views.pcbView?.geometry.wireFlags ?? 0) & TRACE))
    return {
        boards: instances.filter(instance => ['board', 'resizableBoard'].includes(kindOf(instance.moduleIdRef) ?? '')).map(instance => instance.modelIndex),
        vias: instances.filter(instance => kindOf(instance.moduleIdRef) === 'via').map(instance => instance.modelIndex),
        fills: instances.filter(instance => kindOf(instance.moduleIdRef) === 'copperFill').map(instance => instance.modelIndex),
        traces: traces.map(instance => instance.modelIndex),
        bottom: traces.filter(instance => instance.views.pcbView?.layer === 'copper0trace').length,
        autorouted: traces.filter(instance => (instance.views.pcbView?.geometry.wireFlags ?? 0) & AUTOROUTED).length,
        left: netlist?.getStatus('pcbView').left ?? -1,
        drc: drc?.violations.length ?? null
    }
}, [TRACE, AUTOROUTED])

const build = async (app: App) => {
    await app.page.getByRole('tab', { name: 'Protoboard' }).click()
    const first  = await app.place('Resistor', [-300, -100])
    const second = await app.place('Resistor', [0, 100])
    const third  = await app.place('Capacitor', [200, -100])
    await app.wire((await app.pins(first))['Pin 1'], (await app.pins(second))['Pin 0'])
    await app.wire((await app.pins(second))['Pin 1'], (await app.pins(third))['0'])
    await app.page.getByRole('tab', { name: 'PCB' }).click()
    return [first, second, third]
}

test('PCB: criar placa e rotear, DRC, preenchimentos, faces e limpeza do autorouter', async ({ app, page }) => {
    const [first] = await build(app)
    const panel   = page.getByRole('complementary', { name: 'Inspetor' })

    await panel.getByRole('tab', { name: 'Roteamento' }).click()
    await panel.getByRole('button', { name: 'Criar placa e rotear' }).click()
    await expect.poll(async () => (await census(app)).left, { timeout: 60000 }).toBe(0)
    expect((await census(app)).boards).toHaveLength(1)
    expect((await census(app)).traces.length).toBeGreaterThan(0)
    await expect(panel.getByText('Concluído')).toBeVisible()

    await page.mouse.click(...await app.center(first))
    await expect.poll(() => app.selection()).toEqual([first])
    await panel.getByRole('tab', { name: 'Roteamento' }).click()

    await page.keyboard.press('Control+Shift+d')
    await expect.poll(async () => (await census(app)).drc).not.toBeNull()
    await panel.getByRole('button', { name: 'Verificar regras' }).click()
    await expect(panel.getByText('Violações')).toBeVisible()

    await app.menu('Roteamento', 'Preenchimento de cobre', 'Preencher com terra')
    await expect.poll(() => app.message()).toMatch(/^nenhum conector de terra/)

    const seed = () => page.evaluate(modelIndex => cm.store.getState().doc.instances[modelIndex]?.views.pcbView?.connectors.some(connector => connector.groundFillSeed) ?? false, first)
    await app.context(await app.terminal((await app.pins(first))['Pin 0']), 'Definir semente de preenchimento de terra')
    await expect.poll(seed).toBe(true)
    await app.menu('Roteamento', 'Preenchimento de cobre', 'Preencher com terra')
    await expect.poll(async () => (await census(app)).fills.length, { timeout: 60000 }).toBeGreaterThan(0)
    await app.menu('Roteamento', 'Selecionar todos os preenchimentos')
    await expect.poll(async () => (await app.selection()).length).toBe((await census(app)).fills.length)
    await app.menu('Roteamento', 'Preenchimento de cobre', 'Remover preenchimento')
    await expect.poll(async () => (await census(app)).fills.length).toBe(0)
    await panel.getByRole('button', { name: 'Preencher com cobre' }).click()
    await expect.poll(async () => (await census(app)).fills.length, { timeout: 60000 }).toBeGreaterThan(0)
    await panel.getByRole('button', { name: 'Remover', exact: true }).click()
    await expect.poll(async () => (await census(app)).fills.length).toBe(0)
    await app.menu('Roteamento', 'Preenchimento de cobre', 'Limpar sementes de terra')
    await expect.poll(seed).toBe(false)

    await app.menu('Roteamento', 'Selecionar todas as trilhas')
    const traces = (await census(app)).traces
    await expect.poll(async () => (await app.selection()).sort()).toEqual([...traces].sort())
    const bottom = (await census(app)).bottom
    await app.menu('Roteamento', 'Mover trilha para a outra face')
    await expect.poll(async () => (await census(app)).bottom).toBe(traces.length - bottom)
    await app.menu('Roteamento', 'Não rotear automaticamente')
    await expect.poll(async () => (await census(app)).autorouted).toBe(0)
    await app.menu('Roteamento', 'Não rotear automaticamente')
    await expect.poll(async () => (await census(app)).autorouted).toBe(traces.length)
    await app.menu('Roteamento', 'Selecionar trilhas autoroteáveis')
    await expect.poll(async () => (await app.selection()).length).toBe(traces.length)

    await app.menu('Roteamento', 'Apagar trilhas autoroteadas')
    await expect.poll(async () => (await census(app)).traces.length).toBe(0)
    expect((await census(app)).left).toBeGreaterThan(0)
    await page.keyboard.press('Control+Shift+a')
    await expect.poll(async () => (await census(app)).left, { timeout: 60000 }).toBe(0)

    for (const [label, side] of [['Topo', 'top'], ['Base', 'bottom'], ['Ambas', 'both']]) {
        await page.getByRole('tablist', { name: 'Face da placa' }).getByRole('tab', { name: label }).click()
        await expect.poll(() => page.evaluate(() => cm.store.getState().side)).toBe(side)
    }
})

test('PCB: dobra vira via e via vira dobra; trilha a partir do ratsnest', async ({ app, page }) => {
    const [first, second] = await build(app)
    await page.getByRole('complementary', { name: 'Inspetor' }).getByRole('tab', { name: 'Roteamento' }).click()
    await page.getByRole('button', { name: 'Criar placa e rotear' }).click()
    await expect.poll(async () => (await census(app)).left, { timeout: 60000 }).toBe(0)

    await app.menu('Roteamento', 'Apagar trilhas autoroteadas')
    const [a, b] = [await app.terminal((await app.pins(first))['Pin 1']), await app.terminal((await app.pins(second))['Pin 0'])]
    const left = (await census(app)).left
    await app.context([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 'Criar trilha a partir do ratsnest')
    await expect.poll(async () => (await census(app)).left).toBe(left - 1)

    const [trace] = (await census(app)).traces
    const pieces  = (await census(app)).traces.length
    const middle  = await app.along(trace, 0.5)
    await app.context(middle, 'Adicionar dobra')
    await expect.poll(async () => (await census(app)).traces.length).toBe(pieces + 1)
    await app.context(middle, 'Converter dobra em via')
    await expect.poll(async () => (await census(app)).vias.length).toBe(1)
    await app.context(await app.center((await census(app)).vias[0]), 'Converter via em dobra')
    await expect.poll(async () => (await census(app)).vias.length).toBe(0)
})

test('PCB: com duas placas as operações pedem a placa escolhida', async ({ app, page }) => {
    await build(app)
    await page.getByRole('complementary', { name: 'Inspetor' }).getByRole('tab', { name: 'Roteamento' }).click()
    await page.getByRole('button', { name: 'Criar placa e rotear' }).click()
    await expect.poll(async () => (await census(app)).left, { timeout: 60000 }).toBe(0)

    const [board] = (await census(app)).boards
    await page.evaluate(board => cm.store.getState().select([board]), board)
    await page.keyboard.press('Control+d')
    await expect.poll(async () => (await census(app)).boards.length).toBe(2)

    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+Shift+d')
    await expect.poll(() => app.message()).toMatch(/mais de uma placa/)
    await page.evaluate(board => cm.store.getState().select([board]), board)
    await page.keyboard.press('Control+Shift+d')
    await expect.poll(async () => (await census(app)).drc).not.toBeNull()
})

const rule = (app: App, label: string) => app.page.getByRole('complementary', { name: 'Inspetor' }).locator('.rule-row').filter({ hasText: label }).locator('input')

const setRule = async (app: App, label: string, value: string) => {
    await rule(app, label).fill(value)
    await rule(app, label).press('Enter')
}

test('PCB: regras gravadas valem no autorouter, trilha fixa fica, DRC automático acusa folga grande e a folga do cobre muda o preenchimento', async ({ app, page }) => {
    const [first] = await build(app)
    const panel   = page.getByRole('complementary', { name: 'Inspetor' })
    const mils    = () => page.evaluate(() => Object.values(cm.store.getState().doc.instances).filter(instance => instance.moduleIdRef === 'WireModuleID' && ((instance.views.pcbView?.geometry.wireFlags ?? 0) & 4)).map(instance => instance.views.pcbView?.wire?.mils))

    await app.menu('Roteamento', 'Regras do autorouter e DRC…')
    await expect(panel.getByRole('tab', { name: 'Roteamento' })).toHaveAttribute('aria-selected', 'true')
    await setRule(app, 'Largura da trilha', '48')
    await panel.getByRole('button', { name: 'Criar placa e rotear' }).click()
    await expect.poll(async () => (await census(app)).left, { timeout: 60000 }).toBe(0)
    expect(new Set(await mils())).toEqual(new Set([48]))

    const [kept] = (await census(app)).traces
    await page.evaluate(kept => cm.store.getState().select([kept]), kept)
    await app.menu('Roteamento', 'Não rotear automaticamente')
    await app.menu('Roteamento', 'Apagar trilhas autoroteadas')
    await page.keyboard.press('Control+Shift+a')
    await expect.poll(async () => (await census(app)).left, { timeout: 60000 }).toBe(0)
    expect((await census(app)).traces).toContain(kept)

    await setRule(app, 'Folga mínima', '0.3in')
    await expect.poll(async () => (await census(app)).drc ?? 0).toBeGreaterThan(0)
    await expect(page.locator('#canvas [data-drc]').first()).toBeVisible()
    await setRule(app, 'Folga mínima', '0.01in')
    await expect.poll(async () => (await census(app)).drc ?? -1).toBe(0)
    await setRule(app, 'Folga mínima', '0.3in')
    await panel.getByRole('button', { name: 'Verificar regras' }).click()
    await expect.poll(async () => (await census(app)).drc ?? 0).toBeGreaterThan(0)
    await panel.getByRole('button', { name: 'Ver problemas' }).click()
    await expect(page.getByRole('region', { name: 'Problemas' })).toContainText(/alerta/)
    await setRule(app, 'Folga mínima', '0.01in')

    const fill = () => page.evaluate(() => Object.values(cm.store.getState().doc.instances).filter(instance => instance.moduleIdRef === 'GroundPlaneModuleID').map(instance => instance.properties.svg).join(''))
    await panel.getByRole('button', { name: 'Preencher com cobre' }).click()
    await expect.poll(async () => (await fill()).length, { timeout: 60000 }).toBeGreaterThan(0)
    const narrow = await fill()
    await panel.getByRole('button', { name: 'Remover', exact: true }).click()
    await setRule(app, 'Folga do cobre', '0.05in')
    await panel.getByRole('button', { name: 'Preencher com cobre' }).click()
    await expect.poll(async () => (await fill()).length, { timeout: 60000 }).toBeGreaterThan(0)
    expect(await fill()).not.toBe(narrow)

    await app.context(await app.center(first), 'Ocultar serigrafia da peça')
    await expect.poll(async () => (await app.state(first))?.hidden ?? []).toContain('silkscreen')
    await app.context(await app.center(first), 'Mostrar serigrafia da peça')
    await expect.poll(async () => (await app.state(first))?.hidden ?? []).not.toContain('silkscreen')
})

test('Roteamento: vias e fios selecionados pelo menu; autorouter no esquemático', async ({ app, page }) => {
    await build(app)
    await page.getByRole('complementary', { name: 'Inspetor' }).getByRole('tab', { name: 'Roteamento' }).click()
    await page.getByRole('button', { name: 'Criar placa e rotear' }).click()
    await expect.poll(async () => (await census(app)).left, { timeout: 60000 }).toBe(0)

    const [trace] = (await census(app)).traces
    const middle  = await app.along(trace, 0.5)
    await app.context(middle, 'Adicionar dobra')
    await app.context(middle, 'Converter dobra em via')
    await expect.poll(async () => (await census(app)).vias.length).toBe(1)
    await page.keyboard.press('Escape')
    await app.menu('Roteamento', 'Selecionar todas as vias')
    await expect.poll(() => app.selection()).toEqual((await census(app)).vias)

    await page.getByRole('tab', { name: 'Protoboard' }).click()
    await app.menu('Roteamento', 'Selecionar todos os fios')
    const wires = await page.evaluate(() => Object.values(cm.store.getState().doc.instances).filter(instance => instance.moduleIdRef === 'WireModuleID' && !((instance.views.breadboardView?.geometry.wireFlags ?? 0) & (4 | 128))).map(instance => instance.modelIndex))
    await expect.poll(async () => (await app.selection()).sort()).toEqual(wires.sort())

    await page.getByRole('tab', { name: 'Esquemático' }).click()
    expect(await page.evaluate(() => cm.store.getState().netlist?.getStatus('schematicView').left)).toBeGreaterThan(0)
    await app.menu('Roteamento', 'Autorotear')
    await expect.poll(() => page.evaluate(() => cm.store.getState().netlist?.getStatus('schematicView').left), { timeout: 60000 }).toBe(0)
})

test('Camadas da PCB na legenda: um clique liga ou desliga; Exibir › Camadas mostra e oculta todas', async ({ app, page }) => {
    await build(app)
    await page.getByRole('complementary', { name: 'Inspetor' }).getByRole('tab', { name: 'Roteamento' }).click()
    await page.getByRole('button', { name: 'Criar placa e rotear' }).click()
    await expect.poll(async () => (await census(app)).left, { timeout: 60000 }).toBe(0)

    const legend = page.getByRole('group', { name: 'Camadas' })
    const drawn  = () => page.locator('#canvas [data-index]').count()
    const before = await drawn()
    await app.shoot('camadas')
    await legend.getByRole('button', { name: 'Cobre de cima' }).click()
    await expect(legend.getByRole('button', { name: 'Cobre de cima' })).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(drawn).toBeLessThan(before)
    await legend.getByRole('button', { name: 'Cobre de cima' }).click()
    await expect.poll(drawn).toBe(before)

    await app.menu('Exibir', 'Camadas', 'Ocultar todas as camadas')
    await expect.poll(() => page.evaluate(() => cm.store.getState().hiddenLayers.pcbView?.length)).toBe(9)
    await expect.poll(drawn).toBe(0)
    await app.menu('Exibir', 'Camadas', 'Mostrar todas as camadas')
    await expect.poll(drawn).toBe(before)
})
