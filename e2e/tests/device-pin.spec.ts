import type { Page } from '@playwright/test'
import { expect, isMobileFrame, openSecuritySettings, test, waitForApp } from './fixtures'
import { lockDevice, securityTask } from './security-helpers'

const PIN = '481625'
const OTHER_PIN = '792413'

// The dev stand seeds a plaintext identity and boots without `requireLock`, so the first-run "create a
// code" screen never appears here — only the unlock gate does, and only after a lock is set from Security
// settings. That is the whole reachable surface of the keypad in e2e, and it is what these drive.
async function tap(app: Page, digits: string): Promise<void> {
  for (const digit of digits) await app.getByTestId(`pin-key-${digit}`).click()
}

// The gate takes the code the way its frame does: the phone's keypad, the desktop's own keyboard. The
// frame is asked for before the lock goes on — isMobileFrame waits for the app, which a gate is not.
async function enterEntry(app: Page, mobile: boolean, testId: string, digits: string): Promise<void> {
  if (mobile) {
    await tap(app, digits)
    return
  }
  await app.getByTestId(testId).focus()
  await app.keyboard.type(digits)
}

async function enterCode(app: Page, mobile: boolean, digits: string): Promise<void> {
  await enterEntry(app, mobile, 'unlock-code', digits)
}

function gateHeading(app: Page) {
  return app.getByRole('heading', { name: 'ArxHub', exact: true })
}

async function lockWithKeypad(app: Page, code = PIN): Promise<void> {
  await openSecuritySettings(app)
  await lockDevice(app, code)
}

test.describe('The device lock is a six-digit code', () => {
  test('sets the code by tapping and opens the gate on the sixth digit', async ({ app }) => {
    const mobile = await isMobileFrame(app)
    await lockWithKeypad(app)

    await enterCode(app, mobile, PIN)
    await waitForApp(app)
  })

  test('takes the code from a hardware keyboard', async ({ app }) => {
    await lockWithKeypad(app)

    await app.getByTestId('unlock-code').focus()
    await app.keyboard.type(PIN)
    await waitForApp(app)
  })

  test('the desktop gate is a field, not a keypad', async ({ app }) => {
    test.skip(await isMobileFrame(app), 'desktop gate only')
    await lockWithKeypad(app)

    await expect(app.getByTestId('pin-key-1')).toHaveCount(0)
    await expect(app.getByTestId('unlock-code')).toHaveAttribute('maxlength', '6')
    await expect(app.getByRole('button', { name: 'Unlock' })).toHaveCount(0)
  })

  test('types a code after tabbing into the mobile keypad without a hidden-input focus helper', async ({ app }) => {
    test.skip(!(await isMobileFrame(app)), 'mobile keypad only')
    await openSecuritySettings(app)
    await app.getByTestId('security-lock').click()
    const key = app.getByTestId('pin-key-1')
    for (let steps = 0; steps < 40; steps++) {
      await app.keyboard.press('Tab')
      if (await key.evaluate((element) => element === document.activeElement)) break
    }
    await expect(key).toBeFocused()

    const input = app.getByTestId('new-unlock-code')
    await app.keyboard.type(PIN.slice(0, 4))
    await expect(input).toHaveValue(PIN.slice(0, 4))
    await expect(key).toBeFocused()
    await app.keyboard.press('Backspace')
    await expect(input).toHaveValue(PIN.slice(0, 3))
    await app.keyboard.press('Delete')
    await expect(input).toHaveValue(PIN.slice(0, 2))
    await app.keyboard.type(PIN.slice(2))
    // The sixth digit submits: the repeat step is the next thing on screen.
    await expect(app.getByRole('dialog', { name: 'Repeat the code' })).toBeVisible()
  })

  test('shows six dots on the phone and deletes a digit from the pad', async ({ app }, testInfo) => {
    test.skip(!(await isMobileFrame(app)), 'mobile keypad only')
    await lockWithKeypad(app)

    const entry = app.getByTestId('mobile-pin-entry')
    const input = entry.locator('input[type="password"]')
    await expect(input).toHaveAttribute('inputmode', 'none')

    // Keys fill the column three to a row, at the 64px step's height.
    const keyBox = await app.getByTestId('pin-key-1').boundingBox()
    const lastBox = await app.getByTestId('pin-key-3').boundingBox()
    const padBox = await entry.getByRole('group', { name: 'Numeric keypad' }).boundingBox()
    expect(keyBox).not.toBeNull()
    const size = await entry.evaluate((el) => Number.parseFloat(getComputedStyle(el).getPropertyValue('--size-2xl')))
    expect(keyBox?.height).toBeCloseTo(size, 0)
    expect(keyBox?.x).toBeCloseTo(padBox?.x ?? 0, 0)
    expect((lastBox?.x ?? 0) + (lastBox?.width ?? 0)).toBeCloseTo((padBox?.x ?? 0) + (padBox?.width ?? 0), 0)

    const filled = entry.locator('.dot.filled')
    await expect(entry.locator('.dot')).toHaveCount(6)
    await tap(app, '12345')
    await expect(filled).toHaveCount(5)
    await expect(entry.locator('.dots')).toHaveAttribute('aria-hidden', 'true')
    await testInfo.attach('mobile-pin-keypad', { body: await app.screenshot(), contentType: 'image/png' })

    const deleteKey = app.getByTestId('pin-key-delete')
    await deleteKey.click()
    await expect(filled).toHaveCount(4)
    await expect(input).toHaveValue('1234')
    // A six-digit lock has nothing to confirm, so the keypad carries no confirm key.
    await expect(app.getByTestId('pin-key-confirm')).toHaveCount(0)
    for (let i = 0; i < 4; i++) await deleteKey.click()

    await tap(app, PIN)
    await waitForApp(app)
  })

  test('deletes a digit from the keyboard before the sixth one submits', async ({ app }) => {
    await lockWithKeypad(app)

    const gate = app.getByTestId('unlock-code')
    await gate.focus()
    await app.keyboard.type(PIN.slice(0, 5))
    await app.keyboard.press('Backspace')
    await expect(gate).toHaveValue(PIN.slice(0, 4))
    await expect(gateHeading(app)).toBeVisible()

    await app.keyboard.type(PIN.slice(4))
    await waitForApp(app)
  })

  test('a wrong code is refused out loud and clears the entry', async ({ app }) => {
    const mobile = await isMobileFrame(app)
    await lockWithKeypad(app)

    await enterCode(app, mobile, '000000')

    await expect(app.getByRole('alert')).toContainText('Wrong code')
    await expect(app.getByTestId('unlock-code')).toHaveValue('')
    await expect(app.getByRole('main')).toBeHidden()

    await enterCode(app, mobile, PIN)
    await waitForApp(app)
  })

  test('says honestly what a forgotten code costs', async ({ app }) => {
    await lockWithKeypad(app)

    await app.getByRole('button', { name: 'Forgot the code?' }).click()
    const surface = app.getByRole('dialog', { name: 'Forgot the code?' })
    await expect(surface).toBeVisible()
    await expect(surface).toContainText("The code can't be recovered")
    await expect(surface.getByRole('button', { name: 'Erase and connect again' })).toBeVisible()

    await surface.getByRole('button', { name: 'Close' }).click()
    await expect(surface).toBeHidden()
    await expect(gateHeading(app)).toBeVisible()
  })

  test('says what the lock is worth rather than implying more', async ({ app }) => {
    await openSecuritySettings(app)
    await app.getByTestId('security-lock').click()

    await expect(securityTask(app)).toContainText('copy of this profile')
  })

  test('changes the code in three steps, each on its sixth digit', async ({ app }) => {
    const mobile = await isMobileFrame(app)
    await lockWithKeypad(app)
    await enterCode(app, mobile, PIN)
    await waitForApp(app)
    await openSecuritySettings(app)

    await app.getByTestId('security-change-code').click()
    await expect(app.getByRole('dialog', { name: 'Enter the code' })).toBeVisible()
    await enterEntry(app, mobile, 'reentry-code', '000000')
    await expect(securityTask(app).getByRole('alert')).toContainText('Wrong code')
    await enterEntry(app, mobile, 'reentry-code', PIN)
    await expect(app.getByRole('dialog', { name: 'New code' })).toBeVisible()
    await enterEntry(app, mobile, 'new-unlock-code', OTHER_PIN)
    await expect(app.getByRole('dialog', { name: 'Repeat the code' })).toBeVisible()
    await enterEntry(app, mobile, 'repeat-unlock-code', PIN)
    await expect(securityTask(app).getByRole('alert')).toContainText("The codes don't match")
    await expect(app.getByRole('dialog', { name: 'New code' })).toBeVisible()
    await enterEntry(app, mobile, 'new-unlock-code', OTHER_PIN)
    await expect(app.getByRole('dialog', { name: 'Repeat the code' })).toBeVisible()
    await enterEntry(app, mobile, 'repeat-unlock-code', OTHER_PIN)

    await expect(gateHeading(app)).toBeVisible()
    await enterCode(app, mobile, OTHER_PIN)
    await waitForApp(app)
  })

  test('refuses letters, and takes no less than six digits', async ({ app }) => {
    const mobile = await isMobileFrame(app)
    await openSecuritySettings(app)
    await app.getByTestId('security-lock').click()
    const entry = app.getByTestId('new-unlock-code')

    await entry.focus()
    await app.keyboard.type('abcdef')
    await expect(entry).toHaveValue('')

    await enterEntry(app, mobile, 'new-unlock-code', '12345')
    await expect(entry).toHaveValue('12345')
    await expect(app.getByRole('dialog', { name: 'Create a code' })).toBeVisible()
  })
})
