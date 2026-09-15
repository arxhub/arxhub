import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// Ports deliberately off the dev stand's 3000/3001 so a run does not collide with — or get proxied
// into — a stand the developer already has open. Overridable because --strictPort makes the pair
// exclusive: two runs on one machine (a second checkout, a watch alongside a full run) need their own.
const WEB_PORT = Number(process.env.ARXHUB_E2E_WEB_PORT ?? 3100)
const API_PORT = Number(process.env.ARXHUB_E2E_API_PORT ?? 3101)

// Two stands, not one. They used to share a single dev server and a single vault, which meant every
// worker of both Playwright projects wrote through one repo store with no compare-and-swap on the
// history head — orphaned checkpoints and timeouts above two workers, and the residual flakiness
// below that (see forge-wiki/planning/worklog/2026-09-15.md, the evening entries). A project is the
// right unit of isolation, not a worker: the two frames are already separate runs of the whole suite,
// so each gets its own port pair and its own throwaway data dir, and workers within a project are free
// to share it exactly as before (one worker per project still applies the same repo-store rule the
// comment below the workers setting used to state for the single stand).
//
// Ports: mobile is the desktop pair plus 10 (3110/3111 by default) — one scheme, extend it the same
// way if a third project is ever added.
interface Stand {
  webPort: number
  apiPort: number
  dataDir: string
}

function makeStand(project: 'desktop' | 'mobile', offset: number): Stand {
  const webPort = WEB_PORT + offset
  const apiPort = API_PORT + offset
  // Each worker re-loads this config, so creating the directory unconditionally would give every
  // worker its own — and the vault fixture would write where the stand is not looking. The runner
  // creates it once per project and workers inherit the path through the environment (below), keyed
  // by project name since a worker process only ever serves one project.
  const envKey = `ARXHUB_E2E_DATA_DIR_${project.toUpperCase()}`
  const dataDir = process.env[envKey] ?? mkdtempSync(join(tmpdir(), `arxhub-e2e-${project}-`))
  process.env[envKey] = dataDir
  return { webPort, apiPort, dataDir }
}

const desktopStand = makeStand('desktop', 0)
const mobileStand = makeStand('mobile', 10)

export default defineConfig({
  testDir: './tests',
  // Boots the app once per project's own stand before any test, so each dev server's dependency
  // pre-bundling settles while nothing is on screen to lose. See global-setup.ts — a re-optimization
  // mid-run reloads every connected page at once, and a test asserting at that moment reports the app
  // as never having come up.
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  // The two PROJECTS no longer share a repo store, so they no longer contend with each other — but
  // Playwright's worker pool is shared across projects (nothing pins a fixed number of workers to
  // each), and within ONE project the tests still write through that project's own single repo store
  // with no compare-and-swap on the history head. So the original limit still applies, just scoped
  // down to a project instead of the whole run: each project caps itself at 2 (below), which is what
  // measured clean before this change and still does. The total here is what lets both projects' 2
  // run at the same time — raise it only alongside the per-project caps, and only by measuring.
  workers: 4,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],

  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  // Both frames are the same app at different widths, so both run the same specs. A spec that only
  // makes sense in one frame asks the DOM which frame it got (isMobileFrame) and skips itself on the
  // other — never the project name, because which frame mounted is the app's decision and re-deriving
  // it here would be a second copy of that rule.
  //
  // Each project sets its own baseURL because webServer is an array below — Playwright does not infer
  // one from a port in that shape (see the webServer doc comment on TestConfigWebServer).
  projects: [
    // workers: 2 per project — see the top-level workers comment. This is the per-project repo-store
    // limit the whole run used to need; splitting the stand did not remove it, only made it local to
    // one project's store instead of shared by both.
    { name: 'desktop', workers: 2, use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${desktopStand.webPort}` } },
    { name: 'mobile', workers: 2, use: { ...devices['Pixel 7'], baseURL: `http://localhost:${mobileStand.webPort}` } },
  ],

  webServer: [
    {
      command: `pnpm --filter @arxhub/dev exec vite --port ${desktopStand.webPort} --strictPort --force`,
      url: `http://localhost:${desktopStand.webPort}`,
      cwd: '..',
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      // ARXHUB_FROZEN_STAND: no file watching, no HMR. The source does not change during a run, and a
      // stand that reloads every page when it does is the difference between a suite and an editing
      // session — see instances/dev/vite.config.ts. --force above gives each stand its own dependency
      // scan, the same reasoning as its own throwaway data dir and its own ports.
      env: { ARXHUB_DATA_DIR: desktopStand.dataDir, ARXHUB_PORT: String(desktopStand.apiPort), ARXHUB_FROZEN_STAND: '1' },
    },
    {
      command: `pnpm --filter @arxhub/dev exec vite --port ${mobileStand.webPort} --strictPort --force`,
      url: `http://localhost:${mobileStand.webPort}`,
      cwd: '..',
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ARXHUB_DATA_DIR: mobileStand.dataDir, ARXHUB_PORT: String(mobileStand.apiPort), ARXHUB_FROZEN_STAND: '1' },
    },
  ],
})
