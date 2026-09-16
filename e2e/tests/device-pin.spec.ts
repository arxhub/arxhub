import type { Page } from '@playwright/test'
import { expect, openSecuritySettings, test, waitForApp } from './fixtures'

const PIN = '481625'

// The dev stand seeds a plaintext identity and boots without `requireLock`, so the first-run "set a lock
// code" screen never appears here — only the unlock gate does, and only after a lock is set from Security
// settings. That is the whole reachable surface of the keypad in e2e, and it is what these drive.
async function tap(app: Page, digits: string): Promise<void> {
  for (const digit of digits) await app.getByTestId(`pin-key-${digit}`).click()
}

async function lockWithKeypad(app: Page): Promise<void> {
  await openSecuritySettings(app)
  const entry = app.getByTestId('new-unlock-code')
  await entry.click()
  await tap(app, PIN)
  await expect(entry).toHaveValue(PIN)

  await app.getByRole('button', { name: 'Lock this device' }).click()
  await app.getByRole('button', { name: 'Lock device' }).click()
  await expect(app.getByRole('heading', { name: 'Unlock ArxHub' })).toBeVisible()
}

test.describe('The device lock is a numeric keypad', () => {
  test('sets the code by tapping and opens the gate the same way', async ({ app }) => {
    await lockWithKeypad(app)

    const gate = app.getByTestId('unlock-code')
    await gate.click()
    await tap(app, PIN)
    await expect(gate).toHaveValue(PIN)

    await app.getByRole('button', { name: 'Unlock' }).click()
    await waitForApp(app)
  })

  // The browser client mounts this same gate on a desktop, where the pad is not the only input there is.
  test('takes the code from a hardware keyboard, Enter included', async ({ app }) => {
    await lockWithKeypad(app)

    await app.getByTestId('unlock-code').click()
    await app.keyboard.type(PIN)
    await app.keyboard.press('Enter')
    await waitForApp(app)
  })

  test('deletes a digit from the pad and from the keyboard alike', async ({ app }) => {
    await lockWithKeypad(app)

    const gate = app.getByTestId('unlock-code')
    await gate.click()
    await app.keyboard.type(`${PIN}7`)
    await app.keyboard.press('Backspace')
    await expect(gate).toHaveValue(PIN)

    await tap(app, '9')
    await app.getByTestId('pin-key-delete').click()
    await expect(gate).toHaveValue(PIN)

    await app.keyboard.press('Enter')
    await waitForApp(app)
  })

  test('says what the lock is worth rather than implying more', async ({ app }) => {
    await lockWithKeypad(app)

    await expect(app.getByText('copy of this profile')).toBeVisible()
  })

  test('a wrong code is still refused out loud', async ({ app }) => {
    await lockWithKeypad(app)

    await app.getByTestId('unlock-code').click()
    await tap(app, '000000')
    await app.getByRole('button', { name: 'Unlock' }).click()

    await expect(app.getByRole('alert')).toContainText('That code did not work')
    await expect(app.getByRole('main')).toBeHidden()
  })

  test('refuses letters and a code below the minimum before anything is locked', async ({ app }) => {
    await openSecuritySettings(app)
    const entry = app.getByTestId('new-unlock-code')
    const lock = app.getByRole('button', { name: 'Lock this device' })

    await entry.click()
    await app.keyboard.type('abcdef')
    await expect(entry).toHaveValue('')
    await expect(lock).toBeDisabled()

    await tap(app, '12345')
    await expect(lock).toBeDisabled()

    await tap(app, '6')
    await expect(lock).toBeEnabled()
  })
})
