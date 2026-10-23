import { test, expect, AUTOSAVE_MS, WIDTHS, type App } from './Fixtures'

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
    await expect.poll(() => app.message()).toBe('Button.fzz aberto')
    await expect(page.getByRole('tablist', { name: 'Sketches abertos' }).getByRole('tab')).toHaveCount(2)
    expect(app.asked).toEqual([])
    await page.getByRole('tablist', { name: 'Sketches abertos' }).getByRole('tab').first().click()
    expect(await app.count()).toBe(count)
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

        await page.evaluate(() => cm.store.getState().showTour(1))
        for (const theme of THEMES) {
            await setTheme(app, theme)
            await expect(page.getByRole('dialog', { name: /^Tour:/ })).toBeVisible()
            await app.shoot(`tour-${theme}-${width}`)
        }
        await page.keyboard.press('Escape')

        await page.evaluate(() => {
            const { doc, editPart } = cm.store.getState()
            editPart(Object.values(doc.instances).find(instance => instance.moduleIdRef === 'ResistorModuleID')?.modelIndex ?? null)
        })
        const editor = page.getByRole('dialog', { name: 'Editor de peças' })

        for (const [tab, shot] of [['Metadados', 'editor-pecas'], ['Conectores', 'editor-conectores'], ['Esquemático', 'editor-vista']]) {
            await editor.getByRole('tab', { name: tab, exact: true }).click()

            for (const theme of THEMES) {
                await page.evaluate(theme => cm.store.getState().theme !== theme && cm.store.getState().toggleTheme(), theme)
                await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
                await app.shoot(`${shot}-${theme}-${width}`)
            }
        }
        await editor.getByRole('button', { name: 'Cancelar' }).click()
    })

test('Paleta de comandos: Ctrl+K acha ações em português e em inglês, mostra caminho e atalho e executa com Enter', async ({ app, page }) => {
    const resistor = await app.place('Resistor', [-300, 0])
    const palette  = page.getByRole('dialog', { name: 'Paleta de comandos' })
    const input    = palette.getByRole('combobox', { name: 'Buscar comando' })
    const first    = palette.getByRole('option').first()

    await page.keyboard.press('Control+k')
    await expect(input).toBeFocused()
    await app.shoot('paleta')

    for (const [query, label, path] of [['copy', 'Copiar', 'Editar'], ['gerber', 'Gerber estendido (RS-274X)…', 'Arquivo › Exportar › Para produção'], ['autoroute', 'Autorotear', 'Roteamento'], ['undo history', 'Histórico de desfazer', 'Editar'], ['passa-baixa', 'Filtro passa-baixa (RC)', 'Simulação › Circuitos de teste']]) {
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

    await page.waitForTimeout(AUTOSAVE_MS)
    await app.open()
    await page.getByRole('dialog', { name: 'Recuperar trabalho não salvo' }).getByRole('button', { name: 'Descartar' }).click()
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
    await dialog.getByRole('textbox', { name: 'Tecla de Copiar', exact: true }).press('Shift+D')
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
    expect(await page.evaluate(() => cm.store.getState().preferences)).toMatchObject({ wheel: 'scroll', curvy: true })
    await app.menu('Ajuda', 'Atalhos de teclado')
    await expect(page.getByRole('dialog', { name: 'Atalhos de teclado' }).getByRole('row', { name: /Ctrl\+J\s+Duplicar/ })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.keyboard.press('Control+,')
    await dialog.getByRole('button', { name: 'Restaurar todos os atalhos' }).click()
    await expect(dialog.getByRole('textbox', { name: 'Tecla de Duplicar' })).toHaveValue('Ctrl+D')
    await expect(dialog.getByRole('textbox', { name: 'Tecla de Copiar', exact: true })).toHaveValue('Ctrl+C')
})

test('Tour: aparece uma vez por modo, avança, pula com Esc e volta pela Ajuda', async ({ app, page }) => {
    await page.evaluate(() => {
        localStorage.removeItem('circuitmaster.toured')
        localStorage.setItem('circuitmaster.level', '1')
    })
    await app.open()
    const card = page.getByRole('dialog', { name: /^Tour:/ })

    await expect(card).toHaveAccessibleName('Tour: Peças')
    await expect(page.locator('.tour-target')).toBeVisible()
    for (let i = 0; i < 5; i++)
        await card.getByRole('button', { name: 'Próximo' }).click()
    await expect(card).toHaveAccessibleName('Tour: Achar qualquer ação')
    await card.getByRole('button', { name: 'Começar' }).click()
    await expect(card).toHaveCount(0)

    await app.open()
    await expect(card).toHaveCount(0)

    await app.menu('Exibir', 'Modo da interface', 'Maker')
    await expect(card).toHaveAccessibleName('Tour: Placa')
    await page.keyboard.press('Escape')
    await expect(card).toHaveCount(0)
    expect(await page.evaluate(() => cm.store.getState().toured)).toEqual([1, 2])

    await app.menu('Ajuda', 'Tour da interface')
    await expect(card).toHaveAccessibleName('Tour: Placa')
    await card.getByRole('button', { name: 'Pular' }).click()
    await expect(card).toHaveCount(0)
})

test('Abas de sketches: Novo e exemplo abrem abas, cada uma com o seu circuito e desfazer; reabrir sem mudança reusa; fechar com alterações pergunta; Salvar todos', async ({ app, page }) => {
    const panel  = page.getByRole('complementary', { name: 'Inspetor' })
    const tabs   = page.getByRole('region', { name: 'Área de desenho' }).getByRole('tablist', { name: 'Sketches abertos' })
    const titles = () => page.evaluate(() => Object.values(cm.store.getState().doc.instances).filter(instance => instance.moduleIdRef !== 'WireModuleID').map(instance => instance.title))
    const sample = async () => {
        await panel.getByRole('tab', { name: 'Documento' }).click()
        await panel.getByRole('searchbox', { name: 'Buscar exemplo' }).fill('Button')
        await panel.getByRole('button', { name: 'Button', exact: true }).first().click()
        await expect.poll(() => app.message()).toBe('Button.fzz aberto')
    }

    await app.place('Resistor', [-350, -150])
    await expect(tabs).toHaveCount(0)
    await app.menu('Arquivo', 'Novo')
    await expect(tabs.getByRole('tab')).toHaveCount(2)
    expect(await app.count()).toBe(0)
    await app.place('Capacitor', [350, 150])
    expect(await titles()).toEqual(['C1'])

    await tabs.getByRole('tab', { name: /sem título/ }).first().click()
    expect(await titles()).toEqual(['R1'])
    await page.keyboard.press('Control+z')
    await expect.poll(() => app.count()).toBe(0)
    await page.keyboard.press('Control+Shift+Z')
    await expect.poll(() => titles()).toEqual(['R1'])
    await tabs.getByRole('tab').nth(1).click()
    expect(await titles()).toEqual(['C1'])

    await sample()
    await expect(tabs.getByRole('tab')).toHaveCount(3)
    await expect(tabs.getByRole('tab', { name: 'Button' })).toHaveAttribute('aria-selected', 'true')
    const count = await app.count()
    await sample()
    await expect(tabs.getByRole('tab')).toHaveCount(3)
    expect(await app.count()).toBe(count)
    await app.shoot('abas')

    await tabs.getByRole('button', { name: 'Fechar Button' }).click()
    await expect(tabs.getByRole('tab')).toHaveCount(2)
    expect(app.asked).toEqual([])
    expect(await titles()).toEqual(['C1'])

    await tabs.getByRole('button', { name: 'Fechar sem título' }).last().click()
    await expect.poll(() => app.asked).toEqual([expect.stringMatching(/^Fechar sem título sem salvar\?/)])
    await expect(tabs.getByRole('tab')).toHaveCount(2)

    const files: string[] = []
    page.on('download', download => files.push(download.suggestedFilename()))
    await app.menu('Arquivo', 'Salvar todos')
    await expect.poll(() => files).toEqual(['sem título.fzz', 'sem título.fzz'])
    await expect(tabs.locator('.dirty')).toHaveCount(0)
    await tabs.getByRole('button', { name: 'Fechar sem título' }).last().click()
    await expect(tabs).toHaveCount(0)
    expect(app.asked).toHaveLength(1)
    expect(await titles()).toEqual(['R1'])
})

// PALAVRAS QUE SÓ O PORTUGUÊS TEM: SOBRANDO NA TELA EM INGLÊS, ALGUM TEXTO FICOU SEM t(…)
const PORTUGUESE = /[ãõçéêáíóúâà]|\b(para|não|peça|peças|fio|fios|clique|aperte|nenhum|nenhuma|você|vista|grade|trilha|trilhas|placa|simular|salvar|abrir|arquivo|exibir|ajuda|projeto|apagar|girar)\b/i
const NATIVE     = ['Português (Brasil)']    // NOME DA LÍNGUA NA PRÓPRIA LÍNGUA

// TEXTOS VISÍVEIS, RÓTULOS, DICAS E PLACEHOLDERS DA TELA QUE AINDA ESTÃO EM PORTUGUÊS
const leftovers = (page: App['page']) => page.evaluate(({ source, native }) => {
    const pattern = new RegExp(source, 'i')
    const shown   = (element: Element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden'
    const walker  = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const texts: string[] = []

    while (walker.nextNode())
        walker.currentNode.parentElement && shown(walker.currentNode.parentElement) && texts.push(walker.currentNode.textContent?.trim() ?? '')

    document.querySelectorAll('[aria-label], [title], [placeholder]').forEach(element => shown(element) && texts.push(...['aria-label', 'title', 'placeholder'].map(name => element.getAttribute(name) ?? '')))
    return [...new Set(texts)].filter(text => text && !native.includes(text) && pattern.test(text))
}, { source: PORTUGUESE.source, native: NATIVE })

test('Inglês: a interface inteira troca de língua nas Preferências, fica na recarga e volta ao português', async ({ app, page }) => {
    const found: string[] = []
    const scan  = async (screen: string) => found.push(...(await leftovers(page)).map(text => `${screen}: ${text}`))
    const menus = page.getByRole('navigation', { name: 'Main menu' })

    await page.keyboard.press('Control+,')
    await page.getByRole('dialog', { name: 'Preferências' }).getByRole('tablist', { name: 'Idioma' }).getByRole('tab', { name: 'English' }).click()
    await expect(page.getByRole('dialog', { name: 'Preferences' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await scan('Preferences')
    await page.keyboard.press('Escape')
    await scan('Start')

    for (const title of ['File', 'Edit', 'Part', 'View', 'Routing', 'Simulation', 'Help']) {
        await menus.getByRole('button', { name: title, exact: true }).click()
        await scan(title)
        const parents = page.locator('.menu-pop').first().locator(':scope > li > button:has(.arrow):not([disabled])')

        for (let i = 0; i < await parents.count(); i++) {
            await parents.nth(i).hover()
            await scan(`${title} ›`)
        }

        await page.keyboard.press('Escape')
    }

    await page.keyboard.press('Control+k')
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await palette.getByRole('combobox', { name: 'Search command' }).fill('undo history')
    await expect(palette.getByRole('option').first()).toContainText('Undo history')
    await scan('Palette')
    await page.keyboard.press('Escape')

    await page.evaluate(() => cm.store.getState().openBench('rc'))
    await expect.poll(() => app.simulated(), { timeout: 30000 }).toBe('tran')
    await page.evaluate(() => cm.store.getState().pause())
    await scan('Simulation')
    const inspector = page.getByRole('complementary', { name: 'Inspector' })
    await page.evaluate(() => cm.store.getState().selectProbe('P1'))
    await expect(inspector.getByLabel('Voltage measurements')).toBeVisible()
    await scan('Probe')
    await page.mouse.click(...await app.center('1'))
    await expect(inspector.getByRole('tablist', { name: 'Source signal' })).toBeVisible()
    await scan('Source signal')
    await page.evaluate(() => cm.store.getState().setProjectProperties({ circuitmaster_stop_time_s: '1s' }))
    await inspector.getByRole('tab', { name: 'Document' }).click()
    await expect(inspector.getByLabel('Simulation options')).toContainText('Manual window')
    await scan('Simulation options')
    await inspector.getByRole('tab', { name: 'Properties' }).click()

    await page.evaluate(() => {
        const { doc, select } = cm.store.getState()
        select([Object.values(doc.instances).find(instance => instance.moduleIdRef === 'ResistorModuleID')?.modelIndex ?? ''])
    })
    await inspector.getByText('How it works').click()
    await scan('Inspector')

    await page.evaluate(() => cm.store.getState().openSample('core/Button.fzz'))
    await expect.poll(() => app.message()).toBe('Button.fzz opened')
    await page.evaluate(() => cm.store.getState().setView('pcbView'))
    await expect(page.locator('[data-drc]').first().or(page.getByRole('group', { name: 'Layers' }))).toBeVisible()
    await scan('PCB')

    for (const panel of ['Routing', 'Document']) {
        await inspector.getByRole('tab', { name: panel }).click()
        await scan(panel)
    }

    for (const panel of ['Project', 'Problems', 'Parts']) {
        await page.getByRole('navigation', { name: 'Panels' }).getByRole('button', { name: panel }).click()
        await scan(panel)
    }

    for (const item of ['Keyboard shortcuts', 'About CircuitMaster', 'User guide']) {
        await menus.getByRole('button', { name: 'Help', exact: true }).click()
        await app.choose([item])
        await scan(item)
        await page.keyboard.press('Escape')
    }

    await page.evaluate(() => cm.store.getState().showTour(1))
    await expect(page.getByRole('dialog', { name: /^Tour:/ })).toBeVisible()
    await scan('Tour')
    await page.keyboard.press('Escape')

    await page.evaluate(() => {
        const { doc, editPart } = cm.store.getState()
        editPart(Object.values(doc.instances).find(instance => instance.moduleIdRef === 'ResistorModuleID')?.modelIndex ?? null)
    })
    const editor = page.getByRole('dialog', { name: 'Parts editor' })

    for (const tab of ['Metadata', 'Connectors', 'Schematic']) {
        await editor.getByRole('tab', { name: tab, exact: true }).click()
        await scan(`Parts editor › ${tab}`)
    }

    await editor.getByRole('button', { name: 'Cancel' }).click()
    await app.shoot('ingles')
    expect(found).toEqual([])

    await app.open()
    await expect(menus.getByRole('button', { name: 'File', exact: true })).toBeVisible()
    await page.keyboard.press('Control+,')
    await page.getByRole('dialog', { name: 'Preferences' }).getByRole('tablist', { name: 'Language' }).getByRole('tab', { name: 'Português (Brasil)' }).click()
    await expect(page.getByRole('navigation', { name: 'Menu principal' }).getByRole('button', { name: 'Arquivo', exact: true })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
})
