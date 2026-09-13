import { expect, openNavigation, test } from './fixtures'

const document = (text: string) =>
  JSON.stringify({ version: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } })

test('encrypted draft survives reload before autosave and can be restored', async ({ app, vault }) => {
  const path = await vault.write(`${test.info().project.name}-draft.arx`, document('Saved'))
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  await editor.locator('p').click()
  await app.keyboard.press('End')
  await app.keyboard.insertText(' unsaved secret')
  expect(
    await app.evaluate(() =>
      Object.entries(localStorage)
        .filter(([key]) => key.startsWith('arxhub.editor.drafts.'))
        .every(([, value]) => !value.includes('unsaved secret')),
    ),
  ).toBe(true)
  await app.reload()
  const recovery = app.getByRole('dialog', { name: 'Recover unsaved draft', exact: true })
  await expect(recovery.getByLabel('Draft preview')).toContainText('Saved unsaved secret')
  await recovery.getByRole('button', { name: 'Recover draft', exact: true }).click()
  await expect(recovery).toBeHidden()
  await expect(editor).toContainText('Saved unsaved secret')
  await expect.poll(() => vault.read(path)).toContain('Saved unsaved secret')
})

test('external edits are preserved when an unsaved buffer is saved as a recovery copy', async ({ app, vault }) => {
  const path = await vault.write(`${test.info().project.name}-conflict.arx`, document('Original'))
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  await editor.locator('p').click()
  await app.keyboard.press('End')
  await app.keyboard.insertText(' local draft')
  await vault.writeData(`vault/${path}`, document('External edit'))
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  const recovery = app.getByRole('dialog', { name: 'File changed outside this editor', exact: true })
  await expect(recovery.getByLabel('Saved file preview')).toContainText('External edit')
  await expect(recovery.getByLabel('Draft preview')).toContainText('Original local draft')
  await recovery.getByRole('button', { name: 'Keep both', exact: true }).click()
  await expect(recovery).toBeHidden()
  await expect(editor).toContainText('Original local draft')
  expect(await vault.read(path)).toContain('External edit')
  expect(await vault.read(path.replace(/\.arx$/, ' recovered.arx'))).toContain('Original local draft')
})
