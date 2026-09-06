import type { Page } from '@playwright/test'
import { expect, explorerLabel, openSettingsSection, test, waitForApp, withShellChrome } from './fixtures'

// Matches BootPolicy's storage key. Written from the page rather than through the UI where a test needs
// the app to come up already in that state.
const BOOT_POLICY_KEY = 'arxhub.boot'

async function bootWith(page: Page, policy: { disabled?: string[]; maintenance?: boolean }): Promise<void> {
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [
    BOOT_POLICY_KEY,
    JSON.stringify({ disabled: policy.disabled ?? [], maintenance: policy.maintenance ?? false }),
  ] as const)
  await page.reload()
  await waitForApp(page)
}

test.describe('maintenance mode', () => {
  test('boots the essentials only, and says so', async ({ app }) => {
    await bootWith(app, { maintenance: true })

    const explorer = await explorerLabel(app)
    await withShellChrome(app, async (chrome) => {
      await expect(chrome.getByRole('button', { name: 'Maintenance mode' })).toBeVisible()
      // Explorer is not essential, so a maintenance boot leaves it out entirely — no entry at all.
      await expect(chrome.getByRole('button', { name: explorer, exact: true })).toHaveCount(0)
      await expect(chrome.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
    })
  })

  test('leaves again from the Plugins page and brings the app back whole', async ({ app }) => {
    await bootWith(app, { maintenance: true })

    await openSettingsSection(app, 'Plugins')
    await expect(app.getByText('Maintenance mode is on')).toBeVisible()
    await app.getByRole('button', { name: 'Leave and restart' }).click()

    const explorer = await explorerLabel(app)
    await withShellChrome(app, async (chrome) => {
      await expect(chrome.getByRole('button', { name: 'Maintenance mode' })).toHaveCount(0)
      await expect(chrome.getByRole('button', { name: explorer, exact: true })).toBeVisible()
    })
  })
})

test.describe('plugin switches', () => {
  test('a plugin switched off stays out of the next boot', async ({ app }) => {
    await openSettingsSection(app, 'Plugins')
    // Sync registers its status widget in configure(), so its presence is what tells whether the
    // plugin loaded at all. Asked for by its control, not its text: the label tracks the engine's
    // state, and another test sharing this vault can have moved it on.
    await withShellChrome(app, (chrome) => expect(chrome.getByRole('button', { name: 'Sync now' })).toBeVisible())

    // The switch's own input is visually hidden, so the click goes to the control the user sees.
    await app.getByTestId('plugin-switch-sync').click()
    await app.getByRole('button', { name: 'Restart now' }).click()

    // Asked for inside the scope that would hold it, or a phone would pass simply by keeping the
    // sheet shut.
    await withShellChrome(app, (chrome) => expect(chrome.getByRole('button', { name: 'Sync now' })).toHaveCount(0))
  })

  test('essential plugins cannot be switched off', async ({ app }) => {
    await openSettingsSection(app, 'Plugins')

    await expect(app.getByRole('checkbox', { name: 'Enable Shell' })).toBeDisabled()
    await expect(app.getByRole('checkbox', { name: 'Enable Explorer' })).toBeEnabled()
  })
})
