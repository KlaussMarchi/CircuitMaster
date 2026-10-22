import { defineConfig, devices } from '@playwright/test'

const PORT     = 5210
const VIEWPORT = { width: 1920, height: 1080 }

export default defineConfig({
    testDir: 'e2e',
    testIgnore: /(perf|soak)\.spec/,
    outputDir: 'build/e2e',
    timeout: 180000,
    expect: { timeout: 15000 },
    workers: 4,
    fullyParallel: true,
    reporter: [['list']],
    use: { baseURL: `http://localhost:${PORT}`, viewport: VIEWPORT, acceptDownloads: true, actionTimeout: 15000 },
    webServer: { command: `npx vite --port ${PORT} --strictPort`, url: `http://localhost:${PORT}`, reuseExistingServer: false, timeout: 120000 },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: VIEWPORT } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: VIEWPORT } }
    ]
})
