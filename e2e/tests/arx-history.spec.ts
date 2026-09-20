import { createHash } from 'node:crypto'
import type { Page } from '@playwright/test'
import { expect, openNavigation, test } from './fixtures'

async function versions(app: Page) {
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Saved versions', exact: true }).click()
  return app.getByRole('dialog', { name: 'Saved versions', exact: true })
}

test('restoring a version preserves the current draft, refuses a failed save and survives restart', async ({ app, vault }) => {
  const path = await vault.write(
    `${test.info().project.name}-history.arx`,
    JSON.stringify({ version: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First version' }] }] } }),
  )
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  await editor.fill('Second version')
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
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
  await expect(dialog.getByLabel('Version preview')).toContainText('First version')
  await dialog.getByRole('button', { name: 'Restore this version', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('current draft could not be saved')
  expect(await vault.read(path)).toContain('Second version')
  await expect(editor).toContainText('Third draft')
  fail = false
  await dialog.getByRole('button', { name: 'Restore this version', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(editor).toContainText('First version')
  expect(JSON.parse(await vault.read(path)).documentId).toBe(identity)
  await app.reload()
  await expect(editor).toContainText('First version')
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Read only', exact: true }).click()
  await expect(editor).toBeFocused()
  const reopened = await versions(app)
  const savedRows = reopened.getByRole('navigation', { name: 'Saved document versions' }).getByRole('button')
  await expect(savedRows).toHaveCount(4)
  await savedRows.nth(1).click()
  await expect(reopened.getByLabel('Version preview')).toContainText('Third draft')
  await expect(reopened.getByRole('button', { name: 'Restore this version' })).toBeDisabled()
  await reopened.getByRole('button', { name: 'Show raw .arx' }).click()
  await expect(reopened.getByLabel('Version preview')).toContainText('"documentId"')
})

test('a copied document gets its own history identity', async ({ app, vault }) => {
  const original = await vault.write(
    `${test.info().project.name}-original.arx`,
    JSON.stringify({ version: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Original' }] }] } }),
  )
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: original, exact: true }).click()
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  await expect(app.locator('.document-save-status')).toContainText('Saved')
  await expect.poll(async () => JSON.parse(await vault.read(original)).documentId).toBeTruthy()
  const saved = await vault.read(original)
  const copy = await vault.write(`${test.info().project.name}-copy.arx`, saved)
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: copy, exact: true }).click()
  await expect(app.locator('.ProseMirror:visible')).toContainText('Original')
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  await expect.poll(async () => JSON.parse(await vault.read(copy)).documentId).not.toBe(JSON.parse(saved).documentId)
  expect(JSON.parse(await vault.read(original)).documentId).toBe(JSON.parse(saved).documentId)
})

test('one block can be restored while a different edited block stays current', async ({ app, vault }) => {
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
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  await expect(app.locator('.document-save-status')).toContainText('Saved')
  await editor.locator('p').first().fill('First changed')
  await editor.locator('p').last().fill('Second changed')
  const dialog = await versions(app)
  // The OLDEST version is the one this asks about — the file as it stood before Save. The newest is
  // whatever autosave last wrote, so `.first()` names the saved original only while the debounce has not
  // expired: under load it names the edited draft instead, and a version equal to the draft has no block
  // changes to click.
  await dialog.getByRole('navigation', { name: 'Saved document versions' }).getByRole('button').last().click()
  await dialog
    .getByRole('navigation', { name: 'Changes from saved version' })
    .getByRole('button', { name: 'changed · First changed', exact: true })
    .click()
  await expect(dialog.getByLabel('Saved block preview')).toContainText('First original')
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
  await expect(dialog.getByLabel('Version preview')).toContainText('Legacy saved text')
  await expect.poll(() => vault.readData(legacy).catch(() => null)).toBeNull()
  const head = (await vault.readData('state/Repository/repo/head')).trim()
  expect(JSON.parse(await vault.readData(`state/Repository/repo/snapshots/${head}`)).files[`vault/${path}`].identity).toBe(id)
  await app.reload()
  const reopened = await versions(app)
  await expect(reopened.getByLabel('Version preview')).toContainText('Legacy saved text')
  await reopened.getByRole('button', { name: 'Restore this version', exact: true }).click()
  await expect.poll(() => vault.read(path)).toContain('Legacy saved text')
})
