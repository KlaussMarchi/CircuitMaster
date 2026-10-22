import { defineConfig, devices } from '@playwright/test'

const PORT = 5211

// DESEMPENHO MEDIDO NO BUILD DE PRODUÇÃO (dist/), SERVIDO PELO vite preview COM O ACERVO EM /fritzing
export default defineConfig({
    testDir: 'e2e',
    testMatch: /perf\.spec/,
    outputDir: 'build/perf',
    timeout: 900000,
    expect: { timeout: 60000 },
    workers: 1,
    reporter: [['list']],
    use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PORT}`, viewport: { width: 1920, height: 1080 } },
    webServer: { command: `npx vite preview --port ${PORT} --strictPort`, url: `http://localhost:${PORT}`, reuseExistingServer: false, timeout: 120000 }
})
