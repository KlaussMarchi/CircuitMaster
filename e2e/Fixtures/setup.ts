import { chromium, firefox } from '@playwright/test'

export const STATES = { chromium: 'build/e2e/state-chromium.json', firefox: 'build/e2e/state-firefox.json' }

// O ÍNDICE DO ACERVO MONTADO UMA VEZ POR NAVEGADOR E ENTREGUE A CADA CONTEXTO DE TESTE, COMO O DE QUEM VOLTA AO APP; O CAMINHO FRIO FICA COM O perf E COM "Refazer o índice"
export default async ({ projects }: { projects: { use: { baseURL?: string } }[] }) => {
    const baseURL = projects[0]?.use.baseURL ?? ''

    for (const [name, type] of [['chromium', chromium], ['firefox', firefox]] as const) {
        const browser = await type.launch()
        const context = await browser.newContext()
        const page    = await context.newPage()
        await page.goto(baseURL)
        await page.waitForFunction(() => /peças indexadas$/.test(document.querySelector('.msg')?.textContent ?? ''), null, { timeout: 300000 })
        await context.storageState({ path: STATES[name], indexedDB: true })
        await browser.close()
    }
}
