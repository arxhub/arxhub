import { attributes, firstPaint, STORAGE_KEY, seedSavedTheme, THEME_CONFIG } from './first-paint'
import { expect, IDENTITY_KEY, openSettingsSection, SEEDED_MNEMONIC, test, waitForApp } from './fixtures'

const themeAttr = () => document.documentElement.getAttribute('data-arxhub-theme')
const baseAttr = () => document.documentElement.getAttribute('data-theme')
const bg = () => getComputedStyle(document.documentElement).getPropertyValue('--gray-1').trim()
const danger = () => getComputedStyle(document.documentElement).getPropertyValue('--danger-2').trim()
const scheme = () => getComputedStyle(document.documentElement).colorScheme

// The active theme is one setting in one config file, so these tests within a single project cannot
// run beside each other — `fullyParallel` would otherwise hand different tests of this file to
// different workers of the same project even though the file is one describe block. Each project now
// has its own stand and its own config file (playwright.config.ts), so this file runs on both desktop
// and mobile again; serial only guards a project against itself.
test.describe.configure({ mode: 'serial' })

test.describe('themes', () => {
  test.beforeEach(async ({ app }) => {
    await openSettingsSection(app, 'Appearance')
  })

  test('offers every theme the instance ships', async ({ app }) => {
    for (const id of [
      'default',
      'default-dark',
      'slate',
      'slate-dark',
      'catppuccin-latte',
      'catppuccin-frappe',
      'catppuccin-macchiato',
      'catppuccin-mocha',
    ]) {
      await expect(app.getByTestId(`theme-${id}`)).toBeVisible()
    }
  })

  test('applies a dark theme as a whole unit, not a brightness switch', async ({ app }) => {
    const before = await app.evaluate(bg)

    await app.getByTestId('theme-catppuccin-mocha').click()

    await expect.poll(() => app.evaluate(themeAttr)).toBe('catppuccin-mocha')
    // The theme declares its own base so the shared danger/warning scales follow it.
    await expect.poll(() => app.evaluate(baseAttr)).toBe('dark')
    await expect.poll(() => app.evaluate(bg)).not.toBe(before)
    // Radix ships red-2 light and dark, keyed on that base — the light arm must not shadow the dark one.
    await expect.poll(() => app.evaluate(danger)).toBe('#201314')
    // Scrollbars and form-control internals are the browser's to paint, and only follow color-scheme.
    await expect.poll(() => app.evaluate(scheme)).toBe('dark')
  })

  // The house theme's own dark arm, which shares one declaration block with its light arm — the mapping
  // is base-agnostic and resolves per `data-theme`, so this is what proves the dark arm resolves at all
  // rather than quietly serving the light values.
  test('the default family ships a dark arm that is genuinely dark', async ({ app }) => {
    const onLight = await app.evaluate(bg)

    await app.getByTestId('theme-default-dark').click()

    await expect.poll(() => app.evaluate(themeAttr)).toBe('default-dark')
    await expect.poll(() => app.evaluate(baseAttr)).toBe('dark')
    await expect.poll(() => app.evaluate(scheme)).toBe('dark')
    // Same tokens, different base: if the mapping had been pinned to the light scales this would match.
    await expect.poll(() => app.evaluate(bg)).not.toBe(onLight)

    await app.getByTestId('theme-default').click()
    await expect.poll(() => app.evaluate(themeAttr)).toBe('default')
  })

  test('a light flavour reports a light base', async ({ app }) => {
    await app.getByTestId('theme-catppuccin-latte').click()

    await expect.poll(() => app.evaluate(themeAttr)).toBe('catppuccin-latte')
    await expect.poll(() => app.evaluate(baseAttr)).toBe('light')
  })

  test('each card previews its own theme, not the one in force', async ({ app }) => {
    const swatches = () =>
      app.evaluate(() =>
        [...document.querySelectorAll('[data-testid^="theme-"] [data-arxhub-theme]')].map((el) =>
          getComputedStyle(el).getPropertyValue('--gray-1').trim(),
        ),
      )

    const onLight = await swatches()
    // One distinct background per card. A preview that read the active theme instead of its own would
    // collapse them all onto a single value, which is the bug under test — so the invariant is
    // "as many backgrounds as cards", not a count of the themes that happened to ship the day this was
    // written.
    expect(onLight.length).toBeGreaterThan(1)
    expect(new Set(onLight).size).toBe(onLight.length)

    await app.getByTestId('theme-catppuccin-mocha').click()
    await expect.poll(() => app.evaluate(themeAttr)).toBe('catppuccin-mocha')

    await expect.poll(swatches).toEqual(onLight)

    await app.getByTestId('theme-default').click()
    await expect.poll(() => app.evaluate(themeAttr)).toBe('default')
  })

  test('the choice survives a restart', async ({ app, vault }) => {
    await app.getByTestId('theme-catppuccin-macchiato').click()
    await expect.poll(() => app.evaluate(themeAttr)).toBe('catppuccin-macchiato')

    // The write is async and the plugin reads its config once at start, so reloading before the file
    // lands would bring the app back on whatever was written last.
    await expect.poll(() => vault.readData('storage/theme/config.toml').catch(() => '')).toContain('catppuccin-macchiato')
    await app.reload()

    // Persisted through the plugin's own config, so it travels with the vault rather than the device.
    await expect.poll(() => app.evaluate(themeAttr)).toBe('catppuccin-macchiato')
    await expect.poll(() => app.evaluate(baseAttr)).toBe('dark')

    // Leave the stand on the default so a later test does not inherit this one's theme.
    await openSettingsSection(app, 'Appearance')
    await app.getByTestId('theme-default').click()
    await expect.poll(() => app.evaluate(themeAttr)).toBe('default')
  })
})

// The theme-boot script's side (see theme-boot.spec.ts) as far as it meets the configured theme. These live
// here, in the serial file, because they pick or read the one theme config the tests above write too — in
// a file of their own they ran beside those and each saw the other's theme.

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
