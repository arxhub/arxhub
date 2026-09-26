import type { Page } from '@playwright/test'
import { enterCode } from './entry-helpers'
import { expect } from './fixtures'

// The surface a Security row opens — a dialog on the desktop, a sheet on the phone.
export function securityTask(app: Page) {
  return app.getByTestId('security-task')
}

// Locks the seeded (unlocked) device from Settings → Security: a new code and its repeat, each
// submitting itself on the sixth digit. Applying it reloads onto the unlock gate.
export async function lockDevice(app: Page, code: string): Promise<void> {
  await app.getByTestId('security-lock').click()
  await enterCode(app, 'new-unlock-code', code)
  await expect(app.getByRole('dialog', { name: 'Repeat the code' })).toBeVisible()
  await enterCode(app, 'repeat-unlock-code', code)
  await expect(app.getByRole('heading', { name: 'ArxHub', exact: true })).toBeVisible()
}
