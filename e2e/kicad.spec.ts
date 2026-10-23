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

// BUSCA UNIFICADA: OS SÍMBOLOS DO KICAD VÊM DEPOIS DAS PEÇAS DO FRITZING E VIRAM PEÇAS DE TRÊS VISTAS (SPEC 08 §4–§5)
test('Busca unificada: um símbolo do KiCad aparece na busca, entra no esquemático e tem protoboard e PCB pelo footprint', async ({ app, page }) => {
    const parts  = page.getByRole('region', { name: 'Peças' })
    await parts.getByRole('searchbox', { name: 'Buscar peça' }).fill('NE555P')
    const result = parts.getByRole('button', { name: /NE555P/ }).filter({ hasText: 'KiCad · Timer' }).first()
    await expect(result).toBeVisible({ timeout: 30000 })
    await app.shoot('busca-kicad')

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
    expect(placed).toEqual({ moduleId: 'kicad:Timer:NE555P', pins: [8, 8, 8] })

    for (const view of ['Protoboard', 'PCB']) {
        await page.getByRole('tab', { name: view }).click()
        await app.paint()
        await app.shoot(`kicad-${view.toLowerCase()}`)
    }

    const saved = await app.download(() => page.keyboard.press('Control+s'))
    expect(saved.bytes.includes('part.kicad_Timer_NE555P.fzp')).toBe(true)
})
