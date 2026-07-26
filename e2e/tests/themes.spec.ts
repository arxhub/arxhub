import { expect, openSettingsSection, test } from './fixtures'

const themeAttr = () => document.documentElement.getAttribute('data-arxhub-theme')
const baseAttr = () => document.documentElement.getAttribute('data-theme')
const bg = () => getComputedStyle(document.documentElement).getPropertyValue('--gray-1').trim()

// The active theme is one setting in one shared config, so these cannot run beside each other — nor
// beside the same file on the other project. Theme selection has nothing to do with the frame, so it
// runs serially on one project instead of being made frame-aware.
test.describe.configure({ mode: 'serial' })

test.describe('themes', () => {
  test.beforeEach(async ({ app }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'theme selection is not frame-specific')
    await openSettingsSection(app, 'Appearance')
  })

  test('offers every theme the instance ships', async ({ app }) => {
    for (const id of ['default', 'catppuccin-latte', 'catppuccin-frappe', 'catppuccin-macchiato', 'catppuccin-mocha']) {
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
  })

  test('a light flavour reports a light base', async ({ app }) => {
    await app.getByTestId('theme-catppuccin-latte').click()

    await expect.poll(() => app.evaluate(themeAttr)).toBe('catppuccin-latte')
    await expect.poll(() => app.evaluate(baseAttr)).toBe('light')
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
