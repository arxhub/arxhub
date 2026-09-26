import type { Page } from '@playwright/test'
import { expect, IDENTITY_KEY, openSettingsSection, SEEDED_MNEMONIC, test, waitForApp } from './fixtures'

// The theme-boot script (@arxhub/toolchain-vite themeBoot) runs from <head>, before any module. Holding
// the app's own entry back leaves exactly the document the first paint is made of — whatever wears a
// theme there was put on by that script and by nothing the app did later.
const APP_ENTRY = '**/src/main.ts'
const STORAGE_KEY = 'arxhub.theme'
const THEME_CONFIG = 'storage/theme/config.toml'

interface Attributes {
  theme: string | null
  base: string | null
}

function attributes(page: Page): Promise<Attributes> {
  return page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-arxhub-theme'),
    base: document.documentElement.getAttribute('data-theme'),
  }))
}

interface FirstPaint extends Attributes {
  // What the canvas is painted as. No stylesheet has loaded yet, so only the script's <meta> can say dark.
  scheme: string
}

async function firstPaint(page: Page): Promise<FirstPaint> {
  await page.route(APP_ENTRY, (route) => route.abort())
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    // Proves the app really was held back, so nothing below can be the theme plugin's doing.
    await expect(page.getByRole('main')).toHaveCount(0)
    // The <meta> sets the page's USED scheme and leaves the computed `color-scheme` at `normal`, so the
    // canvas is read through the system colour it paints: `Canvas` is near-black only on a dark scheme.
    const scheme = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.backgroundColor = 'Canvas'
      document.documentElement.appendChild(probe)
      const [r, g, b] = (getComputedStyle(probe).backgroundColor.match(/\d+/g) ?? []).map(Number)
      probe.remove()
      return r + g + b < 384 ? 'dark' : 'light'
    })
    return { ...(await attributes(page)), scheme }
  } finally {
    await page.unroute(APP_ENTRY)
  }
}

async function seedSavedTheme(page: Page, saved: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (window.localStorage.getItem(key) == null) window.localStorage.setItem(key, value)
    },
    [STORAGE_KEY, saved] as const,
  )
}

test.describe('first paint before the app', () => {
  for (const scheme of ['dark', 'light'] as const) {
    test(`follows a ${scheme} system scheme when this device saved no theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      expect(await firstPaint(page)).toEqual({ theme: null, base: scheme, scheme })
    })
  }

  test('the theme this device applied last wins over the system scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await seedSavedTheme(page, JSON.stringify({ id: 'catppuccin-mocha', base: 'dark' }))
    expect(await firstPaint(page)).toEqual({ theme: 'catppuccin-mocha', base: 'dark', scheme: 'dark' })
  })

  test('a saved record that is not JSON is ignored', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await seedSavedTheme(page, '{not json')
    expect(await firstPaint(page)).toEqual({ theme: null, base: 'dark', scheme: 'dark' })
  })
})

// Picks a theme through the settings — which writes this project's one theme config — so it must not
// run beside itself; the theme is put back before the test ends.
test.describe.configure({ mode: 'serial' })

test('a chosen theme is on the first paint and stays through the boot', async ({ app, vault }) => {
  await openSettingsSection(app, 'Appearance')
  await app.getByTestId('theme-catppuccin-mocha').click()
  try {
    await expect.poll(() => attributes(app)).toEqual({ theme: 'catppuccin-mocha', base: 'dark' })
    await expect
      .poll(() => app.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? 'null'), STORAGE_KEY))
      .toEqual({ id: 'catppuccin-mocha', base: 'dark' })
    // The reload below boots from config, so the choice has to have landed there first.
    await expect.poll(() => vault.readData(THEME_CONFIG).catch(() => '')).toContain('catppuccin-mocha')

    // The system says the opposite, so a dark first paint can only come from the saved choice.
    await app.emulateMedia({ colorScheme: 'light' })
    expect(await firstPaint(app)).toEqual({ theme: 'catppuccin-mocha', base: 'dark', scheme: 'dark' })

    // Every value the root's theme attributes take during a full boot — a flash to another theme and
    // back would show up here even though the end state is right.
    await app.addInitScript(() => {
      const seen: string[] = []
      ;(window as unknown as { __themeSeen: string[] }).__themeSeen = seen
      const record = () => {
        const root = document.documentElement
        if (root == null) return
        const value = `${root.getAttribute('data-arxhub-theme')}/${root.getAttribute('data-theme')}`
        if (seen[seen.length - 1] !== value) seen.push(value)
      }
      new MutationObserver(record).observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-arxhub-theme', 'data-theme'],
      })
    })
    await app.goto('/')
    await waitForApp(app)
    await expect.poll(() => attributes(app)).toEqual({ theme: 'catppuccin-mocha', base: 'dark' })
    const seen = await app.evaluate(() => (window as unknown as { __themeSeen: string[] }).__themeSeen)
    expect(seen.filter((value) => value !== 'null/null')).toEqual(['catppuccin-mocha/dark'])
  } finally {
    await openSettingsSection(app, 'Appearance')
    await app.getByTestId('theme-default').click()
    await expect.poll(() => vault.readData(THEME_CONFIG).catch(() => '')).toContain('"default"')
  }
})

// The saved record is this device's memory of what it applied, not a second source of the choice: a
// boot whose config names another theme applies that one and overwrites the record.
test('the configured theme replaces a stale saved record once the app is up', async ({ page, vault }) => {
  await page.addInitScript(
    ([key, mnemonic]) => {
      if (window.localStorage.getItem(key) == null) window.localStorage.setItem(key, mnemonic)
    },
    [IDENTITY_KEY, SEEDED_MNEMONIC] as const,
  )
  await page.emulateMedia({ colorScheme: 'dark' })
  await seedSavedTheme(page, JSON.stringify({ id: 'slate-dark', base: 'dark' }))
  await page.goto('/')
  await waitForApp(page)

  // With no theme in config, the plugin follows the dark base the saved record put on the document.
  const configured = /^theme\s*=\s*"([^"]+)"/m.exec(await vault.readData(THEME_CONFIG).catch(() => ''))?.[1] ?? 'default-dark'
  expect(configured).not.toBe('slate-dark')
  await expect.poll(() => attributes(page)).toEqual({ theme: configured, base: expect.any(String) })
  await expect
    .poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? 'null')?.id ?? null, STORAGE_KEY))
    .toBe(configured)
})
