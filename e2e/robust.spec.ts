import { test, expect, type App } from './Fixtures'

// TIRA DOS PROBLEMAS DO TESTE OS ERROS PROVOCADOS DE PROPÓSITO, CONFERINDO QUE ELES APARECERAM
const expected = (app: App, patterns: RegExp[]) => {
    const found  = app.issues.filter(issue => patterns.some(pattern => pattern.test(issue)))
    app.issues   = app.issues.filter(issue => !found.includes(issue))
    expect(found.length, 'erros provocados').toBeGreaterThan(0)
}

const circuit = async (app: App) => {
    const first  = await app.place('Resistor', [-300, -100])
    const second = await app.place('Resistor', [0, 100])
    await app.wire((await app.pins(first))['Pin 1'], (await app.pins(second))['Pin 0'])
    return [first, second]
}

test('Falha num painel: o inspetor mostra a causa, o resto segue, o circuito fica intacto e recarregar volta', async ({ app, page }) => {
    const [first] = await circuit(app)
    const before  = await page.evaluate(() => JSON.stringify(cm.store.getState().doc))
    const panel   = page.getByRole('complementary', { name: 'Inspetor' })

    await page.evaluate(() => {
        const catalog = cm.store.getState().catalog as unknown as Record<string, unknown>
        catalog.kept    = catalog.getIcon
        catalog.getIcon = () => { throw new Error('ícone corrompido de propósito') }
    })
    await page.mouse.click(...await app.center(first))
    const alert = page.getByRole('alert', { name: 'Inspetor: falha' })
    await expect(alert).toContainText('ícone corrompido de propósito')
    await app.shoot('falha-inspetor')
    expect(await page.evaluate(() => JSON.stringify(cm.store.getState().doc))).toBe(before)

    const total = await app.count()
    await page.getByRole('tab', { name: 'Esquemático' }).click()
    await expect.poll(() => page.evaluate(() => cm.store.getState().view)).toBe('schematicView')
    await app.place('Capacitor', [250, 0])
    await expect.poll(() => app.count()).toBe(total + 1)

    await page.evaluate(() => {
        const catalog   = cm.store.getState().catalog as unknown as Record<string, unknown>
        catalog.getIcon = catalog.kept
    })
    await alert.getByRole('button', { name: 'Recarregar painel' }).click()
    await expect(alert).toHaveCount(0)
    await expect(panel.getByRole('tab', { name: 'Propriedades' })).toBeVisible()
    expected(app, [/ícone corrompido de propósito/, /error boundary/i, /above error occurred/i])
})

test('Worker de PCB que falha no meio do trabalho dá a causa e o pedido seguinte funciona', async ({ app, page }) => {
    await circuit(app)
    await page.getByRole('tab', { name: 'PCB' }).click()
    await page.getByRole('complementary', { name: 'Inspetor' }).getByRole('tab', { name: 'Roteamento' }).click()

    const broken = await page.evaluate(async () => {
        const result = await cm.store.getState().pcb.request({ type: 'drc', artwork: null, groups: [], keepout: 10 } as never)
        return [result, cm.store.getState().pcb.failure, cm.store.getState().pcb.worker] as const
    })
    expect(broken[0]).toBeNull()
    expect(broken[1]).toMatch(/falhou/)
    expect(broken[2]).toBeNull()

    await page.getByRole('button', { name: 'Criar placa e rotear' }).click()
    await expect.poll(() => page.evaluate(() => cm.store.getState().routing !== null)).toBe(true)
    await page.evaluate(() => cm.store.getState().pcb.worker?.dispatchEvent(new ErrorEvent('error', { message: 'worker morto de propósito' })))
    await expect.poll(() => app.message()).toMatch(/autorouter: .*worker morto de propósito.*tente de novo/)
    expect(await page.evaluate(() => cm.store.getState().routing)).toBeNull()

    await page.keyboard.press('Control+Shift+a')
    await expect.poll(() => page.evaluate(() => cm.store.getState().netlist?.getStatus('pcbView').left), { timeout: 60000 }).toBe(0)
})

test('Worker do simulador que falha dá a causa na simulação e a seguinte funciona', async ({ app, page }) => {
    const broken = await page.evaluate(() => cm.store.getState().simulator.run(null as never))
    expect(broken.error).toMatch(/simulação interrompida: o processo de fundo falhou/)

    await app.menu('Simulação', 'Circuitos de teste', 'Carga do capacitor (RC)')
    await expect.poll(() => app.simulated(), { timeout: 30000 }).toBe('tran')
})

test('Indexador que falha volta no pedido seguinte com o índice do cache', async ({ app }) => {
    const page = app.page
    await expect.poll(() => page.evaluate(() => cm.store.getState().indexed.ready), { timeout: 60000 }).toBe(true)
    const broken = await page.evaluate(() => cm.store.getState().catalog.request({ type: 'quebrado' }, 'vazio'))
    expect(broken).toBe('vazio')
    expect(await page.evaluate(() => cm.store.getState().catalog.supervisor.worker)).toBeNull()

    const panel = page.getByRole('region', { name: 'Peças' })
    await panel.getByRole('searchbox', { name: 'Buscar peça' }).fill('resistor')
    await expect(panel.locator('.results .t').first()).toHaveText('Resistor')
})

const AUTOSAVE_MS = 2000    // MAIS QUE O ATRASO DO SALVAMENTO AUTOMÁTICO (1,5 s)

const saved = (app: App) => app.page.evaluate(() => cm.store.getState().autosave.getVersions().then(versions => versions.map(version => ({ name: version.name, dirty: version.dirty, count: version.count }))))

test('Recarregar no meio da edição oferece a versão salva sozinha e devolve o circuito como não salvo', async ({ app, page }) => {
    await circuit(app)
    const count = await app.count()
    await expect.poll(async () => (await saved(app))[0]?.count, { timeout: 10000 }).toBe(count)
    expect((await saved(app))[0]?.dirty).toBe(true)

    await app.open()
    const dialog = page.getByRole('dialog', { name: 'Recuperar trabalho não salvo' })
    await expect(dialog).toContainText('sem título')
    await app.shoot('recuperar')
    await dialog.getByRole('button', { name: 'Abrir' }).first().click()
    await expect.poll(() => app.count()).toBe(count)
    await expect(page.getByRole('region', { name: 'Área de desenho' })).toContainText('Alterações não salvas')
    await page.waitForTimeout(AUTOSAVE_MS)

    await app.open()
    await expect(page.getByRole('dialog', { name: 'Recuperar trabalho não salvo' })).toContainText('sem título')
    await page.getByRole('dialog').getByRole('button', { name: 'Descartar' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect((await saved(app)).filter(version => version.dirty)).toEqual([])
    await app.open()
    await page.waitForTimeout(AUTOSAVE_MS)
    await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('Duas abas no mesmo projeto: cada uma guarda a sua versão e a viva não é oferecida para recuperar', async ({ app, page }, info) => {
    await app.place('Resistor', [-350, -150])
    const second = new (app.constructor as typeof App)(await page.context().newPage(), info)
    await second.setup()
    await second.place('Capacitor', [350, 150])
    await expect.poll(async () => (await saved(app)).filter(version => version.dirty).length, { timeout: 10000 }).toBe(2)

    await second.open()
    const dialog = second.page.getByRole('dialog', { name: 'Recuperar trabalho não salvo' })
    await expect(dialog.locator('tbody tr')).toHaveCount(1)
    await dialog.getByRole('button', { name: 'Abrir' }).click()
    await expect.poll(() => second.page.evaluate(() => Object.values(cm.store.getState().doc.instances).map(instance => instance.title))).toEqual(['C1'])
    expect(await page.evaluate(() => Object.values(cm.store.getState().doc.instances).map(instance => instance.title))).toEqual(['R1'])
    expect(second.issues).toEqual([])
    await second.page.close()
})

test('Armazenamento cheio: o salvamento automático avisa uma vez e a edição continua', async ({ app, page }) => {
    await page.evaluate(() => {
        IDBObjectStore.prototype.put = () => { throw new DOMException('cheio de propósito', 'QuotaExceededError') }
    })
    await app.place('Resistor', [-350, -150])
    await expect.poll(() => app.message(), { timeout: 10000 }).toBe('salvamento automático parado: o armazenamento do navegador está cheio; salve o arquivo para não perder o trabalho')
    await app.place('Capacitor', [350, 150])
    await expect.poll(() => app.count()).toBe(2)
    await page.waitForTimeout(AUTOSAVE_MS)
    expect(await app.message()).not.toMatch(/salvamento automático/)
})

const LEGACY = [
    { name: 'part.legacy_part.fzp', text: '<?xml version="1.0"?><module moduleId="legacy_part"><title>Peça antiga</title><label>X</label><properties><property name="family">legado</property></properties><views><iconView><layers image="breadboard/legacy.svg"><layer layerId="icon"/></layers></iconView><breadboardView><layers image="breadboard/legacy.svg"><layer layerId="breadboard"/></layers></breadboardView></views><connectors/></module>' },
    { name: 'svg.breadboard.legacy.svg', text: '<svg xmlns="http://www.w3.org/2000/svg" width="0.4in" height="0.4in" viewBox="0 0 40 40"><rect id="breadboard" width="40" height="40"/></svg>' }
]

test('Peças do usuário guardadas no localStorage por versões antigas passam para o IndexedDB', async ({ app, page }) => {
    await page.evaluate(([key, files]) => localStorage.setItem(key, JSON.stringify(files)), ['circuitmaster.parts', LEGACY] as const)
    await page.evaluate(() => localStorage.setItem('circuitmaster.mine', JSON.stringify(['legacy_part'])))
    await app.open()
    await expect.poll(() => page.evaluate(() => cm.store.getState().imported.map(entry => entry.moduleId))).toContain('legacy_part')
    expect(await page.evaluate(() => localStorage.getItem('circuitmaster.parts'))).toBeNull()

    await app.open()
    await expect.poll(() => page.evaluate(() => cm.store.getState().imported.map(entry => entry.moduleId))).toContain('legacy_part')
    await page.getByRole('region', { name: 'Peças' }).getByRole('tab', { name: 'Meus itens' }).click()
    await expect(page.getByRole('region', { name: 'Peças' })).toContainText('Peça antiga')
})

test('Abrir um exemplo com alterações pergunta antes; recusar mantém o circuito', async ({ app }) => {
    await app.place('Resistor', [-350, -150])
    await app.menu('Arquivo', 'Exemplos', 'core', 'Button')
    await expect.poll(() => app.asked.length).toBe(1)
    expect(await app.count()).toBe(1)
    app.answers.push(true)
    await app.menu('Arquivo', 'Exemplos', 'core', 'Button')
    await expect.poll(() => app.message()).toBe('Button.fzz aberto')
})

const VIEW_TABS = ['Protoboard', 'Esquemático', 'PCB']
const MENUS     = ['Editar', 'Peça', 'Exibir', 'Roteamento', 'Simulação']

// ITENS HABILITADOS DE UMA LISTA DE MENU ABERTA: [RÓTULO, TEM SUBMENU]
const items = (app: App, level: number) => app.page.locator('.menu-pop').nth(level).evaluate(menu => [...menu.querySelectorAll(':scope > li > button[role=menuitem]:not([disabled])')].map(button => [button.querySelector('.label')?.textContent ?? '', Boolean(button.querySelector('.arrow'))] as [string, boolean]))

// CAMINHOS ATÉ CADA ITEM HABILITADO DE UM MENU, DESCENDO UM NÍVEL DE SUBMENU
const leaves = async (app: App, title: string) => {
    const paths: string[][] = []
    await app.page.getByRole('navigation', { name: 'Menu principal' }).getByRole('button', { name: title, exact: true }).click()

    for (const [item, parent] of await items(app, 0)) {
        if (!parent) {
            paths.push([item])
            continue
        }

        await app.page.getByRole('menuitem').filter({ has: app.page.getByText(item, { exact: true }) }).first().hover()
        paths.push(...(await items(app, 1)).filter(([, nested]) => !nested).map(([leaf]) => [item, leaf]))
    }

    await app.page.keyboard.press('Escape')
    return paths
}

test('Toda ação dos menus com a seleção vazia, nas três vistas, termina sem erro', async ({ app, page }) => {
    test.setTimeout(600000)
    await expect.poll(() => page.evaluate(() => cm.store.getState().indexed.ready), { timeout: 60000 }).toBe(true)
    let done = 0

    for (const tab of VIEW_TABS) {
        for (const title of MENUS) {
            await page.getByRole('tab', { name: tab }).click()
            await page.evaluate(() => cm.store.getState().select([]))

            for (const path of await leaves(app, title)) {
                await page.getByRole('tab', { name: tab }).click()
                await page.evaluate(() => cm.store.getState().select([]))
                await app.menu(title, ...path)
                await page.keyboard.press('Escape')
                await app.paint()
                done += 1
            }
        }
    }

    expect(done).toBeGreaterThan(80)
    await expect(page.getByRole('alert')).toHaveCount(0)
})

test('500 desfazer e refazer seguidos voltam exatamente aos mesmos documentos', async ({ app, page }) => {
    const json  = () => page.evaluate(() => JSON.stringify(cm.store.getState().doc))
    const first = await json()

    for (const [i, name] of ['Resistor', 'Capacitor', 'LED', 'Resistor', 'Capacitor', 'Diodo'].entries())
        await app.place(name, [-450 + 170 * i, -200])

    const last  = await json()
    const steps = await page.evaluate(() => cm.store.getState().past.length)
    expect(steps).toBeGreaterThanOrEqual(6)

    for (let i = 0; i < 500; i++)
        await page.keyboard.press(i < 250 ? 'Control+z' : 'Control+Shift+z')

    expect(await json()).toBe(last)

    for (let i = 0; i < 500; i++) {
        await page.keyboard.press(i % 2 ? 'Control+Shift+z' : 'Control+z')

        if (i === 250)
            expect(await page.evaluate(() => cm.store.getState().past.length)).toBe(steps - 1)
    }

    expect(await json()).toBe(last)
    await page.evaluate(steps => cm.store.getState().jump(-steps), steps)
    expect(await json()).toBe(first)
})

const KINDS = ['png', 'jpg', 'svg', 'pdf', 'etchablePdf', 'etchableSvg', 'gerber', 'pnp', 'bomHtml', 'bomCsv', 'bomPdf', 'ipc', 'xml', 'spice']

const exportAll = async (app: App) => {
    for (const kind of KINDS) {
        await app.page.evaluate(kind => cm.store.getState().exportFile(kind as never), kind)
        expect.soft(await app.message(), kind).not.toMatch(/falha|erro/i)
    }
}

test('O maior exemplo do Fritzing e o projeto vazio: três vistas e todas as exportações', async ({ app, page }) => {
    test.setTimeout(600000)
    await page.evaluate(() => cm.store.getState().openSample('core/Arduino-Shield-Ultra-Simple.fzz'))
    const largest = await page.evaluate(async () => {
        const { samples, openSample } = cm.store.getState()
        let best = ['', 0] as [string, number]

        for (const file of samples.filter(name => !name.includes('obsolete'))) {
            await openSample(file)
            const count = Object.keys(cm.store.getState().doc.instances).length
            best = count > best[1] ? [file, count] : best
        }

        await openSample(best[0])
        return best
    })
    expect(largest[1]).toBeGreaterThan(50)

    for (const tab of VIEW_TABS) {
        await page.getByRole('tab', { name: tab }).click()
        await app.paint()
        await exportAll(app)
    }

    app.answers.push(true)
    await page.evaluate(() => cm.store.getState().newSketch())
    expect(await app.count()).toBe(0)

    for (const tab of VIEW_TABS) {
        await page.getByRole('tab', { name: tab }).click()
        await exportAll(app)
    }
})

test('Sem rede no meio da sessão: editar, simular e salvar seguem; peça nova e exemplo explicam a falta de rede', async ({ app, page, context }) => {
    await expect.poll(() => page.evaluate(() => cm.store.getState().indexed.ready), { timeout: 60000 }).toBe(true)
    await page.getByRole('tab', { name: 'Esquemático' }).click()
    await app.place('Resistor', [-350, -150])
    await app.menu('Simulação', 'Simular')
    await expect.poll(() => app.simulated()).not.toBe('busy')

    await context.setOffline(true)
    await app.place('Resistor', [-150, -150])
    await page.evaluate(() => cm.store.getState().addPart('generic_female_pin_header_2_100mil', [0, 0]))
    await page.evaluate(() => cm.store.getState().addPart('arduino_Uno_Rev3(fix)', [200, 0]))
    await page.evaluate(() => cm.store.getState().openSample('core/Button.fzz'))
    await expect.poll(() => app.message()).toMatch(/sem rede/)
    const file = await app.download(() => app.menu('Arquivo', 'Salvar'))
    expect(file.name).toMatch(/\.fzz$/)
    await context.setOffline(false)

    expected(app, [/ERR_INTERNET_DISCONNECTED|NS_ERROR_OFFLINE|NetworkError|Failed to fetch/])
})

test('Histórico de desfazer: cada passo com nome, um clique volta a qualquer passo e outro refaz', async ({ app, page }) => {
    const [first] = await circuit(app)
    await page.mouse.click(...await app.center(first))
    await page.keyboard.press(']')
    await app.menu('Editar', 'Histórico de desfazer')

    const list   = page.getByRole('list', { name: 'Histórico de desfazer' })
    const labels = () => list.locator('.grow').allTextContents()
    await expect.poll(labels).toEqual(expect.arrayContaining(['girou R1', 'desenhou fio', 'adicionou R2', 'adicionou R1', 'início (sketch aberto ou novo)']))
    expect((await labels())[0]).toBe('girou R1')
    await expect(list.locator('[aria-current="step"]')).toContainText('girou R1')
    await app.shoot('historico')

    const total = await app.count()
    await list.getByRole('button', { name: /adicionou R1/ }).click()
    await expect.poll(() => app.count()).toBe(1)
    await expect(list.locator('[aria-current="step"]')).toContainText('adicionou R1')
    await list.getByRole('button', { name: /girou R1/ }).click()
    await expect.poll(() => app.count()).toBe(total)
    expect(await app.angle(first)).toBe(90)
})

const OUTSIDE = 50    // .fzp QUE O APP BUSCA FORA DO INDEXADOR AO ABRIR (PEÇAS SUGERIDAS QUE A BIBLIOTECA CARREGA)

const cached = (app: App) => app.page.evaluate(() => new Promise<number>(resolve => {
    const request = indexedDB.open('circuitmaster')
    request.onsuccess = () => {
        const db = request.result

        if (!db.objectStoreNames.contains('parts'))
            return resolve(0)

        const count = db.transaction('parts', 'readonly').objectStore('parts').count()
        count.onsuccess = () => {
            db.close()
            resolve(count.result)
        }
    }
}))

test('Recarregar durante a primeira indexação aproveita as peças já lidas', async ({ app, page }) => {
    const fetched: string[] = []
    await page.evaluate(() => indexedDB.deleteDatabase('circuitmaster'))
    await page.route('**/fritzing/**/*.fzp', async route => {
        fetched.push(route.request().url())
        await new Promise(resolve => setTimeout(resolve, 20))
        await route.continue()
    })
    await app.open()
    await expect.poll(() => cached(app), { timeout: 60000, intervals: [100] }).toBeGreaterThanOrEqual(1000)
    expect(await page.evaluate(() => cm.store.getState().indexed.ready)).toBe(false)
    const kept = await cached(app)
    fetched.length = 0

    await app.open()
    await expect.poll(() => page.evaluate(() => cm.store.getState().indexed.ready), { timeout: 120000 }).toBe(true)
    const total = await page.evaluate(() => cm.store.getState().indexed.total)
    expect(fetched.length).toBeLessThanOrEqual(total - kept + OUTSIDE)
})
