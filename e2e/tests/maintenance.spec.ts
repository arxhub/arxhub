import type { Page } from '@playwright/test'
import { expect, openNavigation, openSettingsSection, openType, test, waitForApp, withShellChrome } from './fixtures'

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

    await withShellChrome(app, async (chrome) => {
      await expect(chrome.getByRole('button', { name: 'Maintenance mode' })).toBeVisible()
    })

    // Explorer is not essential, so a maintenance boot leaves it out — and the tree it contributes is
    // the navigation of the Notes type, not a place of its own. The type is still there (notes is
    // essential); its navigation says in as many words that there is no tree, rather than showing an
    // empty column.
    await openType(app, 'Notes')
    await openNavigation(app)
    await expect(app.getByText('The explorer is switched off')).toBeVisible()
    await expect(app.getByRole('tree', { name: 'Files' })).toHaveCount(0)
  })

  test('leaves again from the Plugins page and brings the app back whole', async ({ app }) => {
    await bootWith(app, { maintenance: true })

    await openSettingsSection(app, 'Plugins')
    await expect(app.getByText('Maintenance mode is on')).toBeVisible()
    await app.getByRole('button', { name: 'Leave and restart' }).click()

    await withShellChrome(app, async (chrome) => {
      await expect(chrome.getByRole('button', { name: 'Maintenance mode' })).toHaveCount(0)
    })
    // And the vault tree is back where it belongs: inside the Notes type's navigation.
    await openType(app, 'Notes')
    await openNavigation(app)
    await expect(app.getByRole('tree', { name: 'Files' })).toBeVisible()
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
