import { expect, openSettingsSection, test } from './fixtures'

const themeAttr = () => document.documentElement.getAttribute('data-arxhub-theme')
const baseAttr = () => document.documentElement.getAttribute('data-theme')
const bg = () => getComputedStyle(document.documentElement).getPropertyValue('--gray-1').trim()

test.describe('themes', () => {
  test.beforeEach(async ({ app }) => {
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

  test('the choice survives a restart', async ({ app }) => {
    await app.getByTestId('theme-catppuccin-macchiato').click()
    await expect.poll(() => app.evaluate(themeAttr)).toBe('catppuccin-macchiato')

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
