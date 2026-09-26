import type { Page } from '@playwright/test'
import { expect } from './fixtures'

// Shared by the first-run specs: the gate screens exist before the shell, so the app's own frame signal
// (`isMobileFrame`) is not there to ask yet.

export const ENTRY_CODE = '481625'
export const IDENTITY_KEY = 'arxhub.keystore.identity.mnemonic'
export const VERIFIER_KEY = 'arxhub.keystore.__vault_check__'
export const ENTRY_KEY = 'arxhub.entry'

// Which frame the stand mounted, asked of the gate itself. The phone's code entry is a keypad; the
// desktop's is a field.
export async function isMobileGate(page: Page, testId: string): Promise<boolean> {
  await expect(page.getByTestId('mobile-pin-entry').or(page.getByTestId(testId)).first()).toBeVisible()
  return (await page.getByTestId('mobile-pin-entry').count()) > 0
}

export async function enterCode(page: Page, testId: string, digits: string): Promise<void> {
  if (await isMobileGate(page, testId)) {
    for (const digit of digits) await page.getByTestId(`pin-key-${digit}`).click()
    return
  }
  await page.getByTestId(testId).focus()
  await page.keyboard.type(digits)
}

// The code step of either road: "Step 1 of 4" for a new vault, "Step 3 of 4" for a device joining one.
export async function createCode(page: Page, step: 1 | 3 = 1): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Create a code' })).toBeVisible()
  await expect(page.getByText(`Step ${step} of 4`)).toBeVisible()
  await enterCode(page, 'setup-lock-code', ENTRY_CODE)
  await expect(page.getByRole('heading', { name: 'Repeat the code' })).toBeVisible()
  await enterCode(page, 'confirm-lock-code', ENTRY_CODE)
}
