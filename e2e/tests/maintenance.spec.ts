import type { Page } from '@playwright/test'
import { expect, openNavigation, openSettingsSection, test } from './fixtures'

// Matches BootPolicy's storage key. Written from the page rather than through the UI where a test needs
// the app to come up already in that state.
const BOOT_POLICY_KEY = 'arxhub.boot'

async function bootWith(page: Page, policy: { disabled?: string[]; maintenance?: boolean }): Promise<void> {
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [
    BOOT_POLICY_KEY,
    JSON.stringify({ disabled: policy.disabled ?? [], maintenance: policy.maintenance ?? false }),
  ] as const)
  await page.reload()
  await expect(page.getByRole('main')).toBeVisible()
}

test.describe('maintenance mode', () => {
  test('boots the essentials only, and says so', async ({ app }) => {
    await bootWith(app, { maintenance: true })

    await expect(app.getByRole('button', { name: 'Maintenance mode' })).toBeVisible()
    // Explorer is not essential, so a maintenance boot leaves it out entirely — no sidebar entry.
    await openNavigation(app)
    await expect(app.getByRole('button', { name: 'Explorer' })).toHaveCount(0)
    await expect(app.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
  })

  test('leaves again from the Plugins page and brings the app back whole', async ({ app }) => {
    await bootWith(app, { maintenance: true })

    await openSettingsSection(app, 'Plugins')
    await expect(app.getByText('Maintenance mode is on')).toBeVisible()
    await app.getByRole('button', { name: 'Leave and restart' }).click()

    await expect(app.getByRole('main')).toBeVisible()
    await expect(app.getByRole('button', { name: 'Maintenance mode' })).toHaveCount(0)
    await openNavigation(app)
    await expect(app.getByRole('button', { name: 'Explorer' })).toBeVisible()
  })
})

test.describe('plugin switches', () => {
  test('a plugin switched off stays out of the next boot', async ({ app }) => {
    await openSettingsSection(app, 'Plugins')
    // Sync registers its footer in configure(), so the footer's presence is what tells whether the
    // plugin loaded at all.
    await expect(app.getByRole('status', { name: /Not synced|Synced/ })).toBeVisible()

    // The switch's own input is visually hidden, so the click goes to the control the user sees.
    await app.getByTestId('plugin-switch-sync').click()
    await app.getByRole('button', { name: 'Restart now' }).click()

    await expect(app.getByRole('main')).toBeVisible()
    await expect(app.getByRole('status', { name: /Not synced|Synced/ })).toHaveCount(0)
  })

  test('essential plugins cannot be switched off', async ({ app }) => {
    await openSettingsSection(app, 'Plugins')

    await expect(app.getByRole('checkbox', { name: 'Enable Shell' })).toBeDisabled()
    await expect(app.getByRole('checkbox', { name: 'Enable Explorer' })).toBeEnabled()
  })
})
