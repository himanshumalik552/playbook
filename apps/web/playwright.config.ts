import { defineConfig, devices } from '@playwright/test';

const API_PORT = process.env.E2E_API_PORT ?? '3000';
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

/**
 * End-to-end tests run against a migrated and seeded database with INTEGRATION_MODE=mock.
 * Both servers are reused when already running (e.g. `pnpm dev`); otherwise the built API and the Vite dev server are started.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    timezoneId: 'UTC',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'pnpm --filter @adpulse/api start',
          url: `http://localhost:${API_PORT}/api/v1/health/live`,
          env: { API_PORT },
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command: 'pnpm --filter @adpulse/web dev',
          url: BASE_URL,
          env: { VITE_API_PROXY_TARGET: `http://localhost:${API_PORT}` },
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
});
