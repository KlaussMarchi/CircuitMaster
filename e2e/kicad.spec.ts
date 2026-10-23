import { test, expect } from './Fixtures'

// O ACERVO DO KICAD SERVIDO COMO DADOS EM /kicad, COMO O DO FRITZING (SPEC 07 §1)
test('Acervo do KiCad em /kicad: listagens, um símbolo, um footprint e um demo, sem sair das raízes', async ({ page }) => {
    const json = async (name: string) => (await page.request.get(`/kicad/${name}`)).json() as Promise<string[]>
    const symbols    = await json('symbols.json')
    const footprints = await json('footprints.json')
    const demos      = await json('demos.json')

    expect(symbols.length).toBeGreaterThan(20000)
    expect(footprints.length).toBeGreaterThan(15000)
    expect(demos.some(file => file.endsWith('.kicad_pcb'))).toBe(true)
    expect(await (await page.request.get(`/kicad/symbols/${symbols.find(file => file.endsWith('Device.kicad_symdir/R.kicad_sym'))}`)).text()).toMatch(/^\(kicad_symbol_lib/)
    expect(await (await page.request.get(`/kicad/footprints/${footprints[0]}`)).text()).toMatch(/^\(footprint/)
    expect(await (await page.request.get('/kicad/demos/%2E%2E/LICENSE.GPLv3')).text()).not.toContain('GNU GENERAL PUBLIC LICENSE')
})
