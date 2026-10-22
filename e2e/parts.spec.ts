import { unzipSync } from 'fflate'
import { test, expect, type App } from './Fixtures'

const AUTOSAVE_MS = 2000    // MAIS QUE O ATRASO DO SALVAMENTO AUTOMÁTICO: A RECARGA SEMPRE OFERECE RECUPERAR

const indexed = (app: App) => expect.poll(() => app.page.evaluate(() => cm.store.getState().indexed.ready), { timeout: 60000 }).toBe(true)

const moduleOf = (app: App, modelIndex: string) => app.page.evaluate(modelIndex => cm.store.getState().doc.instances[modelIndex]?.moduleIdRef, modelIndex)

test('Busca: / foca, básicos primeiro, Esc limpa; duplo clique põe no centro e arrastar solta no quadro', async ({ app, page }) => {
    await indexed(app)
    const panel  = page.getByRole('region', { name: 'Peças' })
    const search = panel.getByRole('searchbox', { name: 'Buscar peça' })
    const first  = panel.locator('.results .t').first()

    await page.keyboard.press('/')
    await expect(search).toBeFocused()

    for (const [query, name] of [['fonte', 'Fonte DC'], ['source', 'Fonte DC'], ['resistor', 'Resistor'], ['555', 'Timer 555']]) {
        await search.fill(query)
        await expect(first).toHaveText(name)
    }

    await search.fill('amp op')
    await expect.poll(() => panel.locator('.results .t').evaluateAll(items => items.slice(0, 2).map(item => item.textContent).sort())).toEqual(['Amp. op.', 'LM358'])

    await search.press('Escape')
    await expect(search).toHaveValue('')

    await search.fill('resistor')
    await panel.locator('.results button').first().dblclick()
    await expect.poll(() => app.count()).toBe(1)

    await page.getByRole('tab', { name: 'Esquemático' }).click()
    await search.fill('net label')
    await panel.locator('.results button').first().dblclick()
    await expect.poll(() => page.evaluate(() => Object.values(cm.store.getState().doc.instances).some(instance => instance.moduleIdRef.endsWith('NetLabelModuleID')))).toBe(true)
    await page.getByRole('tab', { name: 'Protoboard' }).click()

    await search.fill('')
    await panel.getByRole('button', { name: 'Capacitor', exact: true }).dragTo(page.locator('.canvas'), { targetPosition: { x: 200, y: 200 } })
    await expect.poll(() => app.count()).toBe(3)
})

test('Bins: Meus itens, novo bin, renomear, exportar, importar, apagar e manter na recarga', async ({ app, page }) => {
    const resistor = await app.place('Resistor', [-300, 0])
    const panel    = page.getByRole('region', { name: 'Peças' })
    const group    = (title: string) => panel.locator('.parts-group').filter({ has: page.getByRole('heading', { name: new RegExp(`^${title}`) }) })

    await app.context(await app.center(resistor), 'Adicionar ao bin', 'Meus itens')
    app.answers.push('Bin de teste')
    await app.context(await app.center(resistor), 'Adicionar ao bin', 'Novo bin…')
    await panel.getByRole('tab', { name: 'Meus itens' }).click()
    await expect(group('Bin de teste').locator('.part')).toHaveCount(1)

    app.answers.push('Bin renomeado')
    await group('Bin de teste').getByRole('button', { name: 'Renomear' }).click()
    await expect(group('Bin renomeado')).toBeVisible()

    const bin = await app.download(() => group('Bin renomeado').getByRole('button', { name: 'Exportar .fzbz' }).click())
    expect(bin.name).toBe('Bin renomeado.fzbz')
    expect(bin.bytes.subarray(0, 2).toString()).toBe('PK')

    app.answers.push(true)
    await group('Bin renomeado').getByRole('button', { name: 'Apagar' }).click()
    await expect(group('Bin renomeado')).toHaveCount(0)

    await app.upload(bin.path)
    await expect(group('Bin renomeado').locator('.part')).toHaveCount(1)

    app.answers.push('Vazio')
    await panel.getByRole('button', { name: 'Novo bin' }).click()
    await expect(group('Vazio')).toContainText('Vazio. Use')

    await page.waitForTimeout(AUTOSAVE_MS)
    await app.open()
    await page.getByRole('dialog', { name: 'Recuperar trabalho não salvo' }).getByRole('button', { name: 'Descartar' }).click()
    await panel.getByRole('tab', { name: 'Meus itens' }).click()
    await expect(group('Bin renomeado').locator('.part')).toHaveCount(1)
    await expect(group('Vazio')).toBeVisible()
})

test('Editor de peças: metadados, conectores, vistas, gravar com registro, trocar no sketch e .fzpz', async ({ app, page }) => {
    const first  = await app.place('Resistor', [-300, -100])
    const second = await app.place('Resistor', [100, 100])
    await app.wire((await app.pins(first))['Pin 1'], (await app.pins(second))['Pin 0'])
    const edges  = await app.edges()
    const editor = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Editor de peças' }) })

    await app.context(await app.center(first), 'Editar (editor de peças)')
    await expect(page.getByRole('heading', { name: 'Editor de peças' })).toBeVisible()

    await editor.getByLabel('Título').fill('Resistor de teste')
    await editor.getByLabel('Título').blur()

    await editor.getByRole('tab', { name: 'Conectores' }).click()
    const count = editor.locator('input[type="number"]')
    await count.fill('3')
    await expect(editor.getByRole('cell', { name: 'connector2' })).toBeVisible()
    await count.fill('2')
    await expect(editor.getByRole('cell', { name: 'connector2' })).toHaveCount(0)

    for (const tab of ['Protoboard', 'Esquemático', 'PCB', 'Ícone'])
        await editor.getByRole('tab', { name: tab, exact: true }).click()

    await editor.getByRole('tab', { name: 'Protoboard', exact: true }).click()
    await editor.locator('input[type="file"]').setInputFiles({ name: 'ruim.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('isto não é svg') })
    await expect.poll(() => app.message()).toBe('ruim.svg: SVG inválido')

    await editor.getByLabel('Trocar a peça do sketch pela nova').check()
    await editor.getByRole('button', { name: 'Gravar peça' }).click()
    await page.getByLabel('O que mudou').fill('título de teste')
    await page.getByRole('button', { name: 'Registrar e gravar' }).click()
    await expect(page.getByRole('heading', { name: 'Editor de peças' })).toHaveCount(0)

    await expect.poll(() => moduleOf(app, first)).not.toBe('ResistorModuleID')
    expect(await app.edges()).toBe(edges)
    await page.getByRole('region', { name: 'Peças' }).getByRole('tab', { name: 'Meus itens' }).click()
    await expect(page.getByRole('region', { name: 'Peças' }).getByRole('button', { name: /Resistor de teste/ })).toBeVisible()

    await app.context(await app.center(first), 'Editar (editor de peças)')
    await expect(editor.getByText('título de teste')).toBeVisible()
    const fzpz = await app.download(() => editor.getByRole('button', { name: 'Baixar .fzpz' }).click())
    expect(fzpz.name).toMatch(/\.fzpz$/)
    await editor.getByRole('button', { name: 'Cancelar' }).click()

    await app.upload(fzpz.path)
    await expect.poll(() => app.message()).toMatch(/peças de .*\.fzpz em Meus itens$/)
})

test('Inspetor: trocar o pacote do resistor por SMD mantém os fios', async ({ app, page }) => {
    const first  = await app.place('Resistor', [-300, -100])
    const second = await app.place('Resistor', [100, 100])
    await app.wire((await app.pins(first))['Pin 1'], (await app.pins(second))['Pin 0'])
    const edges  = await app.edges()

    await page.mouse.click(...await app.center(first))
    const field = page.getByRole('complementary', { name: 'Inspetor' }).locator('.field').filter({ hasText: 'Encapsulamento' })
    await field.locator('select').selectOption({ label: '0805 [SMD]' })
    await expect.poll(() => moduleOf(app, first)).not.toBe('ResistorModuleID')
    expect(await app.edges()).toBe(edges)
})

test('Peças geradas: o DIP de 16 pinos do exemplo Timer desenha e liga no netlist', async ({ app, page }) => {
    await page.evaluate(() => cm.store.getState().openSample('core/Timer.fzz'))
    await expect.poll(() => app.message()).toBe('Timer.fzz aberto')
    const dip = await page.evaluate(() => {
        const { doc, library, netlist } = cm.store.getState()
        const instance = Object.values(doc.instances).find(item => item.moduleIdRef === 'generic_ic_dip_16_300mil')
        const part     = library.getPart(instance?.moduleIdRef ?? '')
        return { pins: part?.connectors.length, linked: part?.connectors.filter(connector => (netlist?.getNet('breadboardView', `${instance?.modelIndex}/${connector.id}`).length ?? 0) > 1).length }
    })
    expect(dip.pins).toBe(16)
    expect(dip.linked).toBeGreaterThan(0)
})

test('Peças geradas do bin Core (DIP e barras de pinos) aparecem no bin e na busca, com ícone, e entram no quadro', async ({ app, page }) => {
    await indexed(app)
    const panel = page.getByRole('region', { name: 'Peças' })
    const tile  = panel.locator('.parts-grid .part').filter({ hasText: 'Generic IC DIP 8 pins' })

    for (const section of ['ICs', 'Connection'])
        await panel.getByRole('button', { name: new RegExp(`^${section} \\d+$`) }).click()

    await expect(tile).toHaveCount(1)
    await expect(panel.locator('.parts-grid .part').filter({ hasText: /Generic (female|shrouded) .*header/ })).toHaveCount(2)
    expect(await tile.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)

    await tile.dblclick()
    await expect.poll(() => app.count()).toBe(1)
    expect(await moduleOf(app, (await app.selection())[0])).toBe('generic_ic_dip_8_300mil')

    await panel.getByRole('searchbox', { name: 'Buscar peça' }).fill('generic ic dip')
    await expect(panel.locator('.results button').filter({ hasText: 'Generic IC DIP 8 pins' })).toHaveCount(1)
})

test('Logo de texto: mudar o texto no inspetor muda a largura na PCB', async ({ app, page }) => {
    await indexed(app)
    await page.getByRole('tab', { name: 'PCB' }).click()
    await page.getByRole('searchbox', { name: 'Buscar peça' }).fill('silkscreen text')
    await page.getByRole('region', { name: 'Peças' }).locator('.results button').first().dblclick()
    await expect.poll(() => app.count()).toBe(1)
    const [logo] = await app.selection()
    const width  = () => page.evaluate(modelIndex => {
        const { doc, library } = cm.store.getState()
        const [x0, , x1] = new cm.Scene(doc, library, 'pcbView').getBounds(modelIndex) ?? [0, 0, 0]
        return x1 - x0
    }, logo)
    const before = await width()

    const field = page.getByRole('complementary', { name: 'Inspetor' }).locator('.field').filter({ hasText: 'Texto' }).locator('input')
    await field.fill('um texto bem mais comprido')
    await field.press('Enter')
    await expect.poll(width).toBeGreaterThan(before)
})

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1in" height="0.4in" viewBox="0 0 100 40"><rect id="corpo" x="10" y="10" width="80" height="20"/><circle id="pino" cx="5" cy="20" r="4"/></svg>'

test('Editor de peças: SVG novo, conector atribuído a um elemento, terminal, tipo e nome no .fzpz, variante livre, gravar sem registro', async ({ app, page }) => {
    const resistor = await app.place('Resistor', [-300, 0])
    const editor   = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Editor de peças' }) })
    const rows     = async () => {
        await editor.getByRole('tab', { name: 'Metadados' }).click()
        await expect(editor.getByRole('heading', { name: 'Histórico de revisões' })).toBeVisible()
        return editor.locator('tbody tr').count()
    }

    await app.context(await app.center(resistor), 'Editar (editor de peças)')
    const history = await rows()
    expect(history).toBe(1)

    await editor.getByRole('tab', { name: 'Conectores' }).click()
    await editor.locator('input[type="number"]').fill('3')
    const first = editor.locator('tbody tr').first()
    await first.locator('select').selectOption('female')
    await first.locator('input').first().fill('A')
    await first.locator('input').first().press('Enter')

    await editor.getByRole('tab', { name: 'Protoboard', exact: true }).click()
    await editor.locator('input[type="file"]').setInputFiles({ name: 'novo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(SVG) })
    await expect(editor.locator('#pino')).toHaveCount(1)

    const item = editor.getByRole('button', { name: /connector2/ })
    await item.click()
    await expect(item.locator('.dot.bad')).toHaveCount(1)
    await editor.locator('#pino').click()
    await expect(item.locator('.dot.ok')).toHaveCount(1)
    await expect(editor.locator('#pino')).toHaveCount(0)
    await expect(editor.locator('#connector2pin')).toHaveClass(/pe-current/)
    await editor.getByRole('tab', { name: 'Topo', exact: true }).click()
    await expect(editor.getByText(/Terminal em /)).toBeVisible()

    await editor.getByRole('button', { name: 'Baixar .fzpz' }).click()
    const fzpz = await app.download(() => page.getByRole('button', { name: 'Gravar sem registro' }).click())
    const fzp  = Object.entries(unzipSync(fzpz.bytes)).find(([name]) => name.endsWith('.fzp'))?.[1]
    const text = new TextDecoder().decode(fzp)
    expect(text).toMatch(/<connector[^>]*id="connector0"[^>]*type="female"|<connector[^>]*type="female"[^>]*id="connector0"/)
    expect(text).toMatch(/<connector[^>]*name="A"/)

    await editor.getByRole('button', { name: 'Gravar peça' }).click()
    await expect(page.getByRole('heading', { name: 'Editor de peças' })).toHaveCount(0)
    await expect.poll(() => page.evaluate(modelIndex => cm.store.getState().doc.instances[modelIndex]?.moduleIdRef, resistor)).not.toBe('ResistorModuleID')
    const variants = await page.evaluate(modelIndex => {
        const { doc, library } = cm.store.getState()
        return [library.getPart(doc.instances[modelIndex]?.moduleIdRef ?? '')?.properties.variant, library.getPart('ResistorModuleID')?.properties.variant]
    }, resistor)
    expect(variants[0]).not.toBe(variants[1])

    await app.context(await app.center(resistor), 'Editar (editor de peças)')
    expect(await rows()).toBe(history)
})
