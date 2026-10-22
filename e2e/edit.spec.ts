import { test, expect } from './Fixtures'

test('Editar: copiar, colar, colar no lugar, duplicar, recortar, apagar, desfazer, refazer e seleção', async ({ app, page }) => {
    const resistor = await app.place('Resistor', [-300, 0])
    const origin   = (await app.state(resistor))?.geometry

    await page.keyboard.press('Control+c')
    await page.keyboard.press('Control+v')
    await expect.poll(() => app.count()).toBe(2)
    const pasted = (await app.state((await app.selection())[0]))?.geometry
    const grid   = await page.evaluate(() => cm.store.getState().getGrid())
    expect(Math.abs((pasted?.x ?? 0) - (origin?.x ?? 0) - 20)).toBeLessThanOrEqual(grid / 2)
    expect(Math.abs((pasted?.y ?? 0) - (origin?.y ?? 0) + 20)).toBeLessThanOrEqual(grid / 2)

    await app.menu('Editar', 'Colar no lugar')
    await expect.poll(() => app.count()).toBe(3)
    expect((await app.state((await app.selection())[0]))?.geometry.x).toBe(origin?.x)

    await app.menu('Editar', 'Duplicar')
    await expect.poll(() => app.count()).toBe(4)
    await page.keyboard.press('Control+d')
    await expect.poll(() => app.count()).toBe(5)

    await page.keyboard.press('Control+x')
    await expect.poll(() => app.count()).toBe(4)
    await app.menu('Editar', 'Colar')
    await expect.poll(() => app.count()).toBe(5)
    await app.menu('Editar', 'Recortar')
    await expect.poll(() => app.count()).toBe(4)
    await page.mouse.click(...await app.center(resistor))
    await app.menu('Editar', 'Copiar')
    await expect.poll(() => page.evaluate(() => cm.store.getState().clipboard?.instances.length)).toBe(1)

    await app.menu('Editar', 'Selecionar tudo')
    await expect.poll(async () => (await app.selection()).length).toBe(4)
    await app.menu('Editar', 'Desmarcar')
    await expect.poll(async () => (await app.selection()).length).toBe(0)
    await page.keyboard.press('Control+a')
    await expect.poll(async () => (await app.selection()).length).toBe(4)
    await expect(page.getByRole('toolbar', { name: 'Seleção' })).toContainText('4 selecionados')
    await page.keyboard.press('Escape')
    await expect.poll(async () => (await app.selection()).length).toBe(0)

    await page.keyboard.press('Control+a')
    await app.menu('Editar', 'Apagar')
    await expect.poll(() => app.count()).toBe(0)
    await page.keyboard.press('Control+z')
    await expect.poll(() => app.count()).toBe(4)
    await page.keyboard.press('Control+Shift+z')
    await expect.poll(() => app.count()).toBe(0)
    await app.menu('Editar', 'Desfazer')
    await expect.poll(() => app.count()).toBe(4)
    await app.menu('Editar', 'Refazer')
    await expect.poll(() => app.count()).toBe(0)
    await page.getByRole('toolbar', { name: 'Ferramentas' }).getByRole('button', { name: 'Desfazer' }).click()
    await expect.poll(() => app.count()).toBe(4)
    await page.getByRole('toolbar', { name: 'Ferramentas' }).getByRole('button', { name: 'Refazer' }).click()
    await expect.poll(() => app.count()).toBe(0)
    await page.keyboard.press('Control+y')
    await expect.poll(() => app.count()).toBe(0)
})

test('Editar: apagar leva os fios, apagar sem fios os deixa; nota', async ({ app, page }) => {
    const first  = await app.place('Resistor', [-300, -100])
    const second = await app.place('Resistor', [100, 100])
    await app.wire((await app.pins(first))['Pin 1'], (await app.pins(second))['Pin 0'])
    const wires = (await app.wires()).length

    await page.mouse.click(...await app.center(first))
    await expect.poll(() => app.selection()).toEqual([first])
    await page.keyboard.press('Alt+Backspace')
    await expect.poll(() => app.count()).toBe(1 + wires)

    await page.keyboard.press('Control+z')
    await page.mouse.click(...await app.center(first))
    await app.menu('Editar', 'Apagar sem fios')
    await expect.poll(() => app.count()).toBe(1 + wires)

    await page.keyboard.press('Control+z')
    await page.mouse.click(...await app.center(first))
    await page.keyboard.press('Delete')
    await expect.poll(() => app.count()).toBe(1)

    await app.menu('Editar', 'Adicionar nota')
    await expect.poll(() => page.evaluate(() => Object.values(cm.store.getState().doc.instances).filter(instance => instance.moduleIdRef === 'NoteModuleID').length)).toBe(1)
})

test('Peça: girar, travar, elevar, alinhar, rótulo e mover pelo teclado', async ({ app, page }) => {
    const first  = await app.place('Resistor', [-300, -100])
    const second = await app.place('Resistor', [-260, -90])

    await page.mouse.click(...await app.center(first))
    await app.menu('Peça', 'Girar', 'Girar 45° no sentido horário')
    await expect.poll(() => app.angle(first)).toBe(45)
    await page.keyboard.press(']')
    await expect.poll(() => app.angle(first)).toBe(135)
    await page.keyboard.press('[')
    await expect.poll(() => app.angle(first)).toBe(45)
    await app.menu('Peça', 'Girar', 'Girar 180°')
    await expect.poll(() => app.angle(first)).toBe(-135)
    await app.menu('Peça', 'Girar', 'Girar 90° no sentido anti-horário')
    await app.menu('Peça', 'Girar', 'Girar 45° no sentido anti-horário')
    await expect.poll(() => app.angle(first)).toBe(90)
    await page.getByRole('toolbar', { name: 'Ferramentas' }).getByRole('button', { name: 'Girar' }).click()
    await expect.poll(() => app.angle(first)).toBe(180)

    const grid = await page.evaluate(() => cm.store.getState().getGrid())
    const x    = (await app.state(first))?.geometry.x ?? 0
    await page.keyboard.press('ArrowRight')
    await expect.poll(async () => (await app.state(first))?.geometry.x).toBeCloseTo(x + grid)
    await page.keyboard.press('Shift+ArrowLeft')
    await expect.poll(async () => (await app.state(first))?.geometry.x).toBeCloseTo(x - 9 * grid)

    await app.menu('Peça', 'Travar peça')
    await expect.poll(async () => (await app.state(first))?.locked).toBe(true)
    await page.keyboard.press(']')
    await page.keyboard.press('ArrowRight')
    await app.paint()
    expect(await app.angle(first)).toBe(180)
    expect((await app.state(first))?.geometry.x).toBeCloseTo(x - 9 * grid)
    await app.context(await app.center(first), 'Travar peça')
    await expect.poll(async () => (await app.state(first))?.locked).toBe(false)

    const z = async (modelIndex: string) => (await app.state(modelIndex))?.geometry.z ?? 0
    expect(await z(first)).toBeLessThan(await z(second))
    await app.menu('Peça', 'Elevar e rebaixar', 'Trazer para frente')
    await expect.poll(async () => await z(first) > await z(second)).toBe(true)
    await page.keyboard.press('Control+{')
    await expect.poll(async () => await z(first) < await z(second)).toBe(true)

    await page.keyboard.press('Control+a')
    await app.menu('Peça', 'Alinhar', 'Esquerda')
    const left = (modelIndex: string) => page.evaluate(modelIndex => {
        const { doc, library, view } = cm.store.getState()
        return Math.round(new cm.Scene(doc, library, view).getBounds(modelIndex)?.[0] ?? NaN)
    }, modelIndex)
    await expect.poll(async () => await left(first) === await left(second)).toBe(true)

    await page.getByRole('tab', { name: 'Esquemático' }).click()
    await page.keyboard.press('Escape')
    await page.mouse.click(...await app.center(first))
    const visible = async () => (await app.state(first))?.label?.visible ?? false
    const shown   = await visible()
    await app.menu('Peça', shown ? 'Ocultar rótulo da peça' : 'Mostrar rótulo da peça')
    await expect.poll(visible).toBe(!shown)
})

test('Peça: espelhar no esquemático', async ({ app, page }) => {
    await page.getByRole('tab', { name: 'Esquemático' }).click()
    const source = await app.place('Fonte DC', [-400, 0])
    const det    = async () => {
        const [a, b, c, d] = (await app.state(source))?.geometry.transform ?? [1, 0, 0, 1]
        return Math.sign(a * d - b * c)
    }

    await app.menu('Peça', 'Espelhar verticalmente')
    await expect.poll(det).toBe(-1)
    await app.context(await app.center(source), 'Espelhar verticalmente')
    await expect.poll(det).toBe(1)
})

test('Fios: cor, dobra, apagar até as dobras e ratsnest para fio', async ({ app, page }) => {
    await page.getByRole('tab', { name: 'Protoboard' }).click()
    const first  = await app.place('Resistor', [-300, -150])
    const second = await app.place('Resistor', [100, 150])
    await app.wire((await app.pins(first))['Pin 1'], (await app.pins(second))['Pin 0'])
    const [wire] = await app.wires()
    const color  = (await app.state(wire))?.wire?.color

    await app.context(await app.along(wire, 0.5), 'Cor do fio', 'vermelho')
    await expect.poll(async () => (await app.state(wire))?.wire?.color).not.toBe(color)

    const before = (await app.wires()).length
    const middle = await app.along(wire, 0.5)
    await app.context(middle, 'Adicionar dobra')
    await expect.poll(async () => (await app.wires()).length).toBe(before + 1)
    await app.context(middle, 'Remover dobra')
    await expect.poll(async () => (await app.wires()).length).toBe(before)

    await app.context(middle, 'Adicionar dobra')
    await expect.poll(async () => (await app.wires()).length).toBe(before + 1)
    const [piece] = await app.wires()
    await app.context(await app.along(piece, 0.5), 'Apagar fio até as dobras')
    await expect.poll(async () => (await app.wires()).length).toBe(before)
    await page.keyboard.press('Control+z')
    await app.context(await app.along(piece, 0.5), 'Apagar fio')
    await expect.poll(async () => (await app.wires()).length).toBe(0)
    await page.keyboard.press('Control+z')

    await page.getByRole('tab', { name: 'Esquemático' }).click()
    const [a, b] = [await app.terminal((await app.pins(first))['Pin 1']), await app.terminal((await app.pins(second))['Pin 0'])]
    await app.context([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 'Criar trilha a partir do ratsnest')
    await expect.poll(() => page.evaluate(() => cm.store.getState().netlist?.getStatus('schematicView').left)).toBe(0)
})

test('Exibir: zoom, enquadrar, grade, fios ortogonais, vistas e tema', async ({ app, page }) => {
    await page.getByRole('tab', { name: 'Protoboard' }).click()
    await app.place('Resistor', [-300, 0])
    await app.place('Resistor', [100, 100])
    const zoom = async () => (await app.viewport())?.zoom ?? 0

    await app.menu('Exibir', 'Enquadrar')
    await app.paint()
    const fit = await zoom()

    await app.menu('Exibir', 'Ampliar')
    await expect.poll(zoom).toBeCloseTo(fit * 1.25)
    await app.menu('Exibir', 'Reduzir')
    await expect.poll(zoom).toBeCloseTo(fit)
    await page.keyboard.press('Control+=')
    await expect.poll(zoom).toBeCloseTo(fit * 1.25)
    await page.keyboard.press('Control+-')
    await expect.poll(zoom).toBeCloseTo(fit)
    await app.menu('Exibir', 'Tamanho real')
    await expect.poll(zoom).toBeCloseTo(96 / 90)
    await app.menu('Exibir', '100%')
    await expect.poll(zoom).toBeCloseTo(1)
    await app.menu('Exibir', 'Enquadrar')
    await expect.poll(zoom).toBeCloseTo(fit)
    await page.getByRole('group', { name: 'Zoom' }).getByRole('button', { name: 'Aumentar zoom' }).click()
    await expect.poll(zoom).toBeCloseTo(fit * 1.25)
    await page.getByRole('group', { name: 'Zoom' }).getByRole('button', { name: 'Enquadrar' }).click()
    await expect.poll(zoom).toBeCloseTo(fit)

    const setting = (key: string) => page.evaluate(key => cm.store.getState().doc.settings.breadboardView?.[key], key)
    for (const [label, key] of [['Alinhar à grade', 'alignToGrid'], ['Mostrar grade', 'showGrid'], ['Fios ortogonais (90°)', 'orthogonalWires']]) {
        await app.menu('Exibir', label)
        await expect.poll(() => setting(key)).toBe('0')
        await app.menu('Exibir', label)
        await expect.poll(() => setting(key)).toBe('1')
    }

    const view = () => page.evaluate(() => cm.store.getState().view)
    await app.menu('Exibir', 'PCB')
    await expect.poll(view).toBe('pcbView')
    await page.keyboard.press('Control+2')
    await expect.poll(view).toBe('schematicView')
    await page.keyboard.press('1')
    await expect.poll(view).toBe('breadboardView')
    await page.keyboard.press('3')
    await expect.poll(view).toBe('pcbView')

    await app.menu('Exibir', 'Tema claro')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await app.menu('Exibir', 'Tema escuro')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('Quadro: arrastar peça, mover a vista, roda do mouse e seletor de área', async ({ app, page }) => {
    const first  = await app.place('Resistor', [-300, -100])
    const second = await app.place('Resistor', [-100, 100])
    const x      = (await app.state(first))?.geometry.x ?? 0
    const start  = await app.center(first)

    await page.mouse.move(...start)
    await page.mouse.down()
    await page.mouse.move(start[0] + 120, start[1], { steps: 8 })
    await page.mouse.up()
    await expect.poll(async () => ((await app.state(first))?.geometry.x ?? 0) > x).toBe(true)

    const before = await app.viewport()
    const empty  = await app.canvasCenter()
    await page.mouse.move(empty[0] + 400, empty[1] - 250)
    await page.mouse.down()
    await page.mouse.move(empty[0] + 300, empty[1] - 200, { steps: 8 })
    await page.mouse.up()
    await expect.poll(async () => (await app.viewport())?.x).not.toBe(before?.x)

    const zoom = (await app.viewport())?.zoom ?? 0
    await page.mouse.move(...empty)
    await page.mouse.wheel(0, -400)
    await expect.poll(async () => (await app.viewport())?.zoom ?? 0).toBeGreaterThan(zoom)

    await page.keyboard.press('v')
    await expect(page.getByRole('toolbar', { name: 'Ferramentas' }).getByRole('button', { name: 'Seletor' })).toHaveAttribute('aria-pressed', 'true')
    const [a, b] = [await app.center(first), await app.center(second)]
    await page.mouse.move(Math.min(a[0], b[0]) - 80, Math.min(a[1], b[1]) - 80)
    await page.mouse.down()
    await page.mouse.move(Math.max(a[0], b[0]) + 80, Math.max(a[1], b[1]) + 80, { steps: 10 })
    await page.mouse.up()
    await expect.poll(async () => (await app.selection()).sort()).toEqual([first, second].sort())
    await page.keyboard.press('h')
    await expect(page.getByRole('toolbar', { name: 'Ferramentas' }).getByRole('button', { name: 'Editar', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('Selecionar tudo pega só o que aparece na vista: apagar na protoboard não leva a placa', async ({ app, page }) => {
    const first  = await app.place('Resistor', [-300, -100])
    const second = await app.place('Resistor', [0, 100])
    await app.wire((await app.pins(first))['Pin 1'], (await app.pins(second))['Pin 0'])
    await page.getByRole('tab', { name: 'PCB' }).click()
    await page.getByRole('complementary', { name: 'Inspetor' }).getByRole('tab', { name: 'Roteamento' }).click()
    await page.getByRole('button', { name: 'Criar placa e rotear' }).click()
    await expect.poll(() => page.evaluate(() => cm.store.getState().netlist?.getStatus('pcbView').left), { timeout: 60000 }).toBe(0)

    const hidden = await page.evaluate(() => {
        const { doc, library } = cm.store.getState()
        const scene = new cm.Scene(doc, library, 'breadboardView')
        return Object.values(doc.instances).filter(instance => !scene.isShown(instance)).map(instance => instance.modelIndex)
    })
    expect(hidden.length).toBeGreaterThan(0)

    await page.getByRole('tab', { name: 'Protoboard' }).click()
    await page.keyboard.press('Control+a')
    expect((await app.selection()).filter(modelIndex => hidden.includes(modelIndex))).toEqual([])
    await page.keyboard.press('Delete')
    await expect.poll(() => page.evaluate(() => {
        const { doc, library } = cm.store.getState()
        const scene = new cm.Scene(doc, library, 'breadboardView')
        return Object.values(doc.instances).filter(instance => scene.isShown(instance)).length
    })).toBe(0)
    const boards = await page.evaluate(hidden => {
        const { doc, library } = cm.store.getState()
        return hidden.filter(modelIndex => ['board', 'resizableBoard'].includes(library.getPart(doc.instances[modelIndex]?.moduleIdRef ?? '')?.kind ?? ''))
    }, hidden)
    expect(boards.length).toBe(1)
})

test('Editar: colar duas vezes, duplicar pelo contexto e pela barra, Backspace, nota só na própria vista', async ({ app, page }) => {
    await page.getByRole('tab', { name: 'Protoboard' }).click()
    const resistor = await app.place('Resistor', [-300, 0])
    const origin   = (await app.state(resistor))?.geometry
    const grid     = await page.evaluate(() => cm.store.getState().getGrid())

    await page.keyboard.press('Control+c')
    await page.keyboard.press('Control+v')
    await page.keyboard.press('Control+v')
    await expect.poll(() => app.count()).toBe(3)
    const second = (await app.state((await app.selection())[0]))?.geometry
    expect(Math.abs((second?.x ?? 0) - (origin?.x ?? 0) - 40)).toBeLessThanOrEqual(grid / 2)
    expect(Math.abs((second?.y ?? 0) - (origin?.y ?? 0))).toBeLessThanOrEqual(grid / 2)

    await app.context(await app.center(resistor), 'Duplicar')
    await expect.poll(() => app.count()).toBe(4)
    await page.keyboard.press('Control+a')
    await page.getByRole('toolbar', { name: 'Seleção' }).getByRole('button', { name: 'Duplicar' }).click()
    await expect.poll(() => app.count()).toBe(8)
    await page.getByRole('toolbar', { name: 'Seleção' }).getByRole('button', { name: 'Apagar' }).click()
    await expect.poll(() => app.count()).toBe(4)

    await page.mouse.click(...await app.center(resistor))
    await page.keyboard.press('Backspace')
    await expect.poll(() => app.count()).toBe(3)
    await page.keyboard.press('Control+a')
    await app.context(await app.center((await app.selection())[0]), 'Apagar')
    await expect.poll(() => app.count()).toBe(0)

    await app.menu('Editar', 'Adicionar nota')
    await expect.poll(async () => (await app.selection()).length).toBe(1)
    const [note] = await app.selection()
    const box    = page.locator(`[data-index="${note}"]`)
    await box.dblclick()
    await page.keyboard.type('lembrete')
    await page.mouse.click(...await app.canvasCenter().then(([x, y]) => [x - 500, y + 250] as [number, number]))
    await expect.poll(() => page.evaluate(modelIndex => cm.store.getState().doc.instances[modelIndex]?.text, note)).toContain('lembrete')
    expect(await page.evaluate(modelIndex => Object.keys(cm.store.getState().doc.instances[modelIndex]?.views ?? {}), note)).toEqual(['breadboardView'])
})

test('Peça: espelhar horizontal pelo |, 45° na PCB, Avançar e Recuar, seis alinhamentos', async ({ app, page }) => {
    await page.getByRole('tab', { name: 'Esquemático' }).click()
    const npn  = await app.place('Transistor NPN', [-420, 0])
    const sign = async () => {
        const [a, b, c, d] = (await app.state(npn))?.geometry.transform ?? [1, 0, 0, 1]
        return Math.sign(a * d - b * c)
    }
    await page.keyboard.press('|')
    await expect.poll(sign).toBe(-1)
    await app.menu('Peça', 'Espelhar horizontalmente')
    await expect.poll(sign).toBe(1)

    await page.getByRole('tab', { name: 'PCB' }).click()
    await page.mouse.click(...await app.center(npn))
    await app.menu('Peça', 'Girar', 'Girar 45° no sentido horário')
    await expect.poll(() => app.angle(npn)).toBe(45)
    await app.menu('Peça', 'Girar', 'Girar 45° no sentido anti-horário')
    await expect.poll(() => app.angle(npn)).toBe(0)

    await page.getByRole('tab', { name: 'Protoboard' }).click()
    const parts = [npn, await app.place('Resistor', [-300, -150]), await app.place('Resistor', [-150, 120])]
    const z     = async (modelIndex: string) => (await app.state(modelIndex))?.geometry.z ?? 0
    const order = async () => (await Promise.all(parts.map(async modelIndex => [modelIndex, await z(modelIndex)] as const))).sort((a, b) => a[1] - b[1]).map(([modelIndex]) => modelIndex)
    const start = await order()

    await page.mouse.click(...await app.center(start[0]))
    await page.keyboard.press('Control+]')
    await expect.poll(async () => (await order()).indexOf(start[0])).toBe(1)
    await app.menu('Peça', 'Elevar e rebaixar', 'Avançar')
    await expect.poll(async () => (await order()).indexOf(start[0])).toBe(2)
    await app.menu('Peça', 'Elevar e rebaixar', 'Recuar')
    await expect.poll(async () => (await order()).indexOf(start[0])).toBe(1)
    await page.keyboard.press('Control+[')
    await expect.poll(async () => (await order()).indexOf(start[0])).toBe(0)
    await page.keyboard.press('Control+}')
    await expect.poll(async () => (await order()).indexOf(start[0])).toBe(2)

    const bounds = () => page.evaluate(parts => {
        const { doc, library, view } = cm.store.getState()
        const scene = new cm.Scene(doc, library, view)
        return parts.map(modelIndex => scene.getBounds(modelIndex) ?? [0, 0, 0, 0])
    }, parts)
    const same   = (values: number[]) => Math.max(...values) - Math.min(...values) < 0.01
    const checks: [string, (box: number[]) => number][] = [['Esquerda', box => box[0]], ['Centro horizontal', box => (box[0] + box[2]) / 2], ['Direita', box => box[2]], ['Topo', box => box[1]], ['Centro vertical', box => (box[1] + box[3]) / 2], ['Base', box => box[3]]]

    await page.keyboard.press('Control+a')
    for (const [label, edge] of checks) {
        await app.menu('Peça', 'Alinhar', label)
        await expect.poll(async () => same((await bounds()).map(edge)), label).toBe(true)
    }
})

test('Exibir: Ctrl+Shift+0, encaixe na grade ao soltar, grade gravada no .fzz', async ({ app, page }) => {
    await page.getByRole('tab', { name: 'Protoboard' }).click()
    await app.place('Resistor', [-300, 0])
    await page.keyboard.press('Control+)')
    await expect.poll(async () => (await app.viewport())?.zoom).toBeCloseTo(1)

    const onGrid = async (modelIndex: string) => {
        const [key] = Object.values(await app.pins(modelIndex))
        const grid  = await page.evaluate(() => cm.store.getState().getGrid())
        const point = await page.evaluate(key => {
            const { doc, library, view } = cm.store.getState()
            return new cm.Scene(doc, library, view).getTerminal(key)
        }, key)
        return (point ?? [NaN, NaN]).every(value => Math.abs(value / grid - Math.round(value / grid)) < 0.01)
    }

    expect(await onGrid(await app.place('Resistor', [-217, 33]))).toBe(true)
    await app.menu('Exibir', 'Alinhar à grade')
    expect(await onGrid(await app.place('Resistor', [-111, 77]))).toBe(false)

    await app.menu('Exibir', 'Mostrar grade')
    const saved = await app.download(() => page.keyboard.press('Control+s'))
    app.answers.push(true)
    await page.keyboard.press('Control+n')
    await app.upload(saved.path)
    await expect.poll(() => page.evaluate(() => cm.store.getState().doc.settings.breadboardView?.showGrid)).toBe('0')
})

test('Fios: as cores das duas vistas, ratsnest vira fio e apagar ratsnest desfaz a ligação', async ({ app, page }) => {
    await page.getByRole('tab', { name: 'Protoboard' }).click()
    const first  = await app.place('Resistor', [-300, -150])
    const second = await app.place('Resistor', [100, 150])
    await app.wire((await app.pins(first))['Pin 1'], (await app.pins(second))['Pin 0'])
    const [wire] = await app.wires()
    const colors = await page.evaluate(() => import('/src/engine/Drawing/index.ts' as string).then(module => module.WIRE_COLORS))
    const names  = { blue: 'azul', red: 'vermelho', black: 'preto', yellow: 'amarelo', green: 'verde', grey: 'cinza', white: 'branco', orange: 'laranja', ochre: 'ocre', cyan: 'ciano', brown: 'marrom', purple: 'roxo', pink: 'rosa' } as Record<string, string>

    for (const [name, color] of colors.breadboardView as [string, string][]) {
        await app.context(await app.along(wire, 0.5), 'Cor do fio', names[name])
        await expect.poll(async () => (await app.state(wire))?.wire?.color.toLowerCase(), name).toBe(color)
    }

    await page.getByRole('tab', { name: 'Esquemático' }).click()
    const [a, b] = [await app.terminal((await app.pins(first))['Pin 1']), await app.terminal((await app.pins(second))['Pin 0'])]
    await app.context([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 'Apagar linha de ratsnest')
    await expect.poll(async () => (await app.wires()).length).toBe(0)
    await expect.poll(() => page.evaluate(() => cm.store.getState().doc.edges.length)).toBe(0)

    await app.wire((await app.pins(first))['Pin 1'], (await app.pins(second))['Pin 0'])
    const [trace] = await app.wires()
    expect(colors.schematicView.map(([name]: [string]) => name)).not.toContain('white')
    await app.context(await app.along(trace, 0.5), 'Cor do fio', names[colors.schematicView[1][0]])
    await expect.poll(async () => (await app.state(trace))?.wire?.color.toLowerCase()).toBe(colors.schematicView[1][1])

    await page.getByRole('tab', { name: 'Protoboard' }).click()
    const [c, d] = [await app.terminal((await app.pins(first))['Pin 1']), await app.terminal((await app.pins(second))['Pin 0'])]
    await app.context([(c[0] + d[0]) / 2, (c[1] + d[1]) / 2], 'Criar fio a partir do ratsnest')
    await expect.poll(() => page.evaluate(() => cm.store.getState().netlist?.getStatus('breadboardView').left)).toBe(0)
})

test('Fios: duplo clique dobra, Ctrl+arrastar curva e Endireitar curva volta a reto; rótulo pelo contexto', async ({ app, page }) => {
    await app.menu('Exibir', 'Fios ortogonais (90°)')
    const first  = await app.place('Resistor', [-300, -150])
    const second = await app.place('Resistor', [100, 150])
    await app.wire((await app.pins(first))['Pin 1'], (await app.pins(second))['Pin 0'])
    const [wire] = await app.wires()

    const middle = await app.along(wire, 0.5)
    await page.mouse.dblclick(...middle)
    await expect.poll(async () => (await app.wires()).length).toBe(2)
    await page.keyboard.press('Control+z')
    await expect.poll(async () => (await app.wires()).length).toBe(1)

    const start = await app.along(wire, 0.3)
    await page.keyboard.down('Control')
    await page.mouse.move(...start)
    await page.mouse.down()
    await page.mouse.move(start[0] + 30, start[1] + 60, { steps: 6 })
    await page.mouse.up()
    await page.keyboard.up('Control')
    await expect.poll(async () => (await app.state(wire))?.wire?.bezier ?? null).not.toBeNull()
    await app.context(await app.along(wire, 0.5), 'Endireitar curva')
    await expect.poll(async () => (await app.state(wire))?.wire?.bezier ?? null).toBeNull()

    await page.getByRole('tab', { name: 'Esquemático' }).click()
    const label = page.locator(`[data-label="${first}"]`)
    await label.click({ button: 'right' })
    await app.choose(['Ocultar rótulo da peça'])
    await expect.poll(async () => (await app.state(first))?.label?.visible).toBe(false)
})

test('Quadro: setas sem grade movem 1 px; espaço+arrastar, botão do meio e Shift+roda movem a vista', async ({ app, page }) => {
    const resistor = await app.place('Resistor', [-300, 0])
    await app.menu('Exibir', 'Alinhar à grade')
    const x = (await app.state(resistor))?.geometry.x ?? 0
    await page.mouse.click(...await app.center(resistor))
    await page.keyboard.press('ArrowRight')
    await expect.poll(async () => (await app.state(resistor))?.geometry.x).toBeCloseTo(x + 1)

    const empty = await app.canvasCenter()
    const moved = async (gesture: () => Promise<void>) => {
        const before = await app.viewport()
        await gesture()
        await expect.poll(async () => JSON.stringify(await app.viewport())).not.toBe(JSON.stringify(before))
    }

    await moved(async () => {
        await page.mouse.move(...await app.center(resistor))
        await page.keyboard.down('Space')
        await page.mouse.down()
        await page.mouse.move(empty[0] + 100, empty[1] + 80, { steps: 6 })
        await page.mouse.up()
        await page.keyboard.up('Space')
    })
    expect((await app.state(resistor))?.geometry.x).toBeCloseTo(x + 1)

    await moved(async () => {
        await page.mouse.move(...empty)
        await page.mouse.down({ button: 'middle' })
        await page.mouse.move(empty[0] - 120, empty[1] - 60, { steps: 6 })
        await page.mouse.up({ button: 'middle' })
    })

    await moved(async () => {
        await page.mouse.move(...empty)
        await page.keyboard.down('Shift')
        await page.mouse.wheel(0, 200)
        await page.keyboard.up('Shift')
    })
})

test('Peça: na protoboard o giro de 45° fica desabilitado e não há Sticky; na PCB a placa nasce sticky e leva as peças apoiadas', async ({ app, page }) => {
    await page.getByRole('tab', { name: 'Protoboard' }).click()
    const search = page.getByRole('searchbox', { name: 'Buscar peça' })
    const first  = page.getByRole('region', { name: 'Peças' }).locator('.results button').first()
    await expect.poll(() => page.evaluate(() => cm.store.getState().indexed.ready), { timeout: 60000 }).toBe(true)
    await search.fill('half+ breadboard')
    await first.dblclick()
    await expect.poll(() => app.count()).toBe(1)
    const [breadboard] = await app.selection()

    await app.context(await app.center(breadboard), 'Girar')
    await expect(page.getByRole('menuitem', { name: 'Girar 45° no sentido horário' })).toBeDisabled()
    await expect(page.getByRole('menuitem', { name: 'Sticky' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await app.context(await app.center(breadboard), 'Apagar')
    await expect.poll(() => app.count()).toBe(0)

    await page.getByRole('tab', { name: 'PCB' }).click()
    await search.fill('pcb')
    await first.dblclick()
    await expect.poll(() => app.count()).toBe(1)
    const [board] = await app.selection()
    const sticky  = () => page.evaluate(modelIndex => cm.store.getState().doc.instances[modelIndex]?.properties.sticky, board)
    expect(await sticky()).toBe('true')
    await search.fill('')

    const center = await app.center(board)
    await page.getByRole('region', { name: 'Peças' }).getByRole('button', { name: 'Resistor', exact: true }).click()
    await page.mouse.click(center[0] + 40, center[1] + 20)
    await expect.poll(() => app.count()).toBe(2)
    const [resistor] = await app.selection()
    const x          = async () => (await app.state(resistor))?.geometry.x ?? 0
    const edge: [number, number] = [center[0] - 60, center[1] - 30]

    const drag = async () => {
        await page.mouse.move(...edge)
        await page.mouse.down()
        await page.mouse.move(edge[0] + 90, edge[1], { steps: 8 })
        await page.mouse.up()
        edge[0] += 90
    }

    const before = await x()
    await drag()
    await expect.poll(async () => await x() > before).toBe(true)

    await app.context(edge, 'Sticky')
    await expect.poll(sticky).toBe('false')
    const moved = await x()
    await drag()
    await expect.poll(async () => (await app.center(board))[0]).toBeGreaterThan(edge[0])
    expect(await x()).toBe(moved)
})
