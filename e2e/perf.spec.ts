import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { test, expect, type Page } from '@playwright/test'
import { App, SAMPLES } from './Fixtures'
import { emptyDoc, keyOf, type Doc } from '../src/core/Document'
import { exportBundle } from '../src/core/Sketch'
import { createInstance, createWire } from '../src/engine/Edit'
import { makeLibrary } from '../tests/Fixtures'

type Row = { name: string, value: number, unit: string, budget: number | null, below: boolean, phase: number | null }

const REPORT   = 'build/perf-report.txt'
const GRID     = 'build/perf/grade-1000.fzz'
const SAMPLE   = path.join(SAMPLES, 'core/Button.fzz')
const PARTS    = ['ResistorModuleID', '100milCeramicCapacitorModuleID', 'LED-genedb611bf8177f41ac9c325217070f0c62ColorLEDModuleID', '1001AAAB555Timer', 'NPN-to92-ebc']
const COLUMNS  = 40
const ROWS     = 25    // 40 × 25 = 1.000 FOOTPRINTS, O LIMITE DO ORÇAMENTO DE 60 FPS
const PITCH    = { breadboardView: 160, schematicView: 160, pcbView: 72 }
const QUERIES  = ['resistor', 'capacitor ceramico', 'arduino uno', 'led vermelho', 'sensor de temperatura', 'fonte']
const GESTURE  = 90     // QUADROS DE CADA GESTO (1,5 S A 60 HZ)
const REOPENS  = 10
const MB       = 1024 * 1024

// ORÇAMENTOS DA SEÇÃO 8 DO PLANO; jsInitial É O TAMANHO MEDIDO NA FASE 0 (693 KB), QUE NÃO PODE CRESCER
const BUDGET = { open: 3000, fps: 55, frame: 50, task: 50, memory: 1024, growth: 20, search: 50, jsInitial: 710 * 1024 }
const LATER  = 7    // FASE EM QUE O ORÇAMENTO DE TAREFA LONGA PASSA A VALER PARA ABRIR E DESENHAR 1.000 PEÇAS

const rows: Row[] = []

const record = (name: string, value: number, unit: string, budget: number | null, below = true, phase: number | null = null) => rows.push({ name, value, unit, budget, below, phase })

const passed = (row: Row) => row.budget === null || row.phase !== null || (row.below ? row.value <= row.budget : row.value >= row.budget)

const limit = (row: Row) => row.budget === null ? '' : `${row.phase ? `fase ${row.phase}: ` : ''}${row.below ? '≤' : '≥'} ${row.budget}`

// SKETCH SINTÉTICO COM 1.000 PEÇAS EM GRADE NAS TRÊS VISTAS, CADA UMA LIGADA À SEGUINTE POR UM FIO DA PROTOBOARD
const buildGrid = async () => {
    const library = makeLibrary()
    await library.load(['WireModuleID', ...PARTS])
    const at  = (i: number, view: keyof typeof PITCH): [number, number] => [(i % COLUMNS) * PITCH[view], Math.floor(i / COLUMNS) * PITCH[view]]
    const doc = Array.from({ length: COLUMNS * ROWS }).reduce<Doc>((current, _, i) => createInstance(current, library, PARTS[i % PARTS.length], { breadboardView: at(i, 'breadboardView'), schematicView: at(i, 'schematicView'), pcbView: at(i, 'pcbView') }), emptyDoc())
    const parts  = Object.values(doc.instances)
    const linked = parts.slice(1).reduce((current, instance, i) => {
        const before = library.getPart(parts[i].moduleIdRef)?.connectors.at(-1)?.id
        const after  = library.getPart(instance.moduleIdRef)?.connectors[0]?.id
        return before && after ? createWire(current, library, 'breadboardView', keyOf(parts[i].modelIndex, before), keyOf(instance.modelIndex, after)) : current
    }, doc)
    fs.mkdirSync(path.dirname(GRID), { recursive: true })
    fs.writeFileSync(GRID, exportBundle(linked, 'grade-1000', []))
}

const initialScripts = () => {
    const html  = fs.readFileSync('dist/index.html', 'utf8')
    const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map(match => path.join('dist', match[1]))
    return { bytes: files.reduce((sum, file) => sum + fs.statSync(file).size, 0), gzip: files.reduce((sum, file) => sum + zlib.gzipSync(fs.readFileSync(file)).length, 0), files: files.length }
}

const button = (page: Page, name: string) => page.waitForFunction(name => {
    const found = [...document.querySelectorAll('button')].find(element => element.textContent?.trim() === name)
    return found && !found.disabled ? performance.now() : null
}, name, { timeout: 60000 }).then(handle => handle.jsonValue() as Promise<number>)

const status = (page: Page, pattern: RegExp) => page.waitForFunction(source => new RegExp(source).test(document.querySelector('.msg')?.textContent ?? '') ? performance.now() : null, pattern.source, { timeout: 600000 }).then(handle => handle.jsonValue() as Promise<number>)

// IDA E VOLTA DA BUSCA PELO CAMPO DA BIBLIOTECA: DO VALOR DIGITADO ATÉ OS RESULTADOS NA TELA
const searchTime = (page: Page, text: string) => page.evaluate(text => new Promise<number>(resolve => {
    const input    = document.querySelector('input[aria-label="Buscar peça"]') as HTMLInputElement
    const panel    = input.closest('section') as HTMLElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    const observer = new MutationObserver(() => {
        if (!panel.querySelector('.results button'))
            return

        observer.disconnect()
        resolve(performance.now() - started)
    })
    observer.observe(panel, { childList: true, subtree: true })
    const started = performance.now()
    setValue?.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
}), text)

// LIMPA PELO MESMO SETTER NATIVO DO searchTime: DEPOIS DELE O fill DO PLAYWRIGHT PODE NÃO SER VISTO PELO React E O TEXTO VOLTA NA RENDERIZAÇÃO SEGUINTE
const clearSearch = async (page: Page) => {
    await page.evaluate(() => {
        const input = document.querySelector('input[aria-label="Buscar peça"]') as HTMLInputElement
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '')
        input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await expect(page.locator('.lp .results button')).toHaveCount(0)
}

const startFrames = (page: Page) => page.evaluate(() => {
    const perf = { frames: [] as number[], tasks: [] as number[], stop: false }
    const loop = (time: number) => {
        perf.frames.push(time)

        if (!perf.stop)
            requestAnimationFrame(loop)
    }
    new PerformanceObserver(list => perf.tasks.push(...list.getEntries().map(entry => entry.duration))).observe({ type: 'longtask' })
    Object.assign(window, { perf })
    requestAnimationFrame(loop)
})

const stopFrames = (page: Page) => page.evaluate(() => {
    const { perf } = window as unknown as { perf: { frames: number[], tasks: number[], stop: boolean } }
    perf.stop = true
    const gaps = perf.frames.slice(1).map((time, i) => time - perf.frames[i])
    return { fps: 1000 * gaps.length / ((perf.frames.at(-1) ?? 0) - perf.frames[0]), frame: Math.max(...gaps), task: Math.max(0, ...perf.tasks) }
})

const frame = (page: Page) => page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)))

const heap = async (page: Page) => {
    const client = await page.context().newCDPSession(page)
    await client.send('Performance.enable')
    await client.send('HeapProfiler.collectGarbage')
    const { metrics } = await client.send('Performance.getMetrics')
    await client.detach()
    return (metrics.find(metric => metric.name === 'JSHeapUsedSize')?.value ?? 0) / MB
}

const writeReport = (info: string[]) => {
    const lines = rows.map(row => `${row.phase && !(row.below ? row.value <= (row.budget ?? 0) : row.value >= (row.budget ?? 0)) ? 'depois' : passed(row) ? 'ok    ' : 'FALHA '}  ${row.name.padEnd(56)} ${row.value.toFixed(row.unit === 'fps' ? 1 : 0).padStart(9)} ${row.unit.padEnd(4)} ${limit(row)}`)
    fs.writeFileSync(REPORT, [...info, '', ...lines, ''].join('\n'))
}


test.describe.configure({ mode: 'serial' })

test('Desempenho: abertura, busca, pan e zoom com 1.000 footprints, memória e JS inicial', async ({ page, browser }, info) => {
    const app = new App(page, info)
    app.watch()
    await buildGrid()

    await page.goto('/')
    record('Abertura com o cache vazio (até o Simular)', await button(page, 'Simular'), 'ms', BUDGET.open)
    record('Indexação do acervo do Fritzing (cache vazio)', await status(page, /peças indexadas$/), 'ms', null)

    await page.reload()
    record('Segunda abertura (índice no IndexedDB)', await button(page, 'Simular'), 'ms', BUDGET.open)
    await status(page, /peças indexadas$/)

    const searches = []

    for (const query of QUERIES) {
        await clearSearch(page)
        searches.push(await searchTime(page, query))
    }

    record(`Busca no acervo (pior de ${QUERIES.length} termos)`, Math.max(...searches), 'ms', BUDGET.search)
    await clearSearch(page)

    await startFrames(page)
    const chosen = await page.evaluate(() => performance.now())
    await page.locator('#open-file').setInputFiles(GRID)
    record('Abrir a grade de 1.000 peças (até a mensagem)', await status(page, /grade-1000\.fzz aberto$/) - chosen, 'ms', null)
    await frame(page)
    record('Abrir a grade: tarefa mais longa', (await stopFrames(page)).task, 'ms', BUDGET.task, true, LATER)

    await startFrames(page)
    await page.getByRole('tab', { name: 'PCB' }).click()
    await expect.poll(() => page.locator('#canvas g[data-index]').count()).toBeGreaterThanOrEqual(COLUMNS * ROWS)
    await frame(page)
    record('Trocar para a PCB com 1.000 peças: tarefa mais longa', (await stopFrames(page)).task, 'ms', BUDGET.task, true, LATER)

    const canvas = await page.locator('#canvas').boundingBox()
    const [cx, cy] = [(canvas?.x ?? 0) + (canvas?.width ?? 0) / 2, (canvas?.y ?? 0) + (canvas?.height ?? 0) / 2]

    await startFrames(page)
    await page.mouse.move(cx, cy)
    await page.mouse.down({ button: 'middle' })

    for (let i = 0; i < GESTURE; i++) {
        await page.mouse.move(cx + 6 * i, cy + 3 * i)
        await frame(page)
    }

    await page.mouse.up({ button: 'middle' })
    const pan = await stopFrames(page)
    record('Pan na PCB com 1.000 footprints (média)', pan.fps, 'fps', BUDGET.fps, false)
    record('Pan: quadro mais longo', pan.frame, 'ms', BUDGET.frame)
    record('Pan: tarefa mais longa na thread da interface', pan.task, 'ms', BUDGET.task)

    await startFrames(page)

    for (let i = 0; i < GESTURE; i++) {
        await page.mouse.wheel(0, i < GESTURE / 2 ? -40 : 40)
        await frame(page)
    }

    const zoom = await stopFrames(page)
    record('Zoom na PCB com 1.000 footprints (média)', zoom.fps, 'fps', BUDGET.fps, false)
    record('Zoom: quadro mais longo', zoom.frame, 'ms', BUDGET.frame)
    record('Zoom: tarefa mais longa na thread da interface', zoom.task, 'ms', BUDGET.task)

    for (const view of ['Esquemático', 'Protoboard'])
        await page.getByRole('tab', { name: view }).click()

    await frame(page)
    record('Memória (heap JS) com 1.000 peças nas três vistas', await heap(page), 'MB', BUDGET.memory)

    const fresh  = await browser.newPage()
    const reopen = new App(fresh, info)
    reopen.watch()
    await fresh.goto('/')
    await button(fresh, 'Simular')
    const sizes = []

    for (let i = 0; i < REOPENS; i++) {
        await fresh.locator('#open-file').setInputFiles(SAMPLE)
        await status(fresh, /Button\.fzz aberto$/)
        await frame(fresh)
        sizes.push(await heap(fresh))
    }

    record(`Memória: crescimento ao reabrir um exemplo ${REOPENS} vezes`, (sizes.at(-1) ?? 0) - sizes[1], 'MB', BUDGET.growth)
    await fresh.close()

    const scripts = initialScripts()
    record(`JavaScript inicial (${scripts.files} arquivos, sem compressão)`, scripts.bytes / 1024, 'KB', BUDGET.jsInitial / 1024)
    record('JavaScript inicial (gzip)', scripts.gzip / 1024, 'KB', null)

    writeReport([
        'CircuitMaster: desempenho (FRIZING_KICAD §8), build de produção servido pelo vite preview',
        `máquina: ${os.cpus()[0]?.model} × ${os.cpus().length}, ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB; ${browser.browserType().name()} ${browser.version()}`,
        `grade sintética: ${COLUMNS * ROWS} peças (${PARTS.length} tipos) e ${COLUMNS * ROWS - 1} fios; os demos do KiCad (jetson-agx-thor-baseboard, vme-wren) entram na fase 7`
    ])

    expect([...app.issues, ...reopen.issues], 'erros de console, página ou rede').toEqual([])
    expect(rows.filter(row => !passed(row)).map(row => `${row.name}: ${row.value.toFixed(1)} ${row.unit}`), REPORT).toEqual([])
})
