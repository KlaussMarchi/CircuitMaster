import { strFromU8, unzipSync } from 'fflate'
import { test, expect, type App } from './Fixtures'
import type { Point } from '../src/core/Geometry'

const OLD_DIODE = '2244BBEC34diode'    // obsolete/ DO ACERVO, replacedby="3254CBFC44diode" (O DIODO DO CORE)
const NEW_DIODE = '3254CBFC44diode'
const ORANGE    = '#ff6622'      // lengthColorTrans DO FRITZING PARA UM FIO DE 300 mil
const MIL300_PX = 27             // 300 mil A 90 px/in
const SMD       = '0805 [SMD]'   // ENCAPSULAMENTO DO RESISTOR COM COBRE SÓ NA FACE DE CIMA
const REGULATOR = 'KA78R05L035700a2cdcd47b284953d1e7f90f4bd'    // REGULADOR DO CORE COM PINO GND

const gridSize = (app: App) => app.page.evaluate(() => {
    const { doc, view } = cm.store.getState()
    return doc.settings[view]?.gridSize
})

// PONTO NA TELA COM O QUADRO ESPELHADO (PCB VISTA DE BAIXO): O X CONTA DA BORDA DIREITA
const mirror = async (app: App, [x, y]: Point) => {
    const [left, width] = await app.page.evaluate(() => {
        const rect = document.getElementById('canvas')?.parentElement?.getBoundingClientRect() ?? new DOMRect()
        return [rect.left, rect.width]
    })
    return [2 * left + width - x, y] as Point
}

test('Arquivo: Salvar como muda o nome, Salvar uma cópia não, Reverter volta ao arquivo, Abrir recentes reabre depois de recarregar', async ({ app, page }) => {
    await app.place('Resistor', [-350, -150])
    app.answers.push('meu circuito')
    const saved = await app.download(() => app.menu('Arquivo', 'Salvar como…'))
    expect(saved.name).toBe('meu circuito.fzz')
    await expect(page.getByRole('heading', { name: 'meu circuito' })).toBeVisible()

    app.answers.push('rascunho')
    const copy = await app.download(() => app.menu('Arquivo', 'Salvar uma cópia…'))
    expect(copy.name).toBe('rascunho.fzz')
    expect(await page.evaluate(() => cm.store.getState().name)).toBe('meu circuito.fzz')

    await app.place('Capacitor', [350, 150])
    expect(await app.count()).toBe(2)
    app.answers.push(true)
    await app.menu('Arquivo', 'Reverter')
    await expect.poll(() => app.count()).toBe(1)
    expect(app.asked.at(-1)).toMatch(/^Reverter meu circuito\.fzz ao arquivo/)
    await expect(page.getByText('Salvo', { exact: true })).toBeVisible()

    await app.open()
    await app.menu('Arquivo', 'Abrir recentes', 'meu circuito.fzz')
    await expect.poll(() => app.message()).toBe('meu circuito.fzz aberto')
    expect(await app.count()).toBe(1)
    await app.menu('Arquivo', 'Abrir recentes', 'Limpar recentes')
    await expect.poll(() => page.evaluate(() => cm.store.getState().recent.length)).toBe(0)
})

test('Imprimir: Ctrl+P monta a folha com a vista em SVG, chama a impressão e tira a folha depois', async ({ app, page }) => {
    await page.evaluate(() => {
        const printed: string[] = []
        Object.assign(window, { printed })
        window.print = () => printed.push(document.querySelector('.print-sheet img')?.getAttribute('src')?.slice(0, 26) ?? '')
    })
    await app.place('Resistor', [-350, -150])
    await page.keyboard.press('Control+p')
    await expect.poll(() => page.evaluate(() => (window as unknown as { printed: string[] }).printed)).toEqual(['data:image/svg+xml;base64,'])
    await expect(page.locator('.print-sheet')).toHaveCount(0)
})

test('Peça: localizar no sketch pela busca, travadas, desatualizadas e atualizar, exportar como está e desligar os fios', async ({ app, page }) => {
    const first  = await app.place('Resistor', [-350, -150])
    const second = await app.place('Resistor', [300, 120])
    await app.wire((await app.pins(first))['Pin 1'], (await app.pins(second))['Pin 0'])
    await page.keyboard.press('Escape')

    await page.keyboard.press('Control+f')
    await expect(page.locator('#part-search')).toBeFocused()
    await page.keyboard.type('R2')
    const sketch = page.getByRole('list', { name: 'No sketch' })
    await sketch.getByRole('button', { name: /^R2/ }).click()
    expect(await app.selection()).toEqual([second])
    await page.locator('#part-search').fill('')
    await page.locator('#part-search').blur()
    await page.keyboard.press('Control+0')

    await app.context(await app.center(first), 'Travar peça')
    await page.keyboard.press('Escape')
    await app.menu('Peça', 'Selecionar peças travadas')
    expect(await app.selection()).toEqual([first])

    await page.evaluate(async moduleId => cm.store.getState().addPart(moduleId, [0, 300]), OLD_DIODE)
    await page.keyboard.press('Escape')
    await app.menu('Peça', 'Selecionar peças desatualizadas')
    const old = await app.selection()
    expect(old).toHaveLength(1)
    await app.menu('Peça', 'Atualizar peças selecionadas')
    await expect.poll(() => page.evaluate(modelIndex => cm.store.getState().doc.instances[modelIndex]?.moduleIdRef, old[0])).toBe(NEW_DIODE)
    expect(await app.message()).toBe('1 peças atualizadas para a revisão seguinte')

    await page.mouse.click(...await app.center(second))
    const part = await app.download(() => app.menu('Peça', 'Exportar peça…'))
    expect(part.name).toMatch(/Resistor\.fzpz$/)
    await app.upload(part.path)
    await expect.poll(() => app.message()).toMatch(/peças de .*\.fzpz em Meus itens$/)

    const edges = await app.edges()
    await app.context(await app.center(second), 'Desligar todos os fios')
    await expect.poll(() => app.edges()).toBeLessThan(edges)
    expect(await page.evaluate(modelIndex => cm.store.getState().doc.edges.some(edge => edge.some(key => key.startsWith(`${modelIndex}/`))), second)).toBe(false)
})

test('Roteamento: trilhas "não rotear" e autoroteáveis no esquemático e na PCB, todos os jumpers', async ({ app, page }) => {
    const first  = await app.place('Resistor', [-350, -150])
    const second = await app.place('Resistor', [300, 120])
    await app.wire((await app.pins(first))['Pin 1'], (await app.pins(second))['Pin 0'])
    const [trace] = await app.wires()
    await page.keyboard.press('Escape')

    await app.menu('Roteamento', 'Selecionar trilhas autoroteáveis')
    const free = await app.selection()
    await app.menu('Roteamento', 'Selecionar trilhas "não rotear"')
    expect([...free, ...await app.selection()]).toContain(trace)

    await page.getByRole('tab', { name: 'PCB' }).click()
    await page.evaluate(async () => cm.store.getState().addPart('JumperModuleID', [0, 300]))
    await page.keyboard.press('Escape')
    await app.menu('Roteamento', 'Selecionar todos os jumpers')
    await expect.poll(async () => (await app.selection()).length).toBe(1)
    expect(await page.evaluate(modelIndex => cm.store.getState().doc.instances[modelIndex]?.moduleIdRef, (await app.selection())[0])).toBe('JumperModuleID')
})

test('Exibir: fios da protoboard pelo comprimento, grade de tamanho livre e cor de fundo', async ({ app, page }) => {
    await page.getByRole('tab', { name: 'Protoboard' }).click()
    const part  = await app.place('Resistor', [-350, -150])
    const start = await app.terminal((await app.pins(part))['Pin 1'])
    const reach = MIL300_PX * ((await app.viewport())?.zoom ?? 1)
    await page.mouse.click(...start)
    await page.mouse.move(start[0] + reach, start[1])
    await page.mouse.click(start[0] + reach, start[1], { button: 'right' })
    await expect.poll(async () => (await app.wires()).length).toBe(1)

    const orange = page.locator(`#canvas path[stroke="${ORANGE}"]`)
    await expect(orange).toHaveCount(0)
    await app.menu('Exibir', 'Colorir fios pelo comprimento')
    await expect(orange).toHaveCount(1)
    await app.menu('Exibir', 'Colorir fios pelo comprimento')
    await expect(orange).toHaveCount(0)

    app.answers.push('2.5mm')
    await app.menu('Exibir', 'Grade', 'Tamanho da grade…')
    await expect.poll(() => gridSize(app)).toBe('2.5mm')
    app.answers.push('5in')
    await app.menu('Exibir', 'Grade', 'Tamanho da grade…')
    await expect.poll(() => app.message()).toBe('tamanho de grade inválido: use de 0.001in a 1in, em in ou mm')
    expect(await gridSize(app)).toBe('2.5mm')
    await app.menu('Exibir', 'Grade', 'Restaurar a grade padrão')
    await expect.poll(() => gridSize(app)).toBe('0.1in')

    const canvas = page.locator('#canvas')
    const themed = await canvas.evaluate(element => getComputedStyle(element).backgroundColor)
    await app.menu('Exibir', 'Cor de fundo…')
    const picker = page.locator('#view-background')
    await expect(picker).toBeVisible()
    await picker.fill('#123456')
    await expect(canvas).toHaveCSS('background-color', 'rgb(18, 52, 86)')
    await page.locator('.field').filter({ has: picker }).getByRole('button', { name: 'Padrão' }).click()
    await expect(canvas).toHaveCSS('background-color', themed)
})

test('Bins: em lista e em ícones, bins de fábrica em abas, menu da peça no bin e o Temp com peça própria', async ({ app, page }) => {
    const parts = page.getByRole('region', { name: 'Peças' })
    await app.menu('Exibir', 'Bin em lista')
    await expect(parts.locator('.result').first()).toBeVisible()
    await expect(parts.locator('.part')).toHaveCount(0)
    await app.menu('Exibir', 'Bin em ícones')
    await expect(parts.locator('.parts-grid .part').first()).toBeVisible()

    await parts.getByRole('button', { name: 'Abrir bin' }).click({ timeout: 60000 })
    await page.getByRole('menuitem').filter({ has: page.getByText('Arduino', { exact: true }) }).click()
    await expect(parts.getByRole('tab', { name: 'Arduino', exact: true })).toHaveAttribute('aria-selected', 'true')
    await app.open()
    await expect(parts.getByRole('tab', { name: 'Arduino', exact: true })).toBeVisible({ timeout: 60000 })
    await parts.getByRole('button', { name: 'Fechar o bin Arduino' }).click()
    await expect(parts.getByRole('tab', { name: 'Arduino', exact: true })).toHaveCount(0)

    const resistor = parts.getByRole('button', { name: 'Resistor', exact: true })
    await resistor.click({ button: 'right' })
    await app.choose(['Editar peça (editor de peças)'])
    const editor = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Editor de peças' }) })
    await expect(editor).toBeVisible()
    await expect(editor.getByLabel('Trocar a peça do sketch pela nova')).toHaveCount(0)
    await editor.getByRole('button', { name: 'Cancelar' }).click()

    await resistor.click({ button: 'right' })
    const fzpz = await app.download(() => app.choose(['Exportar peça…']))
    expect(fzpz.name).toMatch(/Resistor\.fzpz$/)
    await app.upload(fzpz.path)
    await expect.poll(() => app.message()).toMatch(/peças de .*\.fzpz em Meus itens$/)
    await parts.getByRole('tab', { name: 'Meus itens' }).click()
    const mine = parts.getByRole('button', { name: /^Resistor/ })
    await expect(mine).toHaveCount(1)
    await mine.click({ button: 'right' })
    await app.choose(['Remover do bin'])
    await expect(mine).toHaveCount(0)

    await parts.getByRole('tab', { name: 'Core' }).click()
    const placed = await app.place('Resistor', [-300, -150])
    await page.keyboard.press('Escape')
    expect(await app.selection()).toEqual([])
    await resistor.click({ button: 'right' })
    await app.choose(['Localizar no sketch'])
    expect(await app.selection()).toEqual([placed])

    const temp = parts.getByRole('tab', { name: 'Temp' })
    await expect(temp).toHaveCount(0)
    await app.context(await app.center(placed), 'Editar (editor de peças)')
    await editor.getByLabel('Título').fill('Resistor próprio')
    await editor.getByLabel('Trocar a peça do sketch pela nova').check()
    await editor.getByRole('button', { name: 'Gravar peça' }).click()
    await page.getByLabel('O que mudou').fill('peça própria')
    await page.getByRole('button', { name: 'Registrar e gravar' }).click()
    await expect(temp).toBeVisible()
    const sketch = await app.download(() => app.menu('Arquivo', 'Salvar'))

    await app.menu('Arquivo', 'Novo')
    await expect(temp).toHaveCount(0)
    await app.upload(sketch.path)
    await expect(temp).toBeVisible()
    await temp.click()
    await expect(parts.getByRole('button', { name: /^Resistor próprio/ })).toBeVisible()
})

test('Camadas: em cada vista, ocultar os fios da protoboard e mostrar todas de novo', async ({ app, page }) => {
    await page.getByRole('tab', { name: 'Protoboard' }).click()
    const first  = await app.place('Resistor', [-300, -150])
    const second = await app.place('Resistor', [100, 150])
    await app.wire((await app.pins(first))['Pin 1'], (await app.pins(second))['Pin 0'])
    const [wire] = await app.wires()
    const drawn  = page.locator(`#canvas [data-index="${wire}"]`)
    await expect(drawn).toHaveCount(1)

    await app.menu('Exibir', 'Camadas', 'Fios')
    await expect(drawn).toHaveCount(0)
    await page.getByRole('tab', { name: 'Esquemático' }).click()
    const legend = page.getByRole('group', { name: 'Camadas' })
    await legend.getByRole('button', { name: 'Camadas' }).click()
    await expect(legend.locator('.layer')).toHaveCount(8)
    await expect(legend.locator('.layer[aria-pressed="false"]')).toHaveCount(0)

    await page.getByRole('tab', { name: 'Protoboard' }).click()
    await app.menu('Exibir', 'Camadas', 'Mostrar todas as camadas')
    await expect(drawn).toHaveCount(1)
})

test('PCB vista de baixo: espelhada, o clique e o pan seguem o mouse e o SVG sai espelhado', async ({ app, page }) => {
    await page.getByRole('tab', { name: 'PCB' }).click()
    const part = await app.place('Resistor', [-350, -150])
    await page.keyboard.press('Escape')

    await app.menu('Roteamento', 'Ver de baixo')
    await expect(page.locator('div.mirrored')).toHaveCount(1)
    await page.mouse.click(...await mirror(app, await app.center(part)))
    await expect.poll(() => app.selection()).toEqual([part])

    const before = await mirror(app, await app.center(part))
    const [x, y] = await app.canvasCenter()
    await page.mouse.move(x + 250, y + 200)
    await page.mouse.down()
    await page.mouse.move(x + 300, y + 230, { steps: 5 })
    await page.mouse.up()
    const after = await mirror(app, await app.center(part))
    expect(after[0] - before[0]).toBeCloseTo(50, 0)
    expect(after[1] - before[1]).toBeCloseTo(30, 0)

    const svg = await app.download(() => app.menu('Arquivo', 'Exportar', 'Como imagem', 'SVG…'))
    expect(svg.bytes.toString()).toContain('matrix(-1')
    await app.menu('Roteamento', 'Ver de baixo')
    await expect(page.locator('div.mirrored')).toHaveCount(0)
})

test('PCB face clicável: com só a face de baixo, o pad da peça SMD de cima não recebe clique; Ctrl+Shift+3 volta às duas', async ({ app, page }) => {
    await page.getByRole('tab', { name: 'PCB' }).click()
    const part = await app.place('Resistor', [-350, -150])
    const field = page.getByRole('complementary', { name: 'Inspetor' }).locator('.field').filter({ hasText: 'Encapsulamento' })
    await field.locator('select').selectOption({ label: SMD })
    await expect.poll(() => page.evaluate(modelIndex => cm.store.getState().doc.instances[modelIndex]?.moduleIdRef, part)).not.toBe('ResistorModuleID')
    await page.keyboard.press('Escape')

    const pad = await app.terminal(Object.values(await app.pins(part))[0])
    const hit = () => page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-index]')?.getAttribute('data-index') ?? null, pad)
    expect(await hit()).toBe(part)
    await app.menu('Roteamento', 'Só a face de baixo clicável')
    await expect.poll(hit).not.toBe(part)
    await page.keyboard.press('Control+#')
    await expect.poll(() => page.evaluate(() => cm.store.getState().side)).toBe('both')
    await expect.poll(hit).toBe(part)
})

test('Mostrar não roteadas: realça os terminais do ratsnest até o próximo clique; sem ratsnest avisa', async ({ app, page }) => {
    await page.getByRole('tab', { name: 'Protoboard' }).click()
    const first  = await app.place('Resistor', [-300, -150])
    const second = await app.place('Resistor', [100, 150])
    await app.wire((await app.pins(first))['Pin 1'], (await app.pins(second))['Pin 0'])

    await app.menu('Roteamento', 'Mostrar não roteadas')
    await expect.poll(() => app.message()).toBe('não há conexões por rotear')

    await page.getByRole('tab', { name: 'Esquemático' }).click()
    await app.menu('Roteamento', 'Mostrar não roteadas')
    await expect.poll(() => app.message()).toBe('conexões por rotear realçadas em amarelo; clique no quadro para limpar')
    const lit = page.locator('#canvas circle[style*="--warning"]')
    await expect(lit).toHaveCount(2)
    const [x, y] = await app.canvasCenter()
    await page.mouse.click(x + 250, y + 200)
    await expect(lit).toHaveCount(0)
})

test('Largura da trilha no inspetor: lista do Fritzing, valor livre de 8 a 128 mil e desfazer', async ({ app, page }) => {
    await page.getByRole('tab', { name: 'PCB' }).click()
    const first  = await app.place('Resistor', [-300, -100])
    const second = await app.place('Resistor', [100, 100])
    await app.wire((await app.pins(first))['Pin 1'], (await app.pins(second))['Pin 0'])
    const [trace] = await app.wires()
    const mils    = async () => (await app.state(trace))?.wire?.mils
    const before  = await mils()

    await page.keyboard.press('Escape')
    await page.mouse.click(...await app.along(trace, 0.5))
    await expect.poll(() => app.selection()).toEqual([trace])
    const width = page.getByRole('complementary', { name: 'Inspetor' }).locator('.field').filter({ hasText: 'Largura' }).locator('input')
    await expect(width).toHaveValue(`${before} mil`)

    await width.fill('200')
    await width.press('Enter')
    await expect.poll(() => app.message()).toBe('largura inválida: use um inteiro de 8 a 128 mil')
    expect(await mils()).toBe(before)

    await width.fill('32')
    await width.press('Enter')
    await expect.poll(mils).toBe(32)
    await expect(width).toHaveValue('32 mil')
    await page.keyboard.press('Control+z')
    await expect.poll(mils).toBe(before)
})

test('Rótulo da peça: menu próprio com editar, valores exibidos, giro, espelho e fonte, gravados no .fz', async ({ app, page }) => {
    const part  = await app.place('Resistor', [-350, -150])
    const label = page.locator(`[data-label="${part}"]`)
    const shown = async () => (await app.state(part))?.label
    await page.keyboard.press('Escape')

    await label.click({ button: 'right' })
    await app.choose(['Editar'])
    await expect(page.locator('#part-name')).toBeFocused()
    await page.keyboard.type('R99')
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(modelIndex => cm.store.getState().doc.instances[modelIndex]?.title, part)).toBe('R99')
    await expect(label).toContainText('R99')

    await label.click({ button: 'right' })
    await app.choose(['Girar/Espelhar'])
    await expect(page.getByRole('menuitem', { name: 'Girar 45° no sentido horário' })).toHaveCount(0)
    await app.choose(['Girar 90° no sentido horário'])
    await expect.poll(async () => (await shown())?.transform?.map(value => Math.round(value) || 0)).toEqual([0, 1, -1, 0, expect.any(Number), expect.any(Number)])
    await expect(label).toHaveAttribute('transform', /^matrix\(/)

    await label.click({ button: 'right' })
    await app.choose(['Girar/Espelhar', 'Espelhar verticalmente'])
    await expect.poll(async () => (await shown())?.transform?.slice(0, 4).map(value => Math.round(value) || 0)).toEqual([0, -1, -1, 0])

    await label.click({ button: 'right' })
    await app.choose(['Tamanho da fonte', 'Grande'])
    await expect.poll(async () => (await shown())?.size).toBe(14)

    const keys = (await shown())?.keys ?? []
    await label.click({ button: 'right' })
    await app.choose(['Exibir valores', 'Texto do rótulo'])
    await expect.poll(async () => (await shown())?.keys).toEqual(keys.filter(key => key !== ''))
    await expect(label).not.toContainText('R99')
    expect(await page.evaluate(() => cm.store.getState().past.length)).toBeGreaterThan(0)

    await page.getByRole('tab', { name: 'PCB' }).click()
    const pcb = page.locator(`[data-label="${part}"]`)
    await pcb.click({ button: 'right' })
    await app.choose(['Girar/Espelhar', 'Girar 45° no sentido horário'])
    await expect.poll(async () => (await shown())?.transform?.[0]).toBeCloseTo(Math.SQRT1_2)

    const saved  = await app.download(() => app.menu('Arquivo', 'Salvar'))
    const sketch = Object.entries(unzipSync(saved.bytes)).find(([name]) => name.endsWith('.fz'))?.[1]
    const text   = strFromU8(sketch ?? new Uint8Array())
    expect(text.match(/<titleGeometry[^>]*>.*?<\/titleGeometry>/gs)?.filter(geometry => geometry.includes('<transform'))).toHaveLength(2)
    expect(text).toContain('fontSize="14"')
})

test('Preferências: cores de realce dos terminais e texto dos net labels novos; o inspetor troca o texto de um net label', async ({ app, page }) => {
    const part  = await app.place('Resistor', [-350, -150])
    const start = await app.terminal((await app.pins(part))['Pin 1'])
    await page.mouse.click(...start)
    await page.mouse.move(start[0] + 120, start[1] + 80)
    await page.mouse.click(start[0] + 120, start[1] + 80, { button: 'right' })
    await expect.poll(async () => (await app.wires()).length).toBeGreaterThan(0)
    const loose = page.locator('#canvas [fill="#ff0000"]')
    await expect.poll(() => loose.count()).toBeGreaterThan(0)

    await page.keyboard.press('Control+,')
    const dialog = page.getByRole('dialog', { name: 'Preferências' })
    await dialog.getByLabel('Realce de terminal solto').fill('#123456')
    await expect.poll(() => page.locator('#canvas [fill="#123456"]').count()).toBeGreaterThan(0)
    await expect(loose).toHaveCount(0)
    await dialog.getByRole('tablist', { name: 'Texto dos net labels novos' }).getByRole('tab', { name: 'Junto ao conector' }).click()
    await dialog.getByRole('button', { name: 'Fechar' }).click()

    const label = await page.evaluate(async () => {
        await cm.store.getState().addPart('v5NetLabelModuleID', [0, 200])
        return cm.store.getState().selection[0]
    })
    const style = () => page.evaluate(modelIndex => cm.store.getState().doc.instances[modelIndex]?.properties.style, label)
    expect(await style()).toBe('right')
    const text = page.getByRole('complementary', { name: 'Inspetor' }).getByRole('tablist', { name: 'Texto do net label' })
    await expect(text.getByRole('tab', { name: 'Junto ao conector' })).toHaveAttribute('aria-selected', 'true')
    await text.getByRole('tab', { name: 'Na ponta de fora' }).click()
    await expect.poll(style).toBe('left')
})

test('Sementes de terra: o diálogo lista os conectores GND da PCB, marca e desmarca com desfazer e preenche', async ({ app, page }) => {
    await page.getByRole('tab', { name: 'PCB' }).click()
    const dialog = page.getByRole('dialog', { name: 'Sementes de terra' })
    await app.menu('Roteamento', 'Preenchimento de cobre', 'Escolher sementes…')
    await expect(dialog.getByText(/^Nenhum conector de terra na PCB/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Fechar' }).click()

    const regulator = await page.evaluate(async moduleId => {
        await cm.store.getState().addPart(moduleId, [0, 0])
        return cm.store.getState().selection[0]
    }, REGULATOR)
    const seeded = () => page.evaluate(modelIndex => cm.store.getState().doc.instances[modelIndex]?.views.pcbView?.connectors.some(connector => connector.groundFillSeed) ?? false, regulator)
    await app.menu('Roteamento', 'Preenchimento de cobre', 'Escolher sementes…')
    const ground = dialog.getByRole('checkbox', { name: /· GND$/ }).first()
    await ground.check()
    await expect.poll(seeded).toBe(true)
    await ground.uncheck()
    await expect.poll(seeded).toBe(false)
    await ground.check()
    await dialog.getByRole('button', { name: 'Fechar' }).click()
    await page.keyboard.press('Control+z')
    await expect.poll(seeded).toBe(false)
    await page.keyboard.press('Control+y')
    await expect.poll(seeded).toBe(true)

    await app.menu('Roteamento', 'Preenchimento de cobre', 'Escolher sementes…')
    await expect(ground).toBeChecked()

    await dialog.getByRole('button', { name: 'Preencher com terra' }).click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(() => app.message()).toMatch(/placa/)
})
