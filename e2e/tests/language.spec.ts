import type { Page } from '@playwright/test'
import { APP_ENTRY } from './first-paint'
import { expect, IDENTITY_KEY, isMobileFrame, SEEDED_MNEMONIC, SETTINGS_TYPE, test, typeKey, typeRow, waitForApp } from './fixtures'

// Every other spec runs pinned to en-US (playwright.config.ts) and asserts English. This one is the proof
// that the other language is really there: the app follows the system's language when nothing is stored,
// the Settings control switches it live, the choice survives a reload, and the pre-paint script has already
// put it on <html lang> before any module runs (27-i18n).

const LANGUAGE_KEY = 'arxhub.language'

function russianTypeRow(page: Page) {
  return page.getByRole('navigation', { name: 'Типы' })
}

// Settings has no key in the row until it is open (OR-05): reached through ⌘K's "Open new", as openType()
// does in English.
async function openRussianSettingsSection(page: Page, section: string): Promise<void> {
  await page.keyboard.press('ControlOrMeta+k')
  const sheet = page.getByRole('dialog', { name: 'Открыть или переключиться' })
  await sheet.getByTestId(`sheet:new:${SETTINGS_TYPE}`).click()
  await expect(sheet).toBeHidden()
  // On the phone the sections are one level down, behind the second tap on the type you are in.
  if (await isMobileFrame(page)) await russianTypeRow(page).locator('[aria-pressed="true"]').click()
  await page.locator('.settings-nav').getByRole('treeitem', { name: section, exact: true }).click()
}

test.describe('on a Russian system', () => {
  test.use({ locale: 'ru-RU' })

  test('boots in Russian and switches to English without a reload', async ({ app }) => {
    await expect(app.locator('html')).toHaveAttribute('lang', 'ru')
    await expect(russianTypeRow(app).getByRole('button', { name: /^Документы(,|$)/ })).toBeVisible()

    await app.keyboard.press('ControlOrMeta+k')
    const sheet = app.getByRole('dialog', { name: 'Открыть или переключиться' })
    await expect(sheet).toContainText('Сейчас открыто')
    await expect(sheet).toContainText('Открыть новое')
    await app.keyboard.press('Escape')
    await expect(sheet).toBeHidden()

    await openRussianSettingsSection(app, 'Язык')
    await expect(app.getByRole('heading', { name: 'Язык', exact: true })).toBeVisible()

    // A navigation would reset the page; this marker would not survive one.
    await app.evaluate(() => {
      ;(window as unknown as { __noReload?: boolean }).__noReload = true
    })
    await app.getByTestId('language-choice').getByText('English', { exact: true }).click()

    await expect(app.locator('html')).toHaveAttribute('lang', 'en')
    await expect(app.getByRole('heading', { name: 'Language', exact: true })).toBeVisible()
    await expect(typeKey(app, 'Documents')).toBeVisible()
    expect(await app.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true)
    expect(await app.evaluate((key) => localStorage.getItem(key), LANGUAGE_KEY)).toBe('en')

    // Device-local and explicit: it outlives the reload, and the Russian system no longer decides.
    await app.reload()
    await waitForApp(app)
    await expect(app.locator('html')).toHaveAttribute('lang', 'en')
    await expect(typeRow(app)).toBeVisible()
  })
})

test('a stored Russian is on <html lang> before the app has loaded, and the app speaks it', async ({ page }) => {
  await page.addInitScript((key) => {
    if (localStorage.getItem(key) == null) localStorage.setItem(key, 'ru')
  }, LANGUAGE_KEY)

  await page.route(APP_ENTRY, (route) => route.abort())
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('main')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.getAttribute('lang'))).toBe('ru')
  await page.unroute(APP_ENTRY)

  // The app fixture's identity seed, by hand: this test needs its own init script to run first.
  await page.addInitScript(
    ([key, mnemonic]) => {
      if (localStorage.getItem(key) == null) localStorage.setItem(key, mnemonic)
    },
    [IDENTITY_KEY, SEEDED_MNEMONIC] as const,
  )
  await page.goto('/')
  await waitForApp(page)
  await expect(russianTypeRow(page).getByRole('button', { name: /^Документы(,|$)/ })).toBeVisible()
})
