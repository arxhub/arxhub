import { chromium, devices, type FullConfig } from '@playwright/test'
import { IDENTITY_KEY, SEEDED_MNEMONIC } from './tests/fixtures'

// Keyed by project name (playwright.config.ts), not re-derived from the project's `use`: `use` there
// is the full merged test-options object (baseURL, trace, screenshot, …), most of which
// `newContext()` does not accept — only the device shape does.
const DEVICE_BY_PROJECT: Record<string, (typeof devices)[string]> = {
  desktop: devices['Desktop Chrome'],
  mobile: devices['Pixel 7'],
}

// Boots the app once in each frame before a single test runs.
//
// The stand is a Vite dev server, and Vite pre-bundles a dependency the first time something asks for
// it. When that first ask happens DURING a run, the server re-optimizes and then tells every connected
// client to reload — sixteen pages at once, each losing whatever the test had put on screen, with the
// requests that were in flight failing as "Failed to fetch". Observed in a full run:
//
//   dependencies optimized: mdast-util-from-markdown, mdast-util-gfm, micromark-extension-gfm
//   optimized dependencies changed. reloading
//
// Thirteen tests failed around that second, several of them with the app simply not there — which is
// exactly what a page that reloaded under the assertion looks like. It lands on a different test every
// time, because which worker is mid-assert at that moment is a coin toss.
//
// So the run pays that cost here, with nothing on screen to lose, and starts every test against a
// server that has already settled. This is a property of the stand, not of the app: the same reload
// hits a developer the first time they open a note, and there it is what a dev server is for.
export default async function warmUpTheStand(config: FullConfig): Promise<void> {
  const browser = await chromium.launch()
  try {
    // Every project, because each is now its own stand: warming one project's server would leave the
    // other's dependency graph for whichever test gets there first.
    for (const project of config.projects) {
      const baseURL = project.use.baseURL
      if (baseURL == null) throw new Error(`No baseURL for project "${project.name}" — the warm-up has no stand to reach`)
      const device = DEVICE_BY_PROJECT[project.name]
      if (device == null) throw new Error(`No device mapping for project "${project.name}" — add one above`)

      const context = await browser.newContext(device)
      const page = await context.newPage()
      // The same identity the suite speaks with. Not optional: the stand pins the first key it sees
      // (trust on first use), so a warm-up booting a fresh random identity would pair the run to a
      // device that then never comes back — and every test would be answered with a 401.
      await page.addInitScript(
        ([key, mnemonic]) => {
          if (window.localStorage.getItem(key) == null) window.localStorage.setItem(key, mnemonic)
        },
        [IDENTITY_KEY, SEEDED_MNEMONIC] as const,
      )
      await page.goto(baseURL)
      // Generous, and deliberately not silent: a cold optimizer bundles the whole graph here, and a
      // stand that cannot bring the app up at all should say so once, now, rather than as a hundred
      // confusing failures.
      await page.getByRole('main').waitFor({ state: 'visible', timeout: 120_000 })
      await context.close()
    }
  } finally {
    await browser.close()
  }
}
