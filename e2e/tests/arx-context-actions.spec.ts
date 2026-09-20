import { expect, openNavigation, test } from './fixtures'

test('formatting follows selection and edits autosave without a top toolbar', async ({ app, vault }) => {
  const path = await vault.write(
    `${test.info().project.name}-context.arx`,
    JSON.stringify({
      version: 1,
      doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Selected words' }] }] },
    }),
  )
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  const formatting = app.getByRole('toolbar', { name: 'Formatting', exact: true })
  await expect(editor).toBeVisible()
  await expect(formatting).toHaveCount(0)
  await expect(app.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
  await editor.locator('p').click()
  await app.keyboard.press('Home')
  await app.keyboard.press('Shift+End')
  await expect(formatting).toBeVisible()
  await app.getByRole('button', { name: 'Bold', exact: true }).click()
  await expect(editor.locator('strong')).toHaveText('Selected words')
  await app.keyboard.press('ArrowRight')
  await expect(formatting).toHaveCount(0)
  await app.keyboard.insertText(' autosaved')
  await expect.poll(() => vault.read(path)).toContain('autosaved')
  await expect(app.locator('.document-save-status')).toContainText('Saved')
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await expect(app.getByRole('menuitem', { name: 'Saved versions', exact: true })).toBeVisible()
  await app.getByRole('menuitem', { name: 'Read only', exact: true }).click()
  await expect(editor).toHaveAttribute('contenteditable', 'false')
  await expect(app.getByRole('button', { name: 'Insert block', exact: true })).toHaveCount(0)
})
