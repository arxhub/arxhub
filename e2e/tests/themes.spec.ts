import { expect, openSettingsSection, test } from './fixtures'

const themeAttr = () => document.documentElement.getAttribute('data-arxhub-theme')
const baseAttr = () => document.documentElement.getAttribute('data-theme')
const bg = () => getComputedStyle(document.documentElement).getPropertyValue('--gray-1').trim()
const danger = () => getComputedStyle(document.documentElement).getPropertyValue('--danger-2').trim()
const scheme = () => getComputedStyle(document.documentElement).colorScheme

// The active theme is one setting in one shared config, so these cannot run beside each other — nor
// beside the same file on the other project. Theme selection has nothing to do with the frame, so this
// file runs on the desktop project alone (playwright.config.ts, the mobile project's testIgnore) and
// serially within it, instead of being made frame-aware.
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
