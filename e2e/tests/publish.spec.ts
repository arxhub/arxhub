import { expect, openNavigation, test } from './fixtures'

// UJ-13 end to end: the owner marks a note published, and a reader with no identity opens it.
// The dev stand is both the app and the publish server, so the origin under test is its own.
test.describe('publishing a note', () => {
  test('a published note is readable without an identity, and unpublishing takes it back', async ({ app, vault, baseURL }) => {
    const path = await vault.write('public.md', '# Shared\n\nreadable by anyone\n')

    // Seeded as a file rather than typed into the settings form: the plugin reads its config once at
    // start, and driving the form would only test the form.
    await vault.writeData('storage/publish/config.toml', `serverUrl = "${baseURL}"\n`)
    await app.reload()

    await openNavigation(app)
    await app.getByRole('treeitem', { name: path }).click({ button: 'right' })
    await app.getByRole('menuitem', { name: 'Publish', exact: true }).click()
    const notifications = app.getByRole('region', { name: /Notifications/ })
    await expect(notifications.getByText('Published', { exact: true })).toBeVisible()

    // No signing, no cookies, nothing the app put in the browser — this is the anonymous reader, and
    // the one hole the auth guard deliberately leaves open.
    const publicUrl = `/api/publish/public/${path}`
    await expect.poll(async () => (await app.request.get(publicUrl)).status(), { timeout: 15_000 }).toBe(200)
    expect(await (await app.request.get(publicUrl)).text()).toContain('readable by anyone')

    await openNavigation(app)
    await app.getByRole('treeitem', { name: path }).click({ button: 'right' })
    await app.getByRole('menuitem', { name: 'Unpublish' }).click()
    await expect(notifications.getByText('Unpublished', { exact: true })).toBeVisible()

    await expect.poll(async () => (await app.request.get(publicUrl)).status(), { timeout: 15_000 }).toBe(404)
  })

  test('an unpublished path is not readable', async ({ app, vault }) => {
    const path = await vault.write('private.md', 'secret\n')
    // Nothing published in this test at all: the anonymous surface must still answer nothing.
    const response = await app.request.get(`/api/publish/public/${path}`)
    expect(response.status()).toBe(404)
  })
})
