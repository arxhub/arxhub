import { createHash } from 'node:crypto'
import type { Locator, Page } from '@playwright/test'
import { documentTool, expect, isMobileFrame, openNavigation, test } from './fixtures'

// The versions page stands in the editor's own column, in place of the document.
async function versions(app: Page) {
  await documentTool(app, 'Saved versions')
  const page = app.getByRole('region', { name: 'Saved versions', exact: true })
  await expect(page).toBeVisible()
  return page
}

function diffOf(page: Locator) {
  return page.getByTestId('diff-view')
}

// The phone has no side column: the page's commands sit in the band's «…» sheet.
async function restoreWholeVersion(app: Page, page: Locator): Promise<void> {
  if (await isMobileFrame(app)) {
    await page.getByTestId('diff-more').click()
    await app.getByTestId('diff-options').getByRole('button', { name: 'Restore this version', exact: true }).click()
  } else {
    await page.getByRole('button', { name: 'Restore this version', exact: true }).click()
  }
}

test('restoring a version preserves the current draft, refuses a failed save and survives restart', async ({ app, vault }) => {
  test.skip(await isMobileFrame(app), 'the restore flow is driven through the desktop column; the phone has its own smoke test')
  const path = await vault.write(
    `${test.info().project.name}-history.arx`,
    JSON.stringify({ version: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First version' }] }] } }),
  )
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  await editor.fill('Second version')
  await documentTool(app, 'Save')
  await expect.poll(() => vault.read(path)).toContain('Second version')
  await expect(app.locator('.document-save-status')).toContainText('Saved')
  const identity = JSON.parse(await vault.read(path)).documentId
  await app.reload()
  await expect(editor).toContainText('Second version')
  await editor.fill('Third draft')
  let fail = true
  await app.route(
    (url) => url.pathname.endsWith('/vfs/write') && url.searchParams.get('path') === `vault/${path}`,
    (route) => (fail ? route.fulfill({ status: 503, body: 'offline' }) : route.continue()),
  )
  const dialog = await versions(app)
  const rows = dialog.getByRole('navigation', { name: 'Saved document versions' }).getByRole('button')
  await expect(rows).toHaveCount(2)
  await rows.last().click()
  await expect(diffOf(dialog)).toContainText('First version')
  await dialog.getByRole('button', { name: 'Restore this version', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('current draft could not be saved')
  expect(await vault.read(path)).toContain('Second version')
  // The buffer stayed mounted under the page: the unsaved draft is still there once the page closes.
  await dialog.getByRole('button', { name: 'Close versions', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(editor).toContainText('Third draft')
  const retry = await versions(app)
  await retry.getByRole('navigation', { name: 'Saved document versions' }).getByRole('button').last().click()
  await expect(diffOf(retry)).toContainText('First version')
  fail = false
  await retry.getByRole('button', { name: 'Restore this version', exact: true }).click()
  await expect(retry).toHaveCount(0)
  await expect(editor).toContainText('First version')
  expect(JSON.parse(await vault.read(path)).documentId).toBe(identity)
  await app.reload()
  await expect(editor).toContainText('First version')
  await documentTool(app, 'Read only')
  await expect(editor).toBeFocused()
  const reopened = await versions(app)
  const savedRows = reopened.getByRole('navigation', { name: 'Saved document versions' }).getByRole('button')
  await expect(savedRows).toHaveCount(4)
  await savedRows.nth(1).click()
  await expect(diffOf(reopened)).toContainText('Third draft')
  await expect(reopened.getByRole('button', { name: 'Restore this version' })).toBeDisabled()
  await reopened.getByRole('button', { name: 'More', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Show JSON', exact: true }).click()
  await expect(diffOf(reopened)).toContainText('"text": "Third draft"')
})

test('a copied document gets its own history identity', async ({ app, vault }) => {
  const original = await vault.write(
    `${test.info().project.name}-original.arx`,
    JSON.stringify({ version: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Original' }] }] } }),
  )
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: original, exact: true }).click()
  await documentTool(app, 'Save')
  await expect(app.locator('.document-save-status')).toContainText('Saved')
  await expect.poll(async () => JSON.parse(await vault.read(original)).documentId).toBeTruthy()
  const saved = await vault.read(original)
  const copy = await vault.write(`${test.info().project.name}-copy.arx`, saved)
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: copy, exact: true }).click()
  await expect(app.locator('.ProseMirror:visible')).toContainText('Original')
  await documentTool(app, 'Save')
  await expect.poll(async () => JSON.parse(await vault.read(copy)).documentId).not.toBe(JSON.parse(saved).documentId)
  expect(JSON.parse(await vault.read(original)).documentId).toBe(JSON.parse(saved).documentId)
})

test('one block can be restored while a different edited block stays current', async ({ app, vault }) => {
  test.skip(await isMobileFrame(app), 'the restore flow is driven through the desktop column; the phone has its own smoke test')
  const path = await vault.write(
    `${test.info().project.name}-partial.arx`,
    JSON.stringify({
      version: 1,
      doc: {
        type: 'doc',
        content: ['First original', 'Second original'].map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
      },
    }),
  )
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  await documentTool(app, 'Save')
  await expect(app.locator('.document-save-status')).toContainText('Saved')
  await editor.locator('p').first().fill('First changed')
  await editor.locator('p').last().fill('Second changed')
  const dialog = await versions(app)
  // The OLDEST version is the one this asks about — the file as it stood before Save. The newest is
  // whatever autosave last wrote, so `.first()` names the saved original only while the debounce has not
  // expired: under load it names the edited draft instead, and a version equal to the draft has no block
  // changes to click.
  await dialog.getByRole('navigation', { name: 'Saved document versions' }).getByRole('button').last().click()
  // A block is chosen in the diff itself: focusing a change makes it the current stop.
  const change = dialog.locator('[data-diff-stop]').filter({ hasText: 'First' }).first()
  await change.click()
  await expect(change).toBeFocused()
  await expect(diffOf(dialog)).toContainText('First original')
  await dialog.getByRole('button', { name: 'Restore selected block', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(editor.locator('p')).toHaveText(['First original', 'Second changed'])
  await app.reload()
  await expect(editor.locator('p')).toHaveText(['First original', 'Second changed'])
})

test('legacy saved versions move into snapshot history and remain available after reopening', async ({ app, vault }) => {
  const id = test.info().project.name === 'mobile' ? '12345678-1234-4234-8234-123456789abc' : '12345678-1234-4234-8234-123456789def'
  const document = (text: string) =>
    JSON.stringify({ version: 1, documentId: id, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } })
  const path = await vault.write(`${test.info().project.name}-legacy-history.arx`, document('Current document'))
  const old = document('Legacy saved text')
  const hash = createHash('sha256').update(old).digest('hex')
  const legacy = `storage/ArxEditor/documents/${id}/0001700000000000-${hash}.json`
  await vault.writeData(legacy, JSON.stringify({ version: 1, documentId: id, path, content: old }))
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  await expect(app.locator('.ProseMirror:visible')).toContainText('Current document')
  const dialog = await versions(app)
  await expect(diffOf(dialog)).toContainText('Legacy saved text')
  await expect.poll(() => vault.readData(legacy).catch(() => null)).toBeNull()
  const head = (await vault.readData('state/Repository/repo/head')).trim()
  expect(JSON.parse(await vault.readData(`state/Repository/repo/snapshots/${head}`)).files[`vault/${path}`].identity).toBe(id)
  await app.reload()
  const reopened = await versions(app)
  await expect(diffOf(reopened)).toContainText('Legacy saved text')
  await restoreWholeVersion(app, reopened)
  await expect.poll(() => vault.read(path)).toContain('Legacy saved text')
})

test('the phone opens saved versions as a page with the diff band', async ({ app, vault }) => {
  test.skip(!(await isMobileFrame(app)), 'the phone realization of the versions page')
  const path = await vault.write(
    `${test.info().project.name}-versions-smoke.arx`,
    JSON.stringify({ version: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Saved text' }] }] } }),
  )
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  await documentTool(app, 'Save')
  await expect(app.locator('.document-save-status')).toContainText('Saved')
  // No edit after the save: an autosave landing while the page opens would list a version still being written.
  const page = await versions(app)
  await expect(diffOf(page)).toBeVisible()
  await expect(page.getByTestId('diff-band')).toBeVisible()
  await expect(editor).toHaveCount(0)
  await page.getByTestId('diff-more').click()
  await app.getByTestId('diff-options').getByRole('button', { name: 'Open document', exact: true }).click()
  await expect(page).toHaveCount(0)
  await expect(app.locator('.ProseMirror:visible')).toContainText('Saved text')
})
