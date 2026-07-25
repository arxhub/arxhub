import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// Ports deliberately off the dev stand's 3000/3001 so a run does not collide with — or get proxied
// into — a stand the developer already has open.
const WEB_PORT = 3100
const API_PORT = 3101

// A throwaway vault per run. The stand persists the TOFU pin of the first key that reaches it, so
// pointing it at the real ~/.arxhub would unpair the developer's actual devices.
// Each worker re-loads this config, so creating the directory unconditionally would give every
// worker its own — and the vault fixture would write where the stand is not looking. The runner
// creates it once and workers inherit the path through the environment.
const dataDir = process.env.ARXHUB_E2E_DATA_DIR ?? mkdtempSync(join(tmpdir(), 'arxhub-e2e-'))
process.env.ARXHUB_E2E_DATA_DIR = dataDir

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  // Both frames are the same app at different widths, so both run the same specs. A spec that only
  // makes sense in one frame skips itself on the other.
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  webServer: {
    command: `pnpm --filter @arxhub/dev exec vite --port ${WEB_PORT} --strictPort`,
    url: `http://localhost:${WEB_PORT}`,
    cwd: '..',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ARXHUB_DATA_DIR: dataDir, ARXHUB_PORT: String(API_PORT) },
  },
})
