import { test, expect } from './Fixtures'

// O ACERVO DO KICAD SERVIDO COMO DADOS EM /kicad, COMO O DO FRITZING (SPEC 07 §1)
test('Acervo do KiCad em /kicad: listagens, um símbolo, um footprint e um demo, sem sair das raízes', async ({ page }) => {
    const json = async (name: string) => (await page.request.get(`/kicad/${name}`)).json() as Promise<string[]>
    const symbols    = await json('symbols.json')
    const footprints = await json('footprints.json')
    const demos      = await json('demos.json')

    expect(symbols.length).toBeGreaterThan(20000)
    expect(footprints.length).toBeGreaterThan(15000)
    expect(demos.some(file => file.endsWith('.kicad_pcb'))).toBe(true)
    expect(await (await page.request.get(`/kicad/symbols/${symbols.find(file => file.endsWith('Device.kicad_symdir/R.kicad_sym'))}`)).text()).toMatch(/^\(kicad_symbol_lib/)
    expect(await (await page.request.get(`/kicad/footprints/${footprints[0]}`)).text()).toMatch(/^\(footprint/)
    expect(await (await page.request.get('/kicad/demos/%2E%2E/LICENSE.GPLv3')).text()).not.toContain('GNU GENERAL PUBLIC LICENSE')
})

// UMA BUSCA SÓ: O SÍMBOLO DAS BIBLIOTECAS SAI NA MESMA LISTA DAS OUTRAS PEÇAS, SEM RÓTULO DE ORIGEM, E VIRA PEÇA DE TRÊS VISTAS (SPEC 08 §4–§5)
test('Busca: um símbolo das bibliotecas sai na mesma lista, sem rótulo de origem, entra no esquemático e tem protoboard e PCB pelo footprint', async ({ app, page }) => {
    const parts  = page.getByRole('region', { name: 'Peças' })
    await parts.getByRole('searchbox', { name: 'Buscar peça' }).fill('NE555P')
    const result = parts.getByRole('button', { name: /NE555P/ }).first()
    await expect(result).toBeVisible({ timeout: 30000 })
    await expect(result).toContainText('Timer')
    await expect(parts).not.toContainText(/kicad|fritzing/i)
    await app.shoot('busca-unica')

    const before = await app.count()
    const center = await app.canvasCenter()
    await result.click()
    await page.mouse.click(center[0], center[1])
    await expect.poll(() => app.count()).toBeGreaterThan(before)

    const placed = await page.evaluate(() => {
        const { doc, selection, library } = cm.store.getState()
        const moduleId = doc.instances[selection[0]]?.moduleIdRef ?? ''
        return { moduleId, pins: (['breadboardView', 'schematicView', 'pcbView'] as const).map(view => library.getPins(moduleId, view, view === 'pcbView' ? 'copper0' : view === 'schematicView' ? 'schematic' : 'breadboard').size) }
    })
    expect(placed).toEqual({ moduleId: 'cm:Timer:NE555P', pins: [8, 8, 8] })

    for (const view of ['Protoboard', 'PCB']) {
        await page.getByRole('tab', { name: view }).click()
        await app.paint()
        await app.shoot(`kicad-${view.toLowerCase()}`)
    }

    const saved = await app.download(() => page.keyboard.press('Control+s'))
    expect(saved.bytes.includes('part.cm_Timer_NE555P.fzp')).toBe(true)
})

// TROCA DE FOOTPRINT NO INSPETOR: OS QUE CASAM COM OS FILTROS DO SÍMBOLO; A PEÇA TROCA E OS FIOS FICAM (KP-146, SPEC 08 §4)
test('Footprint da peça do KiCad: o inspetor oferece os que casam com o símbolo e trocar mantém os fios', async ({ app, page }) => {
    await page.evaluate(async () => {
        const { addPart } = cm.store.getState()
        await addPart('cm:Device:R', [0, 0])
        await addPart('cm:Device:R', [200, 0])
        await cm.store.getState().connect('1/connector1', '2/connector0')
        cm.store.getState().select(['1'])
    })
    const panel = page.getByRole('complementary', { name: 'Inspetor' })
    const field = panel.locator('.field').filter({ hasText: 'Footprint' }).locator('input')
    await expect(field).toHaveValue('Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal')
    await expect.poll(() => field.evaluate(input => (input as HTMLInputElement).list?.options.length ?? 0)).toBeGreaterThan(50)

    await field.fill('Resistor_SMD:R_0805_2012Metric')
    await field.press('Enter')
    await expect.poll(() => page.evaluate(() => cm.store.getState().doc.instances['1']?.moduleIdRef)).toBe('cm:Device:R@Resistor_SMD:R_0805_2012Metric')
    expect(await page.evaluate(() => cm.store.getState().netlist?.getNet('pcbView', '1/connector1'))).toContain('2/connector0')
    await expect(panel.getByText('R_0805_2012Metric').first()).toBeVisible()
    expect(await page.evaluate(() => cm.store.getState().library.getPins('cm:Device:R@Resistor_SMD:R_0805_2012Metric', 'breadboardView', 'breadboard').size)).toBe(2)
    await page.getByRole('tab', { name: 'Protoboard' }).click()
    await page.keyboard.press('Control+0')
    await app.paint()
    await app.shoot('placa-adaptadora')
    await page.getByRole('tab', { name: 'Esquemático' }).click()

    await field.fill('Nada:Inexistente')
    await field.press('Enter')
    await expect.poll(() => app.message()).toMatch(/footprint não encontrado/)
})

// CATÁLOGO PRÓPRIO: TODAS AS PEÇAS EM CATEGORIAS E FAMÍLIAS, A MESMA FAMÍLIA JUNTA AS DUAS ORIGENS (SPEC 08 §6)
test('Catálogo: todas as peças em categorias e famílias próprias; o 555 do acervo e o NE555P das bibliotecas na mesma família', async ({ app, page }) => {
    const parts = page.getByRole('region', { name: 'Peças' })
    await parts.getByRole('tab', { name: 'Catálogo' }).click()
    await expect(parts.getByText(/^\d+ peças$/)).toHaveText(/^2\d{4} peças$/, { timeout: 30000 })
    await parts.getByRole('button', { name: /^CIs \d/ }).click()
    await parts.getByRole('button', { name: /^Timer \d/ }).click()
    await expect(parts.getByRole('button', { name: /555 Timer/ }).first()).toBeVisible()
    await expect(parts.getByRole('button', { name: /NE555P/ }).first()).toBeVisible()
    await expect(parts).not.toContainText(/kicad|fritzing/i)
    await app.shoot('catalogo')

    const before = await app.count()
    const center = await app.canvasCenter()
    await parts.getByRole('button', { name: /NE555P/ }).first().click()
    await page.mouse.click(center[0], center[1])
    await expect.poll(() => app.count()).toBeGreaterThan(before)
})

// ABRIR UM .kicad_sym OU UM .kicad_mod: AS PEÇAS ENTRAM EM MEUS ITENS, COMO O .fzpz (KS-205, KP-292, SPEC 08 §4)
test('Abrir símbolo e footprint do KiCad: as peças entram em Meus itens e vão para o quadro com as três vistas', async ({ app, page }) => {
    const parts = page.getByRole('region', { name: 'Peças' })
    const files = [['Timer.kicad_sym', '/kicad/symbols/Timer.kicad_symdir/NE555D.kicad_sym'], ['DIP-8_W7.62mm.kicad_mod', '/kicad/footprints/Package_DIP.pretty/DIP-8_W7.62mm.kicad_mod']]

    for (const [name, url] of files) {
        const buffer = await (await page.request.get(url)).body()
        await page.locator('#open-file').setInputFiles({ name, mimeType: 'text/plain', buffer })
        await expect.poll(() => app.message()).toBe(`1 peças de ${name} em Meus itens`)
    }

    await parts.getByRole('tab', { name: 'Meus itens' }).click()
    await expect(parts.getByRole('button', { name: /^NE555D/ })).toHaveCount(1)
    const footprint = parts.getByRole('button', { name: /^DIP-8_W7\.62mm/ })
    await expect(footprint).toHaveCount(1)

    const before = await app.count()
    const center = await app.canvasCenter()
    await footprint.click()
    await page.mouse.click(center[0], center[1])
    await expect.poll(() => app.count()).toBeGreaterThan(before)
    const pins = await page.evaluate(() => {
        const { doc, selection, library } = cm.store.getState()
        const moduleId = doc.instances[selection[0]]?.moduleIdRef ?? ''
        return (['breadboardView', 'schematicView', 'pcbView'] as const).map(view => library.getPins(moduleId, view, view === 'pcbView' ? 'copper0' : view === 'schematicView' ? 'schematic' : 'breadboard').size)
    })
    expect(pins).toEqual([8, 8, 8])

    await page.locator('#open-file').setInputFiles({ name: 'vazio.kicad_mod', mimeType: 'text/plain', buffer: Buffer.from('(footprint "x")') })
    await expect.poll(() => app.message()).toMatch(/^vazio\.kicad_mod: footprint do KiCad ilegível ou sem pads$/)
})
