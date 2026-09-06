import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const backend = path.resolve(root, '../backend')

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command:
        'python -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000',
      cwd: backend,
      url: 'http://127.0.0.1:8000/api/v1/health/live',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        VOXFLOW_TASK_FAKE_LATENCY_SCALE: process.env.VOXFLOW_TASK_FAKE_LATENCY_SCALE ?? '0.05',
        VOXFLOW_TASK_MAX_CONCURRENCY: process.env.VOXFLOW_TASK_MAX_CONCURRENCY ?? '2',
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173',
      cwd: root,
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
