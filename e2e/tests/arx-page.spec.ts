import { expect, isMobileFrame, openNavigation, test } from './fixtures'

const doc = (text = 'Document body') =>
  JSON.stringify({ version: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } })
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR1sAAAAASUVORK5CYII=', 'base64')

test('arx inline title renames the file without adding a heading to its body', async ({ app, vault }) => {
  const path = await vault.write('inline.arx', doc())
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  await expect(editor).toContainText('Document body')
  const title = app.locator('.document-page-title [data-testid="document-name"]')
  await expect(title).toHaveText(path.replace(/\.arx$/, ''))
  if (!(await isMobileFrame(app))) {
    await expect(app.locator('.editor-panel > .strip')).toHaveCount(0)
    await expect(app.locator('.editor-panel .editor-status')).toHaveCount(0)
    await expect(app.locator('.panel-tab-bar').getByRole('button', { name: 'Document tools', exact: true })).toBeVisible()
  }
  await editor.fill('Keep this unsaved text')
  await title.click()
  const input = app.getByRole('textbox', { name: 'New name', exact: true })
  await input.fill('renamed-inline-title')
  await input.press('Enter')
  await expect(title).toHaveText('renamed-inline-title')
  await expect(editor).toContainText('Keep this unsaved text')
  await expect.poll(() => vault.read('renamed-inline-title.arx')).toContain('Keep this unsaved text')
  const raw = JSON.parse(await vault.read('renamed-inline-title.arx'))
  expect(raw.doc.content.some((block: { type: string }) => block.type === 'heading')).toBe(false)
  await expect.poll(() => vault.read(path).catch(() => null)).toBeNull()
})

test('page icon and local cover survive saving and reopening and can be removed', async ({ app, vault }) => {
  const path = await vault.write('appearance.arx', doc())
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  await expect(app.locator('.ProseMirror:visible')).toBeVisible()
  const configure = async () => {
    await app.getByRole('button', { name: 'Document tools', exact: true }).click()
    await app.getByRole('menuitem', { name: 'Page icon and cover', exact: true }).click()
    return app.getByRole('dialog', { name: 'Page icon and cover', exact: true })
  }
  let dialog = await configure()
  await dialog.getByRole('button', { name: 'Star', exact: true }).click()
  await dialog.getByLabel('Choose page cover').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: png })
  await expect(dialog.getByText('cover.png', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(app.getByRole('img', { name: 'Page cover', exact: true })).toBeVisible()
  await expect
    .poll(() => app.getByRole('img', { name: 'Page cover', exact: true }).evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0)
  await expect.poll(async () => JSON.parse(await vault.read(path)).appearance?.icon).toBe('lu:star')
  const raw = JSON.parse(await vault.read(path))
  expect(raw.appearance.cover.path).toMatch(/^attachments\//)
  expect(raw.doc.content[0].type).toBe('paragraph')
  if (!(await isMobileFrame(app))) {
    await expect(app.locator('.tab.active svg.lucide-star')).toHaveCount(1)
    await expect(app.getByRole('treeitem', { name: path, exact: true }).locator('svg.lucide-star')).toHaveCount(1)
  }
  await app.reload()
  await expect(app.getByRole('img', { name: 'Page cover', exact: true })).toBeVisible()
  await expect
    .poll(() => app.getByRole('img', { name: 'Page cover', exact: true }).evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0)
  await expect(app.locator('.document-page-title svg.lucide-star')).toHaveCount(1)
  dialog = await configure()
  await dialog.getByRole('button', { name: 'Remove icon', exact: true }).click()
  await dialog.getByRole('button', { name: 'Remove cover', exact: true }).click()
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(app.getByRole('img', { name: 'Page cover', exact: true })).toHaveCount(0)
  await expect.poll(async () => JSON.parse(await vault.read(path)).appearance).toEqual({ icon: null, cover: null })
})

test('each split keeps its own document menu and save failures stay visible with retry', async ({ app, vault }) => {
  test.skip(await isMobileFrame(app), 'desktop split chrome')
  const first = await vault.write('first.arx', doc('First document'))
  const second = await vault.write('second.arx', doc('Second document'))
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: first, exact: true }).click()
  await expect(app.locator('.ProseMirror:visible')).toHaveText('First document')
  await app.getByRole('treeitem', { name: second, exact: true }).click()
  await expect(app.locator('.ProseMirror:visible')).toHaveText('Second document')
  await app.getByRole('button', { name: 'Split right', exact: true }).click()
  const left = app
    .locator('.panel-group-view')
    .filter({ has: app.locator('[data-testid="document-name"]', { hasText: first.replace(/\.arx$/, '') }) })
  const right = app
    .locator('.panel-group-view')
    .filter({ has: app.locator('[data-testid="document-name"]', { hasText: second.replace(/\.arx$/, '') }) })
  await left.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Read only', exact: true }).click()
  await expect(left.locator('.ProseMirror:visible')).toHaveAttribute('contenteditable', 'false')
  await expect(right.locator('.ProseMirror:visible')).toHaveAttribute('contenteditable', 'true')
  let fail = true
  await app.route(
    (url) => url.pathname.endsWith('/vfs/write') && url.searchParams.get('path') === `vault/${second}`,
    (route) => (fail ? route.fulfill({ status: 503, body: 'offline' }) : route.continue()),
  )
  await right.locator('.ProseMirror:visible').fill('Unsaved second')
  await expect(right.getByRole('status', { name: 'Unsaved changes', exact: true })).toBeVisible()
  await right.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  await expect(right.getByRole('alert')).toContainText('Save failed')
  await expect(right.getByRole('status', { name: 'Save failed', exact: true })).toBeVisible()
  fail = false
  await right.getByRole('button', { name: 'Retry save', exact: true }).click()
  await expect.poll(() => vault.read(second)).toContain('Unsaved second')
  await expect(right.getByRole('alert')).toHaveCount(0)
  await expect(left.locator('.ProseMirror:visible')).toHaveText('First document')
})
