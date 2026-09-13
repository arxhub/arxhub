import { expect, isMobileFrame, openNavigation, test } from './fixtures'

async function open(page: Parameters<typeof openNavigation>[0], name: string) {
  await page.getByRole('button', { name: 'Block actions', exact: true }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
}

test('columns retain content and use the frame layout after saving', async ({ app, vault }) => {
  const path = await vault.write(
    `${test.info().project.name}-columns.arx`,
    JSON.stringify({
      version: 1,
      doc: { type: 'doc', content: ['Left', 'Right'].map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) },
    }),
  )
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  await editor.locator('p').first().click()
  await open(app, 'Select all blocks')
  await open(app, '2 columns')
  const columns = editor.locator('[data-arx-column]')
  await expect(columns).toHaveText(['Left', 'Right'])
  const left = await columns.first().boundingBox()
  const right = await columns.last().boundingBox()
  if (!left || !right) throw new Error('Columns must be visible')
  if (await isMobileFrame(app)) expect(right.y).toBeGreaterThan(left.y)
  else expect(right.x).toBeGreaterThan(left.x)
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  await expect.poll(() => vault.read(path)).toContain('"type": "columns"')
  await app.reload()
  await expect(columns).toHaveText(['Left', 'Right'])
  await columns.first().locator('p').click()
  await open(app, 'Stack columns')
  await expect(editor.locator(':scope > p')).toHaveText(['Left', 'Right'])
})

test('modifier clicks select disjoint blocks for group actions', async ({ app, vault }) => {
  test.skip(await isMobileFrame(app), 'Mouse modifier selection')
  const path = await vault.write(
    'disjoint.arx',
    JSON.stringify({
      version: 1,
      doc: { type: 'doc', content: ['First', 'Untouched', 'Third'].map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) },
    }),
  )
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  await editor
    .locator('p')
    .first()
    .click({ modifiers: ['Control'] })
  await editor
    .locator('p')
    .last()
    .click({ modifiers: ['Control'] })
  await expect(editor.locator('.arx-block-selected')).toHaveText(['First', 'Third'])
  await open(app, 'Delete block')
  await expect(editor.locator('p')).toHaveText(['Untouched'])
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Undo', exact: true }).click()
  await expect(editor.locator('p')).toHaveText(['First', 'Untouched', 'Third'])
  await expect(editor.locator('.arx-block-selected')).toHaveText(['First', 'Third'])
})
