import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// Ports deliberately off the dev stand's 3000/3001 so a run does not collide with — or get proxied
// into — a stand the developer already has open. Overridable because --strictPort makes the pair
// exclusive: two runs on one machine (a second checkout, a watch alongside a full run) need their own.
const WEB_PORT = Number(process.env.ARXHUB_E2E_WEB_PORT ?? 3100)
const API_PORT = Number(process.env.ARXHUB_E2E_API_PORT ?? 3101)

// A throwaway vault per run. The stand persists the TOFU pin of the first key that reaches it, so
// pointing it at the real ~/ArxHub would unpair the developer's actual devices.
// Each worker re-loads this config, so creating the directory unconditionally would give every
// worker its own — and the vault fixture would write where the stand is not looking. The runner
// creates it once and workers inherit the path through the environment.
const dataDir = process.env.ARXHUB_E2E_DATA_DIR ?? mkdtempSync(join(tmpdir(), 'arxhub-e2e-'))
process.env.ARXHUB_E2E_DATA_DIR = dataDir

export default defineConfig({
  testDir: './tests',
  // Boots the app once per frame before any test, so the dev server's dependency pre-bundling settles
  // while nothing is on screen to lose. See global-setup.ts — a re-optimization mid-run reloads every
  // connected page at once, and a test asserting at that moment reports the app as never having come up.
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  // Every worker drives the SAME stand and the same vault (one data dir per run, see globalSetup), so
  // parallelism here is contention on one repo store, not throughput: the history specs write the
  // repo head through a store with no compare-and-swap, and from four workers up they orphan each
  // other's checkpoints and time out; at two the whole suite is clean, measured twice. Not a per-spec
  // setting — the sharing is the suite's, and so is the cap. Speed comes back when each worker gets
  // its own store, not from raising this.
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  // Both frames are the same app at different widths, so both run the same specs. A spec that only
  // makes sense in one frame asks the DOM which frame it got (isMobileFrame) and skips itself on the
  // other — never the project name, because which frame mounted is the app's decision and re-deriving
  // it here would be a second copy of that rule.
  //
  // testIgnore is for the other reason a spec runs once: not the frame, but the stand. The two projects
  // share one vault, so a spec that writes a config file the whole app reads cannot run twice over it.
  // Naming those files here rather than skipping inside them also stops the run from booting a page per
  // test only to throw it away.
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      // The active theme is one shared setting, and the settings specs stage and apply plugin config
      // files. Neither has anything to do with the frame; both would race the desktop project.
      testIgnore: ['**/themes.spec.ts', '**/settings-save.spec.ts'],
    },
  ],

  webServer: {
    // --force: the optimizer cache is shared with whatever the developer has been running, and a run
    // that starts from a partial one discovers the rest mid-suite (see global-setup.ts). A run of its
    // own gets a scan of its own, the same reasoning as the throwaway data dir and the private ports.
    command: `pnpm --filter @arxhub/dev exec vite --port ${WEB_PORT} --strictPort --force`,
    url: `http://localhost:${WEB_PORT}`,
    cwd: '..',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    // ARXHUB_FROZEN_STAND: no file watching, no HMR. The source does not change during a run, and a
    // stand that reloads every page when it does is the difference between a suite and an editing
    // session — see instances/dev/vite.config.ts.
    env: { ARXHUB_DATA_DIR: dataDir, ARXHUB_PORT: String(API_PORT), ARXHUB_FROZEN_STAND: '1' },
  },
})
