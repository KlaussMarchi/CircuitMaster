import { test, expect, WIDTHS, type App } from './Fixtures'

const THEMES = ['dark', 'light']

const setTheme = async (app: App, theme: string) => {
    if (await app.page.locator('html').getAttribute('data-theme') !== theme)
        await app.page.getByRole('navigation', { name: 'Painéis' }).getByRole('button', { name: 'Alternar tema' }).click()

    await expect(app.page.locator('html')).toHaveAttribute('data-theme', theme)
}

test('Ajuda: Sobre e Atalhos fecham por Fechar, Esc e clique fora', async ({ app, page }) => {
    const dialog = page.getByRole('dialog')

    await app.menu('Ajuda', 'Sobre o CircuitMaster')
    await expect(dialog).toContainText('CircuitMaster')
    await dialog.getByRole('button', { name: 'Fechar' }).click()
    await expect(dialog).toHaveCount(0)

    await app.menu('Ajuda', 'Atalhos de teclado')
    await expect(dialog).toContainText('Ctrl+Z')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    await page.getByRole('navigation', { name: 'Painéis' }).getByRole('button', { name: 'Atalhos' }).click()
    await expect(dialog).toBeVisible()
    await page.mouse.click(5, 500)
    await expect(dialog).toHaveCount(0)
})

test('Painéis: Peças, Projeto e Problemas no trilho; inspetor e exemplos pelo Documento', async ({ app, page }) => {
    const rail  = page.getByRole('navigation', { name: 'Painéis' })
    const panel = page.getByRole('complementary', { name: 'Inspetor' })
    const first = await app.place('Resistor', [-300, -100])
    const other = await app.place('Resistor', [0, 100])
    await app.wire((await app.pins(first))['Pin 1'], (await app.pins(other))['Pin 0'])
    const count = await app.count()
    await page.getByRole('tab', { name: 'Esquemático' }).click()

    await rail.getByRole('button', { name: 'Projeto' }).click()
    await expect(page.getByRole('region', { name: 'Projeto' })).toContainText('2 peças')
    await rail.getByRole('button', { name: 'Problemas' }).click()
    await expect(page.getByRole('region', { name: 'Problemas' })).toContainText(/alerta/)
    await rail.getByRole('button', { name: 'Peças' }).click()
    await expect(page.getByRole('region', { name: 'Peças' })).toBeVisible()

    for (const tab of ['Roteamento', 'Documento', 'Propriedades']) {
        await panel.getByRole('tab', { name: tab }).click()
        await expect(panel.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true')
    }

    await panel.getByRole('tab', { name: 'Documento' }).click()
    await panel.getByRole('searchbox', { name: 'Buscar exemplo' }).fill('Button')
    await panel.getByRole('button', { name: 'Button', exact: true }).first().click()
    await expect.poll(() => app.asked).toEqual([expect.stringMatching(/^Descartar as alterações/)])
    expect(await app.count()).toBe(count)

    app.answers.push(true)
    await panel.getByRole('button', { name: 'Button', exact: true }).first().click()
    await expect.poll(() => app.message()).toBe('Button.fzz aberto')
})

test('Inspetor e cartão de valor: nome, resistência digitada e passo da série E12', async ({ app, page }) => {
    const resistor = await app.place('Resistor', [-300, 0])
    const panel    = page.getByRole('complementary', { name: 'Inspetor' })
    const property = (key: string) => page.evaluate(([modelIndex, key]) => cm.store.getState().doc.instances[modelIndex]?.properties[key], [resistor, key] as const)
    const title    = () => page.evaluate(modelIndex => cm.store.getState().doc.instances[modelIndex]?.title, resistor)

    const name = panel.locator('.field').filter({ hasText: 'Nome' }).locator('input')
    await name.fill('R99')
    await name.press('Enter')
    await expect.poll(title).toBe('R99')

    const ohms = panel.locator('.field').filter({ hasText: 'Resistência' }).locator('input')
    await ohms.fill('4.7kΩ')
    await ohms.press('Enter')
    await expect.poll(() => property('resistance')).toMatch(/^4\.7kΩ$/)

    await page.getByRole('button', { name: 'Aumentar resistência' }).click()
    await expect.poll(() => property('resistance')).toMatch(/^5\.6kΩ$/)
    await page.getByRole('button', { name: 'Diminuir resistência' }).click()
    await page.getByRole('button', { name: 'Diminuir resistência' }).click()
    await expect.poll(() => property('resistance')).toMatch(/^3\.9kΩ$/)
})

test('Tema: alternar pelo trilho e manter na recarga', async ({ app, page }) => {
    await setTheme(app, 'light')
    await app.open()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await setTheme(app, 'dark')
})

for (const width of [1280, 390])
    test(`Layout a ${width} px: nada passa da janela, o Simular aparece e o cabeçalho do quadro cabe`, async ({ app, page }) => {
        await page.setViewportSize({ width, height: width > 860 ? 1080 : 844 })
        await app.open()
        await page.evaluate(() => cm.store.getState().openSample('core/Button.fzz'))
        await expect.poll(() => app.message()).toBe('Button.fzz aberto')
        await page.evaluate(() => cm.store.getState().setSimulation({ enabled: true, transient: true }))
        await expect.poll(() => app.simulated(), { timeout: 30000 }).toBe('tran')

        for (const view of ['breadboardView', 'schematicView', 'pcbView'] as const) {
            await page.evaluate(view => cm.store.getState().setView(view), view)
            await app.paint()
            const layout = await page.evaluate(() => {
                const pill = document.querySelector('.stage-head .doc .pill') as HTMLElement
                const head = document.querySelector('.stage-head')?.getBoundingClientRect()
                const play = [...document.querySelectorAll('.topright .btn')].at(-1)?.getBoundingClientRect()
                const inside = (selector: string) => [...document.querySelectorAll(`${selector} *`)].every(element => element.getBoundingClientRect().right <= (document.querySelector(selector)?.getBoundingClientRect().right ?? 0) + 1)
                return { page: document.documentElement.scrollWidth, pill: pill.scrollWidth <= pill.clientWidth && pill.getBoundingClientRect().right <= (head?.right ?? 0), play: (play?.right ?? Infinity) <= innerWidth && (play?.width ?? 0) > 0, heads: inside('.stage-head') && inside('.dock-head') }
            })
            expect(layout, view).toEqual({ page: width, pill: true, play: true, heads: true })
        }
    })

for (const width of WIDTHS)
    test(`Fotos das telas nos dois temas a ${width} px`, async ({ app, page }) => {
        await page.setViewportSize({ width, height: width > 860 ? 1080 : 844 })
        await app.open()

        for (const theme of THEMES) {
            await setTheme(app, theme)
            await app.shoot(`inicio-${theme}-${width}`)
        }

        await page.evaluate(() => cm.store.getState().openBench('rc'))
        await expect.poll(() => app.simulated(), { timeout: 30000 }).toBe('tran')
        await page.evaluate(() => cm.store.getState().pause())

        for (const theme of THEMES) {
            await setTheme(app, theme)
            await app.shoot(`simulacao-${theme}-${width}`)
        }

        await page.evaluate(() => cm.store.getState().openSample('core/Button.fzz'))
        await expect.poll(() => app.message()).toBe('Button.fzz aberto')
        await page.evaluate(() => cm.store.getState().setView('pcbView'))
        await app.paint()

        for (const theme of THEMES) {
            await setTheme(app, theme)
            await app.shoot(`pcb-${theme}-${width}`)
        }
    })
