import { getListings } from '../tools/Fritzing'
import { test, expect } from './Fixtures'

const CHUNK   = 16
const VIEWS   = ['breadboardView', 'schematicView', 'pcbView'] as const
const samples = getListings()['sketches.json']
const chunks  = Array.from({ length: Math.ceil(samples.length / CHUNK) }, (_, i) => samples.slice(i * CHUNK, (i + 1) * CHUNK))

for (const [i, files] of chunks.entries())
    test(`exemplos do Fritzing ${i * CHUNK + 1}–${i * CHUNK + files.length}: três vistas e exportação`, async ({ app, page }) => {
        for (const file of files) {
            await page.evaluate(file => cm.store.getState().openSample(file), file)
            expect.soft(await app.message(), file).toMatch(/ aberto$/)

            for (const view of VIEWS) {
                await page.evaluate(view => cm.store.getState().setView(view), view)
                await app.paint()
            }

            const netlist = await app.download(() => page.evaluate(() => cm.store.getState().exportFile('xml')))
            expect.soft(netlist.bytes.toString(), file).toContain('<netlist')
            expect.soft(await app.message(), file).not.toMatch(/^falha/)
        }
    })

test('Arquivo › Exemplos abre um exemplo pelo menu', async ({ app, page }) => {
    await app.menu('Arquivo', 'Exemplos', 'core', 'Button')
    await expect.poll(() => app.message()).toBe('Button.fzz aberto')
    expect(await app.count()).toBeGreaterThan(0)
    await expect(page.getByRole('heading', { name: 'Button' })).toBeVisible()
})
