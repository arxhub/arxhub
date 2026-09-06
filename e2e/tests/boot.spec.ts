import { expect, explorerLabel, openSettingsSection, test, withShellChrome } from './fixtures'

test.describe('application boot', () => {
  test('comes up with the shell and its mini-apps', async ({ app }) => {
    // The list is a permanent rail on desktop and lives behind the More key on a phone; the fixture
    // hands back whichever scope holds it. Explorer answers to a different name in each frame — see
    // explorerLabel — because its mobile rail took on more than the desktop one did.
    const explorer = await explorerLabel(app)
    await withShellChrome(app, async (chrome) => {
      await expect(chrome.getByRole('button', { name: explorer, exact: true })).toBeVisible()
      await expect(chrome.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
    })
  })

  test('reaches the working tree over the protected API', async ({ app }) => {
    // The dev stand guards /vfs with signed-request auth, so a rendered tree means the seeded
    // identity signed a request the server accepted — the whole client↔server chain, not just paint.
    const response = await app.request.get('/healthcheck')
    expect(response.status()).toBe(200)

    const failed = app.waitForResponse((r) => r.url().includes('/api/vfs') && r.status() === 401, { timeout: 3000 })
    await expect(failed).rejects.toThrow()
  })
})

test.describe('about', () => {
  test('reports the running version', async ({ app }) => {
    await openSettingsSection(app, 'About')
    // FR-210: the version has to be nameable when reporting a problem.
    await expect(app.getByTestId('app-version')).toHaveText(/^\d+\.\d+\.\d+/)
  })
})
