import { firstPaint, seedSavedTheme } from './first-paint'
import { expect, test } from './fixtures'

// The tests here never let the app boot, so they read no theme config; the two that pick or read the
// configured theme live in themes.spec.ts, the one file allowed to touch that config (it runs serially).
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
