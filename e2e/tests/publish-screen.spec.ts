import type { Page } from '@playwright/test'
import { confirmPublish, expect, openNavigation, openType, publicationAction, publishTest as test } from './fixtures'

interface HistoryEntry {
  hash: string
  roots: string[]
  kind: string
}

// Success toasts stack over the top-right of the desktop frame — exactly where this page's row actions sit —
// and a pointer resting on one pauses its timer, so a click that lands there is swallowed and the toast then
// never leaves. Every toast has a Dismiss control; use it, rather than waiting on a clock.
async function dismissToasts(app: Page): Promise<void> {
  const notifications = app.getByRole('region', { name: /Notifications/ })
  for (const close of await notifications.getByRole('button', { name: 'Dismiss' }).all()) await close.click().catch(() => undefined)
  await expect(notifications.getByRole('status')).toHaveCount(0)
}

// The Publications type in one pass through both frames: what is public and at what address, what it used
// to be, and that "roll back" really puts the earlier edition in front of an anonymous reader again.
// Publishing itself still starts in the tree — the screen is where the owner sees and revises it.
test('the Publications type lists what is public, and a roll back serves the earlier edition', async ({ app, vault, baseURL }, testInfo) => {
  const arx = (text: string) =>
    JSON.stringify({ version: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } })
  const path = await vault.write(`${testInfo.project.name}-screen.arx`, arx('First edition'))
  await vault.writeData('storage/publish/config.toml', `serverUrl = "${baseURL}"\n`)
  await app.reload()

  await openNavigation(app)
  await app.getByRole('treeitem', { name: path }).click({ button: 'right' })
  await app.getByRole('menuitem', { name: 'Publish', exact: true }).click()
  await confirmPublish(app)
  const notifications = app.getByRole('region', { name: /Notifications/ })
  await expect(notifications.getByText('Published', { exact: true })).toBeVisible()
  const publicUrl = `${baseURL}/api/publish/public/${encodeURIComponent(path)}`
  expect(await (await app.request.get(publicUrl)).text()).toContain('First edition')

  // Unpinned, so the sheet's "Open new" is the way in — the same road as Search and Logs.
  await openType(app, 'Publications', 'arxhub.publish')
  await expect(app.getByRole('heading', { name: 'Publications' })).toBeVisible()
  const publications = app.getByTestId('publications')
  const row = publications.getByRole('listitem').filter({ hasText: path })
  await expect(row).toBeVisible()
  await expect(row).toContainText(publicUrl)
  const history = app.getByTestId('publication-history')
  await expect(history.getByRole('listitem').first()).toContainText('Published')
  await expect(history.getByRole('listitem').first().getByText('Current')).toBeVisible()

  // The first edition's hash, read from the record itself rather than the newest row: the journal is the
  // whole store's, and the oldest entry that knows this path can only be the one this test just made.
  const entries: HistoryEntry[] = JSON.parse(await vault.readData('storage/publish/history.json'))
  const first = entries.filter((entry) => entry.roots.includes(path)).at(-1)
  if (first == null) throw new Error('the first publish left no history entry')
  const firstShort = first.hash.slice(0, 8)
  await expect(history.getByRole('listitem').filter({ hasText: firstShort })).toBeVisible()

  await openType(app, 'Notes')
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path }).click()
  const editor = app.locator('.ProseMirror:visible')
  await expect(editor).toBeVisible()
  await editor.click()
  await app.keyboard.press('ControlOrMeta+End')
  await app.keyboard.type(' Second edition.')
  await app.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => vault.read(path)).toContain('Second edition.')

  // Republish from the screen, not the tree.
  await openType(app, 'Publications', 'arxhub.publish')
  await dismissToasts(app)
  await publicationAction(row, 'Republish')
  await expect(notifications.getByText('Published', { exact: true })).toBeVisible()
  await expect.poll(async () => (await app.request.get(publicUrl)).text()).toContain('Second edition.')
  await expect(history.getByRole('listitem').filter({ hasText: firstShort }).getByRole('button', { name: 'Roll back' })).toBeVisible()

  await dismissToasts(app)
  await history.getByRole('listitem').filter({ hasText: firstShort }).getByRole('button', { name: 'Roll back' }).click()
  await expect(notifications.getByText('Rolled back', { exact: true })).toBeVisible()
  await expect.poll(async () => (await app.request.get(publicUrl)).text()).toContain('First edition')
  expect(await (await app.request.get(publicUrl)).text()).not.toContain('Second edition.')
  // The return is an entry of its own, and the newest entry is the head: it wears the mark, offers no return.
  const rolledBack = history.getByRole('listitem').filter({ hasText: 'Rolled back' }).filter({ hasText: firstShort })
  await expect(rolledBack).toBeVisible()
  await expect(history.getByRole('listitem').first().getByText('Current')).toBeVisible()
  await expect(history.getByRole('listitem').first().getByRole('button', { name: 'Roll back' })).toHaveCount(0)

  await dismissToasts(app)
  await publicationAction(row, 'Unpublish')
  await expect(notifications.getByText('Unpublished', { exact: true })).toBeVisible()
  await expect(publications.getByRole('listitem').filter({ hasText: path })).toHaveCount(0)
  await expect.poll(async () => (await app.request.get(publicUrl)).status()).toBe(404)
  await expect(history.getByRole('listitem').first()).toContainText('Unpublished')
})

test('the screen says so when publishing is off', async ({ app, vault }) => {
  await vault.writeData('storage/publish/config.toml', 'serverUrl = ""\n')
  await app.reload()
  // openType waits for <main>; applyConfig still runs inside start() and may paint the previous
  // URL for a tick when another publishTest left one on disk — poll the off flag, not a fixed sleep.
  await openType(app, 'Publications', 'arxhub.publish')
  await expect(app.getByRole('heading', { name: 'Publications' })).toBeVisible()
  const page = app.getByTestId('publications-page')
  await expect(page).toHaveAttribute('data-publishing', 'off', { timeout: 15_000 })
  await expect(page.getByText('Publishing is off — set a server URL in Settings')).toBeVisible()
  await expect(app.getByTestId('publications')).toHaveCount(0)
  await expect(app.getByTestId('publishing-off-hint')).toHaveText('Turn publishing on to share a note or a folder by link.')
})
