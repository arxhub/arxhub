import { expect, test } from './fixtures'

test.describe('application boot', () => {
  test('comes up with the shell and its mini-apps', async ({ app }) => {
    await expect(app.getByRole('button', { name: 'Explorer' })).toBeVisible()
    await expect(app.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
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
