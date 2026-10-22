import { defineConfig, devices } from '@playwright/test'

const PORT = 5212

// MEIA HORA DE EDIÇÃO AUTOMATIZADA NO SERVIDOR DE DESENVOLVIMENTO (O FIXTURE LÊ O STORE), SEPARADA DO VERIFY PELA DURAÇÃO
export default defineConfig({
    testDir: 'e2e',
    testMatch: /soak\.spec/,
    outputDir: 'build/soak',
    timeout: 45 * 60000,
    expect: { timeout: 30000 },
    workers: 1,
    reporter: [['list']],
    use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PORT}`, viewport: { width: 1920, height: 1080 }, actionTimeout: 15000 },
    webServer: { command: `npx vite --port ${PORT} --strictPort`, url: `http://localhost:${PORT}`, reuseExistingServer: false, timeout: 120000 }
})
