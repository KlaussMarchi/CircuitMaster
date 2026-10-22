import { unzipSync } from 'fflate'
import { test, expect } from './Fixtures'

const IMAGES: [string, RegExp, string][] = [['PNG…', /\.png$/, '\x89PNG'], ['JPG…', /\.jpg$/, '\xff\xd8\xff'], ['SVG…', /\.svg$/, '<svg'], ['PDF…', /\.pdf$/, '%PDF']]

const LISTS: [string, RegExp, RegExp][] = [
    ['Lista de materiais (HTML)…', /_bom\.html$/, /<html[\s\S]*Resistor/i],
    ['Lista de materiais (CSV)…', /_bom\.csv$/, /Resistor/],
    ['Lista de materiais (PDF)…', /_bom\.pdf$/, /^%PDF/],
    ['Netlist IPC-D-356A…', /\.ipc$/, /^C {2}CircuitMaster[\s\S]*999\s*$/],
    ['Netlist XML…', /_netlist\.xml$/, /<netlist[\s\S]*<net>/],
    ['Netlist SPICE…', /\.cir$/, /^R[\s\S]*\.end/im]
]

const GERBER = [/_copperTop\.gtl$/, /_copperBottom\.gbl$/, /_contour\.gm1$/, /_drill\.txt$/, /_pnp\.xy$/]

test('Exportar: imagens, produção com placa, listas e netlists', async ({ app, page }) => {
    const first  = await app.place('Resistor', [-300, -100])
    const second = await app.place('Resistor', [0, 100])
    await app.wire((await app.pins(first))['Pin 1'], (await app.pins(second))['Pin 0'])

    for (const [label, name, head] of IMAGES) {
        const file = await app.download(() => app.menu('Arquivo', 'Exportar', 'Como imagem', label))
        expect(file.name).toMatch(name)
        expect(file.bytes.subarray(0, 4).toString('latin1')).toContain(head.slice(0, 3))
    }

    await page.getByRole('tab', { name: 'PCB' }).click()
    await app.menu('Arquivo', 'Exportar', 'Para produção')
    await expect(page.getByRole('menuitem', { name: 'Gerber estendido (RS-274X)…' })).toBeDisabled()
    await page.keyboard.press('Escape')

    await page.getByRole('complementary', { name: 'Inspetor' }).getByRole('tab', { name: 'Roteamento' }).click()
    await page.getByRole('button', { name: 'Criar placa e rotear' }).click()
    await expect.poll(() => page.evaluate(() => cm.store.getState().netlist?.getStatus('pcbView').left), { timeout: 60000 }).toBe(0)

    const gerber = await app.download(() => app.menu('Arquivo', 'Exportar', 'Para produção', 'Gerber estendido (RS-274X)…'))
    expect(gerber.name).toMatch(/_gerber\.zip$/)
    const names = Object.keys(unzipSync(gerber.bytes))
    for (const pattern of GERBER)
        expect(names.some(name => pattern.test(name)), String(pattern)).toBe(true)

    for (const [label, suffix] of [['Gravável (PDF)…', /_etch_pdf\.zip$/], ['Gravável (SVG)…', /_etch_svg\.zip$/]] as const) {
        const file = await app.download(() => app.menu('Arquivo', 'Exportar', 'Para produção', label))
        expect(file.name).toMatch(suffix)
        expect(Object.keys(unzipSync(file.bytes)).length).toBeGreaterThan(0)
    }

    const all   = await app.download(() => app.menu('Arquivo', 'Exportar', 'Para produção', 'Tudo para fabricar (zip)…'))
    const files = Object.keys(unzipSync(all.bytes))
    expect(all.name).toMatch(/_producao\.zip$/)
    for (const pattern of [...GERBER, /\.ipc$/, /_bom\.csv$/, /_bom\.html$/])
        expect(files.some(name => pattern.test(name)), String(pattern)).toBe(true)

    const pnp = await app.download(() => app.menu('Arquivo', 'Exportar', 'Para produção', 'Pick-and-place…'))
    expect(pnp.bytes.toString()).toMatch(/^# Pick And Place List/)

    for (const [label, name, body] of LISTS) {
        const file = await app.download(() => app.menu('Arquivo', 'Exportar', label))
        expect(file.name).toMatch(name)
        expect(file.bytes.toString('latin1')).toMatch(body)
    }
})
