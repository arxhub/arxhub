import { expect, openNavigation, test } from './fixtures'

// UJ-13 end to end: the owner marks a note published, and a reader with no identity opens it.
// The dev stand is both the app and the publish server, so the origin under test is its own.
test.describe('publishing a note', () => {
  test('an arx note can be shared, read without the app, updated and revoked', async ({ app, vault, baseURL, browser }, testInfo) => {
    const raw = JSON.stringify({
      version: 1,
      doc: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Shared note' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Readable by anyone', marks: [{ type: 'strong' }] }] },
          {
            type: 'task_list',
            content: [
              {
                type: 'task_item',
                attrs: { checked: true },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Finished task' }] }],
              },
            ],
          },
        ],
      },
    })
    const path = await vault.write(`${testInfo.project.name}-Запись #1.arx`, raw)

    // Seeded as a file rather than typed into the settings form: the plugin reads its config once at
    // start, and driving the form would only test the form.
    await vault.writeData('storage/publish/config.toml', `serverUrl = "${baseURL}"\n`)
    await app.reload()

    await openNavigation(app)
    await app.getByRole('treeitem', { name: path }).click({ button: 'right' })
    await app.getByRole('menuitem', { name: 'Publish', exact: true }).click()
    const notifications = app.getByRole('region', { name: /Notifications/ })
    await expect(notifications.getByText('Published', { exact: true })).toBeVisible()

    await app.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await openNavigation(app)
    await app.getByRole('treeitem', { name: path }).click({ button: 'right' })
    await app.getByRole('menuitem', { name: 'Copy public link' }).click()
    await expect(notifications.getByText('Link copied', { exact: true })).toBeVisible()
    const publicUrl = await app.evaluate(() => navigator.clipboard.readText())
    expect(publicUrl).toBe(`${baseURL}/api/publish/public/${encodeURIComponent(path)}`)

    // A clean reader has no identity or app storage and does not need JavaScript to read the note.
    const anonymous = await browser.newContext({ javaScriptEnabled: false, viewport: app.viewportSize() })
    try {
      const reader = await anonymous.newPage()
      await reader.goto(publicUrl)
      await expect(reader.getByRole('heading', { name: 'Shared note', exact: true })).toBeVisible()
      await expect(reader.locator('article strong')).toHaveText('Readable by anyone')
      await expect(reader.getByRole('checkbox', { name: 'Completed task' })).toBeChecked()
      await expect(reader.getByRole('checkbox', { name: 'Completed task' })).toBeDisabled()
      const sourceUrl = await reader.getByRole('link', { name: 'Download source' }).getAttribute('href')
      expect(sourceUrl).toBe(`/api/publish/public/${encodeURIComponent(path)}?source=1`)
      expect(await (await anonymous.request.get(`${baseURL}${sourceUrl}`)).text()).toBe(raw)

      await openNavigation(app)
      await app.getByRole('treeitem', { name: path }).click()
      const editor = app.locator('.ProseMirror:visible')
      await expect(editor).toBeVisible()
      await editor.click()
      await app.keyboard.press('ControlOrMeta+End')
      await app.keyboard.type(' Updated on the owner device.')
      await app.keyboard.press('ControlOrMeta+s')
      await expect.poll(() => vault.read(path)).toContain('Updated on the owner device.')
      await openNavigation(app)
      await app.getByRole('treeitem', { name: path }).click({ button: 'right' })
      await app.getByRole('menuitem', { name: 'Republish', exact: true }).click()
      await expect.poll(async () => (await anonymous.request.get(publicUrl)).text()).toContain('Updated on the owner device.')
      await reader.reload()
      await expect(reader.locator('article')).toContainText('Updated on the owner device.')

      await openNavigation(app)
      await app.getByRole('treeitem', { name: path }).click({ button: 'right' })
      await app.getByRole('menuitem', { name: 'Unpublish' }).click()
      await expect(notifications.getByText('Unpublished', { exact: true })).toBeVisible()

      await expect.poll(async () => (await anonymous.request.get(publicUrl)).status()).toBe(404)
      expect((await anonymous.request.get(`${baseURL}${sourceUrl}`)).status()).toBe(404)
      const revoked = await reader.reload()
      expect(revoked?.status()).toBe(404)
      await expect(reader.getByRole('heading', { name: 'Shared note', exact: true })).toHaveCount(0)
    } finally {
      await anonymous.close()
    }
  })

  test('an unpublished path is not readable', async ({ app, vault }) => {
    const path = await vault.write('private.md', 'secret\n')
    // Nothing published in this test at all: the anonymous surface must still answer nothing.
    const response = await app.request.get(`/api/publish/public/${path}`)
    expect(response.status()).toBe(404)
  })
})
