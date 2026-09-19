import type { Page } from '@playwright/test'
import { expect, isMobileFrame, openSecuritySettings, test, waitForApp } from './fixtures'

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
  if (!(await isMobileFrame(app))) await entry.focus()
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
    if ((await app.getByTestId('mobile-pin-entry').count()) === 0) await gate.focus()
    await tap(app, PIN)
    await expect(gate).toHaveValue(PIN)

    await app.getByRole('button', { name: 'Unlock' }).click()
    await waitForApp(app)
  })

  // The browser client mounts this same gate on a desktop, where the pad is not the only input there is.
  test('takes the code from a hardware keyboard, Enter included', async ({ app }) => {
    await lockWithKeypad(app)

    await app.getByTestId('unlock-code').focus()
    await app.keyboard.type(PIN)
    await app.keyboard.press('Enter')
    await waitForApp(app)
  })

  test('types a code after tabbing into the mobile keypad without a hidden-input focus helper', async ({ app }) => {
    test.skip(!(await isMobileFrame(app)), 'mobile keypad only')
    await openSecuritySettings(app)
    const key = app.getByTestId('pin-key-1')
    for (let steps = 0; steps < 40; steps++) {
      await app.keyboard.press('Tab')
      if (await key.evaluate((element) => element === document.activeElement)) break
    }
    await expect(key).toBeFocused()

    const input = app.getByTestId('new-unlock-code')
    await app.keyboard.type(PIN)
    await expect(input).toHaveValue(PIN)
    await expect(key).toBeFocused()
    await app.keyboard.press('Backspace')
    await expect(input).toHaveValue(PIN.slice(0, -1))
    await app.keyboard.press('Delete')
    await expect(input).toHaveValue(PIN.slice(0, -2))
    await app.keyboard.type(PIN.slice(-2))
    await expect(input).toHaveValue(PIN)
    await expect(key).toBeFocused()

    // The handler leaves native button activation alone: each activation adds the button's digit.
    await app.keyboard.press('Enter')
    await app.keyboard.press('Space')
    await expect(input).toHaveValue(`${PIN}11`)
    await expect(key).toBeFocused()
    await expect(app.getByRole('button', { name: 'Lock this device' })).toBeEnabled()
  })

  test('deletes a digit from the pad and from the keyboard alike', async ({ app }, testInfo) => {
    await lockWithKeypad(app)

    const gate = app.getByTestId('unlock-code')

    if ((await app.getByTestId('mobile-pin-entry').count()) > 0) {
      const entry = app.getByTestId('mobile-pin-entry')
      const input = entry.locator('input[type="password"]')
      await expect(input).toHaveAttribute('inputmode', 'none')

      const keyBox = await app.getByTestId('pin-key-1').boundingBox()
      expect(keyBox).not.toBeNull()
      const size = await entry.evaluate((el) => Number.parseFloat(getComputedStyle(el).getPropertyValue('--size-2xl')))
      expect(keyBox?.width).toBeCloseTo(size, 0)
      expect(keyBox?.height).toBeCloseTo(size, 0)

      await tap(app, '1234567')
      const filled = entry.locator('.dot.filled')
      await expect(entry.locator('.dot')).toHaveCount(7)
      await expect(filled).toHaveCount(7)
      await expect(entry.locator('.dots')).toHaveAttribute('aria-hidden', 'true')
      await testInfo.attach('mobile-pin-keypad', { body: await app.screenshot(), contentType: 'image/png' })
      // Seven digits stay in the gate until the user explicitly submits; entering a longer code is not
      // an accidental unlock just because the minimum is six.
      await expect(app.getByRole('heading', { name: 'Unlock ArxHub' })).toBeVisible()

      const deleteKey = app.getByTestId('pin-key-delete')
      await deleteKey.click()
      await expect(filled).toHaveCount(6)
      for (let i = 0; i < 6; i++) await deleteKey.click()
    }

    await gate.focus()
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

    await app.getByTestId('unlock-code').focus()
    await tap(app, '000000')
    await app.getByRole('button', { name: 'Unlock' }).click()

    await expect(app.getByRole('alert')).toContainText('That code did not work')
    await expect(app.getByRole('main')).toBeHidden()
  })

  test('changes the code one mobile keypad at a time', async ({ app }) => {
    test.skip(!(await isMobileFrame(app)), 'mobile steps only')
    await lockWithKeypad(app)
    await tap(app, PIN)
    await app.getByRole('button', { name: 'Unlock', exact: true }).click()
    await waitForApp(app)
    await openSecuritySettings(app)

    await expect(app.getByRole('group', { name: 'Numeric keypad' })).toHaveCount(1)
    await tap(app, PIN)
    await app.getByRole('button', { name: 'Enter new code' }).click()
    await expect(app.getByRole('group', { name: 'Numeric keypad' })).toHaveCount(1)
    await tap(app, '7924138')
    await app.getByRole('button', { name: 'Edit current code' }).click()
    await expect(app.getByTestId('current-unlock-code')).toHaveValue(PIN)
    await app.getByRole('button', { name: 'Enter new code' }).click()
    await expect(app.getByTestId('new-unlock-code')).toHaveValue('7924138')
    await app.getByRole('button', { name: 'Change code', exact: true }).click()
    await expect(app.getByRole('heading', { name: 'Unlock ArxHub' })).toBeVisible()
    await tap(app, '7924138')
    await app.getByRole('button', { name: 'Unlock', exact: true }).click()
    await waitForApp(app)
  })

  test('refuses letters and a code below the minimum before anything is locked', async ({ app }) => {
    await openSecuritySettings(app)
    const entry = app.getByTestId('new-unlock-code')
    const lock = app.getByRole('button', { name: 'Lock this device' })

    await entry.focus()
    await app.keyboard.type('abcdef')
    await expect(entry).toHaveValue('')
    await expect(lock).toBeDisabled()

    await tap(app, '12345')
    await expect(lock).toBeDisabled()

    await tap(app, '6')
    await expect(lock).toBeEnabled()
  })
})
