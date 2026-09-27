import type { Page } from '@playwright/test'
import { enterCode } from './entry-helpers'
import { expect, waitForApp } from './fixtures'

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

// Sync's address is shared config, and every other test of the project reads the same file — so the
// address this page sees is answered by a route on this page only, never written to the stand. The sync
// routes are refused for the same reason: this page must not sync the project's shared tree.
export async function serveSyncAddress(app: Page, serverUrl: string): Promise<void> {
  await app.route('**/api/sync/**', (route) => route.abort('connectionrefused'))
  await app.route('**/api/vfs/read?**', (route) => {
    const url = decodeURIComponent(route.request().url())
    if (!url.includes('sync/config.toml')) return route.fallback()
    return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: `serverUrl = "${serverUrl}"\n` })
  })
  await app.reload()
  await waitForApp(app)
}
