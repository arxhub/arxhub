import { expect, openNavigation, test, withShellChrome } from './fixtures'

// A refused request used to be invisible: the toolbar awaited the write with nothing to catch it, so a
// server that would not accept this device produced an unhandled rejection in the console and a button
// that looked broken. The server half of this (which reason it sends, and exposing it through CORS) is
// covered by plugins/protection guard.test.ts — this covers the half the user actually meets.
//
// Only /vfs/write is refused, so the app still boots and the tree still lists: what is under test is
// that the refusal surfaces on its own, not that a wholly broken app looks broken.
test.describe('a server that refuses this device', () => {
  test.beforeEach(async ({ app }) => {
    await app.addInitScript(() => {
      const real = window.fetch
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        if (!url.includes('/api/vfs/write')) return real(input, init)
        return Promise.resolve(new Response('Unauthorized', { status: 401, headers: { 'x-arx-auth-reason': 'unknown-key' } }))
      }
    })
    await app.reload()
    // Not getByRole('main') as elsewhere: the dialog is modal, so while it is up the rest of the page is
    // hidden from the accessibility tree. Its presence IS the signal the app got far enough to refuse.
    await expect(app.getByRole('dialog')).toBeVisible()
  })

  // The logger writes a session file at boot, so the refusal is already standing before the user touches
  // anything — which is the point: nothing was clicked, and the app says what is wrong anyway.
  test('explains the refusal at boot, without being asked', async ({ app }) => {
    const dialog = app.getByRole('dialog')
    await expect(dialog).toContainText('does not recognise this device')
    // The reason, not just the failure — a stale pin and a wrong clock need opposite fixes.
    await expect(dialog).toContainText('unknown-key')
    // Both ways out, since only one of them is reachable from this device.
    await expect(dialog).toContainText('recovery phrase')
    await expect(dialog).toContainText('pinned-key')
    // Which key this device is actually presenting, so it can be compared with the server's pin.
    await expect(dialog).toContainText('xpub')
  })

  test('leaves a standing indicator, and reports each attempt without re-interrupting', async ({ app }) => {
    const dialog = app.getByRole('dialog')
    // Scoped to the action row: the dialog frame contributes a ✕ with the same accessible name.
    await dialog.locator('.auth-actions').getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toBeHidden()

    // The condition outlives the dialog — nothing in a running session fixes it — so the status bar keeps
    // saying so rather than letting a dismissed dialog pass for a resolved problem.
    await withShellChrome(app, async (chrome) => {
      await expect(chrome.getByRole('button', { name: 'Device not paired' })).toBeVisible()
    })

    await openNavigation(app)
    await app.getByRole('button', { name: '＋ File' }).click()

    // The action that failed says so on its own, naming what the server said about it.
    await expect(app.locator('.toast-title')).toHaveText('Could not create the file')
    await expect(app.locator('.toast-desc')).toContainText('Unauthorized')
    // Dismissed once is dismissed: the pill is the standing reminder, not a dialog on every attempt.
    await expect(dialog).toBeHidden()
  })
})
