import fs from 'node:fs'
import path from 'node:path'
import { test as base, expect, type Page, type TestInfo } from '@playwright/test'
import type { Point } from '../../src/core/Geometry'
import type { Scene } from '../../src/engine/Scene'
import type { useStore } from '../../src/ui/Store'

declare global {
    var cm: { store: typeof useStore, Scene: typeof Scene }
}

export { expect }

export const FRITZING = process.env.FRITZING_ROOT ?? path.resolve(import.meta.dirname, '../../../Fritzing')
export const SAMPLES  = path.join(FRITZING, 'fritzing-app/sketches')
export const SHOTS    = 'build/ui'
export const WIDTHS   = [1920, 1280, 390]
export const AUTOSAVE_MS = 2000    // MAIS QUE O ATRASO DO SALVAMENTO AUTOMÁTICO: A RECARGA SEMPRE OFERECE RECUPERAR

type Answer = boolean | string

const ABORTED   = ['net::ERR_ABORTED', 'NS_BINDING_ABORTED']    // REQUISIÇÕES DA PÁGINA ANTERIOR CANCELADAS PELA NAVEGAÇÃO
const ABORTED_MODULE = /^\[JavaScript Warning: "Loading failed for the module/    // O FIREFOX AVISA DO MÓDULO QUE A NAVEGAÇÃO INTERROMPEU (A PRÉ-CARGA DE ui/Output DEPOIS DO setup)
const SETTLE_MS = 300                                           // O QUE A PÁGINA AINDA LOGA DEPOIS DA ÚLTIMA AÇÃO DO TESTE TAMBÉM CONTA

// O AVISO DO REACT DE setState DURANTE O RENDER NÃO DIZ QUEM CHAMOU: A MENSAGEM PASSA A LEVAR A PILHA
const traceRenderUpdates = () => {
    const original = console.error
    console.error = (...args: unknown[]) => original(...args, ...String(args[0]).includes('while rendering a different component') ? [new Error().stack] : [])
}

// NA PRIMEIRA ABERTURA DO CONTEXTO: TODOS OS MENUS (MODO PROFISSIONAL) E OS TOURS JÁ VISTOS; RECARREGAR NÃO DESFAZ O QUE O TESTE MUDOU
const defaults = () => {
    if (localStorage.getItem('e2e.defaults'))
        return

    localStorage.setItem('e2e.defaults', '1')
    localStorage.setItem('circuitmaster.level', '3')
    localStorage.setItem('circuitmaster.toured', '[1,2,3]')
}

// O APP NUMA ABA: ABRE, LÊ O ESTADO PELO STORE QUE A PÁGINA CARREGOU E JUNTA TODO ERRO DE CONSOLE, PÁGINA OU REDE
export class App {
    issues: string[]  = []
    answers: Answer[] = []
    asked: string[]   = []
    downloads         = new Set<string>()
    navigating        = false

    constructor(public page: Page, public info: TestInfo) {}

    async setup() {
        this.watch()
        await this.page.addInitScript(traceRenderUpdates)
        await this.page.addInitScript(defaults)
        await this.open()
    }

    watch() {
        this.page.on('console', message => ['error', 'warning'].includes(message.type()) && !(this.navigating && ABORTED_MODULE.test(message.text())) && this.issues.push(`console.${message.type()}: ${message.text()}`))
        this.page.on('pageerror', error => this.issues.push(`pageerror: ${error.message}`))
        this.page.on('requestfailed', request => !this.downloads.has(request.url()) && !(this.navigating && ABORTED.includes(request.failure()?.errorText ?? '')) && this.issues.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`))
        this.page.on('response', response => response.status() >= 400 && this.issues.push(`http ${response.status()}: ${response.url()}`))
        this.page.on('download', download => this.downloads.add(download.url()))
        this.page.on('dialog', dialog => this.answer(dialog))
    }

    answer(dialog: import('@playwright/test').Dialog) {
        const answer = this.answers.shift()
        this.asked.push(dialog.message())

        if (answer === undefined || answer === false)
            return void dialog.dismiss()

        void dialog.accept(typeof answer === 'string' ? answer : undefined)
    }

    async open() {
        await this.reloadedBy(() => this.page.goto('/'))
    }

    // NAVEGAÇÃO PEDIDA PELO TESTE OU PELO PRÓPRIO APP (location.reload): AS CARGAS ABORTADAS NO CAMINHO NÃO CONTAM E O STORE DA PÁGINA NOVA VOLTA A window.cm
    async reloadedBy(action: () => Promise<unknown>) {
        this.navigating = true
        await Promise.all([this.page.waitForEvent('load'), action()])
        this.navigating = false
        await expect(this.page.getByRole('button', { name: /^(Simular|Simulate)$/ })).toBeEnabled()    // A LÍNGUA ESCOLHIDA FICA NA RECARGA
        await this.page.evaluate(async () => {
            const [{ useStore }, { Scene }] = await Promise.all([import('/src/ui/Store/index.ts' as string), import('/src/engine/Scene/index.ts' as string)])
            window.cm = { store: useStore, Scene }
        })
        await expect.poll(() => this.page.evaluate(() => cm.store.getState().ready)).toBe(true)
    }

    count() {
        return this.page.evaluate(() => Object.keys(cm.store.getState().doc.instances).length)
    }

    selection() {
        return this.page.evaluate(() => cm.store.getState().selection)
    }

    state(modelIndex: string) {
        return this.page.evaluate(modelIndex => {
            const { doc, view } = cm.store.getState()
            return doc.instances[modelIndex]?.views[view] ?? null
        }, modelIndex)
    }

    async angle(modelIndex: string) {
        const [a, b] = (await this.state(modelIndex))?.geometry.transform ?? [1, 0]
        return Math.round(Math.atan2(b, a) * 180 / Math.PI)
    }

    viewport() {
        return this.page.evaluate(() => {
            const { viewports, view } = cm.store.getState()
            return viewports[view] ?? null
        })
    }

    async along(wireIndex: string, t: number) {
        const point = await this.page.evaluate(([wireIndex, t]) => {
            const { doc, library, view } = cm.store.getState()
            return new cm.Scene(doc, library, view).getPointOn(wireIndex, t)
        }, [wireIndex, t] as const)
        expect(point, `ponto no fio ${wireIndex}`).not.toBeNull()
        return this.toClient(point as Point)
    }

    wires() {
        return this.page.evaluate(() => Object.values(cm.store.getState().doc.instances).filter(instance => instance.moduleIdRef === 'WireModuleID').map(instance => instance.modelIndex))
    }

    edges() {
        return this.page.evaluate(() => cm.store.getState().doc.edges.length)
    }

    pins(modelIndex: string) {
        return this.page.evaluate(modelIndex => {
            const { doc, library } = cm.store.getState()
            const part = library.getPart(doc.instances[modelIndex]?.moduleIdRef ?? '')
            return Object.fromEntries(part?.connectors.map(connector => [connector.name, `${modelIndex}/${connector.id}`]) ?? [])
        }, modelIndex)
    }

    message() {
        return this.page.evaluate(() => cm.store.getState().message)
    }

    paint() {
        return this.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    }

    simulated() {
        return this.page.evaluate(() => {
            const { busy, result, error } = cm.store.getState().simulation
            return busy ? 'busy' : error ? `erro: ${error}` : result ? (result.isStill() ? 'op' : 'tran') : 'nada'
        })
    }

    async menu(...labels: string[]) {
        const [title, ...items] = labels
        await this.page.getByRole('navigation', { name: 'Menu principal' }).getByRole('button', { name: title, exact: true }).click()
        await this.choose(items)
    }

    async choose(items: string[]) {
        for (const [i, label] of items.entries()) {
            const item = this.page.getByRole('menuitem').filter({ has: this.page.getByText(label, { exact: true }) }).last()
            await (i < items.length - 1 ? item.hover() : item.click())
        }
    }

    async context(point: Point, ...items: string[]) {
        await this.page.mouse.click(point[0], point[1], { button: 'right' })
        await this.choose(items)
    }

    toClient(point: Point) {
        return this.page.evaluate(([x, y]) => {
            const { viewports, view } = cm.store.getState()
            const vp   = viewports[view] ?? { x: 0, y: 0, zoom: 1 }
            const rect = document.getElementById('canvas')?.parentElement?.getBoundingClientRect() ?? new DOMRect()
            return [rect.left + (x - vp.x) * vp.zoom, rect.top + (y - vp.y) * vp.zoom] as Point
        }, point)
    }

    async terminal(key: string) {
        const point = await this.page.evaluate(key => {
            const { doc, library, view } = cm.store.getState()
            return new cm.Scene(doc, library, view).getTerminal(key)
        }, key)
        expect(point, `terminal ${key}`).not.toBeNull()
        return this.toClient(point as Point)
    }

    async center(modelIndex: string) {
        const box = await this.page.evaluate(modelIndex => {
            const { doc, library, view } = cm.store.getState()
            return new cm.Scene(doc, library, view).getBounds(modelIndex)
        }, modelIndex)
        expect(box, `caixa de ${modelIndex}`).not.toBeNull()
        const [x0, y0, x1, y1] = box as [number, number, number, number]
        return this.toClient([(x0 + x1) / 2, (y0 + y1) / 2])
    }

    canvasCenter() {
        return this.page.evaluate(() => {
            const rect = document.getElementById('canvas')?.parentElement?.getBoundingClientRect() ?? new DOMRect()
            return [rect.left + rect.width / 2, rect.top + rect.height / 2] as Point
        })
    }

    async place(name: string, offset: Point = [0, 0]) {
        const before = await this.count()
        const center = await this.canvasCenter()
        await this.page.getByRole('region', { name: 'Peças' }).getByRole('button', { name, exact: true }).click()
        await this.page.mouse.click(center[0] + offset[0], center[1] + offset[1])
        await expect.poll(() => this.count()).toBeGreaterThan(before)
        return this.page.evaluate(() => cm.store.getState().selection[0])
    }

    async wire(from: string, to: string) {
        const before = (await this.wires()).length
        const start  = await this.terminal(from)
        const end    = await this.terminal(to)
        await this.page.mouse.click(start[0], start[1])
        await this.page.mouse.click(end[0], end[1])
        await expect.poll(async () => (await this.wires()).length).toBeGreaterThan(before)
    }

    async download(action: () => Promise<unknown>) {
        const [file] = await Promise.all([this.page.waitForEvent('download'), action()])
        const target = path.join('build/e2e/downloads', this.info.project.name, this.info.testId, file.suggestedFilename())    // UMA PASTA POR TESTE: EM PARALELO, DOIS sem título.fzz NÃO SE SOBRESCREVEM
        await file.saveAs(target)
        return { name: file.suggestedFilename(), path: target, bytes: fs.readFileSync(target) }
    }

    async upload(file: string) {
        await this.page.locator('#open-file').setInputFiles(file)
    }

    async shoot(name: string) {
        await this.page.screenshot({ path: `${SHOTS}/${name}-${this.info.project.name}.png`, animations: 'disabled' })
    }
}


export const test = base.extend<{ app: App }>({
    app: async ({ page }, use, info) => {
        const app = new App(page, info)
        await app.setup()
        await use(app)
        await app.paint()
        await page.waitForTimeout(SETTLE_MS)
        expect(app.issues, 'erros de console, página ou rede').toEqual([])
    }
})
