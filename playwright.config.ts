import { defineConfig } from '@playwright/test'

// Ende-zu-Ende-Tests gegen den Build im Modus e2e (mit window.__booktime), in echtem Chromium mit WebGL
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  // Software-WebGL ist rechenintensiv, mehr parallele Browser führen zu Zeitüberschreitungen
  workers: 2,
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4174/BookTime/',
    viewport: { width: 1400, height: 880 },
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build:e2e && npx vite preview --mode e2e --outDir dist-e2e --port 4174 --strictPort',
    url: 'http://localhost:4174/BookTime/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
