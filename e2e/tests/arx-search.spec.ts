import { expect, openNavigation, test } from './fixtures'

test('document search replaces marked text, undoes and navigates headings in protected modes', async ({ app, vault }) => {
  const path = await vault.write(
    `${test.info().project.name}-find.arx`,
    JSON.stringify({
      version: 1,
      doc: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Introduction' }] },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Cat ' },
              { type: 'text', text: 'cat', marks: [{ type: 'strong' }] },
            ],
          },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Conclusion' }] },
        ],
      },
    }),
  )
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  await expect(editor).toBeVisible()
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Find in document', exact: true }).click()
  const find = app.getByRole('search', { name: 'Find in document' })
  await find.getByRole('textbox', { name: 'Find text', exact: true }).fill('cat')
  await expect(find).toContainText('1 of 2')
  await find.getByText('Match case', { exact: true }).click()
  await expect(find).toContainText('1 of 1')
  await find.getByText('Match case', { exact: true }).click()
  await find.getByRole('textbox', { name: 'Replace with' }).fill('dog')
  await find.getByRole('button', { name: 'Replace all', exact: true }).click()
  await expect(editor.locator('p')).toHaveText('dog dog')
  await find.getByRole('button', { name: 'Close find' }).click()
  await editor.focus()
  await app.keyboard.press('ControlOrMeta+z')
  await expect(editor.locator('p')).toHaveText('Cat cat')
  for (const mode of ['Read only', 'Interactive']) {
    await app.getByRole('button', { name: 'Document tools', exact: true }).click()
    await app.getByRole('menuitem', { name: mode, exact: true }).click()
    await expect(editor).toBeFocused()
    await app.keyboard.press('ControlOrMeta+f')
    await expect(find).toBeVisible()
    await find.getByRole('textbox', { name: 'Find text', exact: true }).fill('cat')
    await expect(find).toContainText('1 of 2')
    await expect(find.getByRole('textbox', { name: 'Replace with' })).toHaveCount(0)
    await find.getByRole('button', { name: 'Next match' }).click()
    await expect(find).toContainText('2 of 2')
    await find.getByRole('button', { name: 'Close find' }).click()
  }
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Document outline', exact: true }).click()
  await app.getByRole('navigation', { name: 'Document headings' }).getByRole('button', { name: 'Conclusion' }).click()
  await expect(app.getByRole('dialog', { name: 'Document outline' })).toHaveCount(0)
  await expect
    .poll(() =>
      editor.evaluate(() => {
        const node = window.getSelection()?.anchorNode
        return (node instanceof Element ? node : node?.parentElement)?.closest('h2')?.textContent
      }),
    )
    .toBe('Conclusion')
})
