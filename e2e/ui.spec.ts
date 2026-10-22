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
        await page.evaluate(() => cm.store.getState().toggleSimulation())
        await expect.poll(() => app.simulated(), { timeout: 30000 }).toMatch(/^(op|tran)$/)

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

        await page.evaluate(() => cm.store.getState().setDialog('preferences'))
        const fits = await page.evaluate(() => {
            const card = document.querySelector('.modal > .card')?.getBoundingClientRect()
            return [...document.querySelectorAll('.modal > .card *')].filter(element => element.getBoundingClientRect().right > (card?.right ?? 0) + 1).map(element => element.className || element.tagName).slice(0, 3)
        })
        expect(fits, 'conteúdo das Preferências dentro do diálogo').toEqual([])
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

        for (const theme of THEMES) {
            await setTheme(app, theme)
            await page.evaluate(() => cm.store.getState().setDialog('preferences'))
            await expect(page.getByRole('dialog', { name: 'Preferências' })).toBeVisible()
            await app.shoot(`preferencias-${theme}-${width}`)
            await page.keyboard.press('Escape')
        }
    })

test('Paleta de comandos: Ctrl+K acha ações em português e em inglês, mostra caminho e atalho e executa com Enter', async ({ app, page }) => {
    const resistor = await app.place('Resistor', [-300, 0])
    const palette  = page.getByRole('dialog', { name: 'Paleta de comandos' })
    const input    = palette.getByRole('combobox', { name: 'Buscar comando' })
    const first    = palette.getByRole('option').first()

    await page.keyboard.press('Control+k')
    await expect(input).toBeFocused()
    await app.shoot('paleta')

    for (const [query, label, path] of [['copy', 'Copiar', 'Editar'], ['gerber', 'Gerber estendido (RS-274X)…', 'Arquivo › Exportar › Para produção'], ['autoroute', 'Autorotear', 'Roteamento'], ['undo history', 'Histórico de desfazer', 'Editar'], ['degrau', 'Degrau', 'Simulação › Teste']]) {
        await input.fill(query)
        await expect(first.locator('.label')).toHaveText(label)
        await expect(first.locator('.path')).toHaveText(path)
    }

    await input.fill('duplicate')
    await expect(first.locator('kbd')).toHaveText('Ctrl+D')
    await page.mouse.click(5, 5)
    await expect(palette).toHaveCount(0)

    await page.mouse.click(...await app.center(resistor))
    await page.keyboard.press('Control+k')
    await input.fill('duplicar')
    await input.press('Enter')
    await expect(palette).toHaveCount(0)
    await expect.poll(() => app.count()).toBe(2)

    await page.keyboard.press('Control+k')
    await input.fill('xyzw')
    await expect(palette).toContainText('Nenhum comando para “xyzw”')
    await input.press('Escape')
    await expect(palette).toHaveCount(0)
})

test('Modos: Iniciante esconde os itens avançados, a paleta acha tudo, o modo fica na recarga e o cartão abre só no Iniciante', async ({ app, page }) => {
    const resistor = await app.place('Resistor', [-300, 0])
    const item     = (label: string) => page.getByRole('menuitem').filter({ has: page.getByText(label, { exact: true }) })

    await app.menu('Exibir', 'Modo da interface', 'Iniciante')
    await expect.poll(() => page.evaluate(() => cm.store.getState().level)).toBe(1)
    await page.getByRole('navigation', { name: 'Menu principal' }).getByRole('button', { name: 'Editar', exact: true }).click()
    await expect(item('Duplicar')).toHaveCount(1)
    await expect(item('Colar no lugar')).toHaveCount(0)
    await page.keyboard.press('Escape')

    await page.keyboard.press('Control+k')
    await page.keyboard.type('colar no lugar')
    await expect(page.getByRole('dialog')).toContainText('Colar no lugar')
    await page.keyboard.press('Escape')

    await page.mouse.click(...await app.center(resistor))
    const lesson = page.getByRole('complementary', { name: 'Inspetor' }).locator('details.lesson')
    await expect(lesson).toHaveAttribute('open', '')
    await expect(lesson).toContainText('lei de Ohm')

    await app.open()
    expect(await page.evaluate(() => cm.store.getState().level)).toBe(1)
    await app.menu('Exibir', 'Modo da interface', 'Profissional')
    await page.getByRole('navigation', { name: 'Menu principal' }).getByRole('button', { name: 'Editar', exact: true }).click()
    await expect(item('Colar no lugar')).toHaveCount(1)
})

test('Preferências: roda rola a vista, arrastar curva o fio, atalho trocado vale nos menus e fica na recarga', async ({ app, page }) => {
    await app.menu('Exibir', 'Fios ortogonais (90°)')
    const first  = await app.place('Resistor', [-300, -150])
    const second = await app.place('Resistor', [100, 150])
    await app.wire((await app.pins(first))['Pin 1'], (await app.pins(second))['Pin 0'])
    const [wire] = await app.wires()
    const dialog = page.getByRole('dialog', { name: 'Preferências' })

    await app.menu('Editar', 'Preferências…')
    await dialog.getByRole('tablist', { name: 'Roda do mouse' }).getByRole('tab', { name: 'Rolar a vista' }).click()
    await dialog.getByRole('tablist', { name: 'Arrastar o meio de um fio' }).getByRole('tab', { name: 'Curva o fio' }).click()
    await dialog.getByRole('textbox', { name: 'Tecla de Duplicar' }).press('Shift+D')
    await expect(dialog.getByRole('textbox', { name: 'Tecla de Duplicar' })).toHaveValue('Shift+D')
    await dialog.getByRole('textbox', { name: 'Tecla de Copiar' }).press('Shift+D')
    await expect(dialog.getByRole('textbox', { name: 'Tecla de Duplicar' })).toHaveValue('—')
    await dialog.getByRole('textbox', { name: 'Tecla de Duplicar' }).press('Control+J')
    await dialog.getByRole('button', { name: 'Fechar' }).click()

    const start = await app.along(wire, 0.3)
    await page.mouse.move(...start)
    await page.mouse.down()
    await page.mouse.move(start[0] + 30, start[1] + 60, { steps: 6 })
    await page.mouse.up()
    await expect.poll(async () => (await app.state(wire))?.wire?.bezier ?? null).not.toBeNull()

    const empty = await app.canvasCenter()
    const zoom  = (await app.viewport())?.zoom
    const y     = (await app.viewport())?.y ?? 0
    await page.mouse.move(empty[0] + 400, empty[1] + 200)
    await page.mouse.wheel(0, 200)
    await expect.poll(async () => (await app.viewport())?.y ?? 0).toBeGreaterThan(y)
    expect((await app.viewport())?.zoom).toBe(zoom)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -200)
    await page.keyboard.up('Control')
    await expect.poll(async () => (await app.viewport())?.zoom ?? 0).toBeGreaterThan(zoom ?? 0)

    await page.mouse.click(...await app.center(first))
    await page.keyboard.press('Control+j')
    await expect.poll(() => app.count()).toBe(4)
    await page.keyboard.press('Shift+D')
    await expect.poll(() => page.evaluate(() => cm.store.getState().clipboard?.instances.length)).toBe(1)
    await page.getByRole('navigation', { name: 'Menu principal' }).getByRole('button', { name: 'Editar', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: 'Duplicar Ctrl+J' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Copiar Shift+D' })).toBeVisible()
    await page.keyboard.press('Escape')

    await app.download(() => page.keyboard.press('Control+s'))
    await expect.poll(() => app.message()).toMatch(/salvo/)
    await app.open()
    await expect(page.getByRole('dialog', { name: 'Recuperar trabalho não salvo' })).toHaveCount(0)
    expect(await page.evaluate(() => cm.store.getState().preferences)).toEqual({ wheel: 'scroll', curvy: true })
    await app.menu('Ajuda', 'Atalhos de teclado')
    await expect(page.getByRole('dialog', { name: 'Atalhos de teclado' }).getByRole('row', { name: /Ctrl\+J\s+Duplicar/ })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.keyboard.press('Control+,')
    await dialog.getByRole('button', { name: 'Restaurar todos os atalhos' }).click()
    await expect(dialog.getByRole('textbox', { name: 'Tecla de Duplicar' })).toHaveValue('Ctrl+D')
    await expect(dialog.getByRole('textbox', { name: 'Tecla de Copiar' })).toHaveValue('Ctrl+C')
})
