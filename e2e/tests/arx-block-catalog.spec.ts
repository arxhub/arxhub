import { closeSettings, openBlockSettings, openProperties } from './arx-inspector-helpers'
import { expect, openNavigation, test } from './fixtures'

test('page properties are hidden by default and survive replacing the entire body', async ({ app, vault }) => {
  const path = await vault.write(
    'page-properties.arx',
    JSON.stringify({
      version: 1,
      doc: {
        type: 'doc',
        content: [
          { type: 'properties', attrs: { tags: ['keep'], favorite: false, fields: [{ key: 'Status', value: 'Draft' }] } },
          { type: 'paragraph', content: [{ type: 'text', text: 'Original body' }] },
        ],
      },
    }),
  )
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  const header = app.locator('.editor-panel:visible .document-page-header')
  await expect(editor.locator('[data-type="properties"]')).toHaveCount(0)
  await expect(header).not.toContainText('keep')
  await expect(app.getByRole('textbox', { name: 'Field value', exact: true })).toHaveCount(0)
  const properties = await openProperties(app)
  await properties.getByRole('textbox', { name: 'Field value', exact: true }).fill('Ready')
  await properties.getByRole('button', { name: 'Favorite', exact: true }).click()
  await closeSettings(app)
  await editor.locator('p').click()
  await app.keyboard.press('ControlOrMeta+a')
  await app.keyboard.insertText('Replacement body')
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  await expect.poll(async () => JSON.parse(await vault.read(path)).doc.content[0].attrs.fields).toEqual([{ key: 'Status', value: 'Ready' }])
  const saved = JSON.parse(await vault.read(path))
  expect(saved.doc.content[0].attrs).toMatchObject({ tags: ['keep'], favorite: true })
  expect(saved.doc.content[1].content[0].text).toBe('Replacement body')
  await app.reload()
  await expect(header).not.toContainText('Ready')
  await openProperties(app)
  await expect(properties.getByRole('textbox', { name: 'Field value', exact: true })).toHaveValue('Ready')
  await closeSettings(app)
  await expect(editor.locator('p')).toHaveText('Replacement body')
})

test('the insertion menu has one Columns entry and opens page properties separately', async ({ app, vault }) => {
  const path = await vault.write('block-catalog.arx', JSON.stringify({ version: 1, doc: { type: 'doc', content: [{ type: 'paragraph' }] } }))
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  await editor.locator('p').click()
  await app.keyboard.insertText('/')
  const menu = app.getByRole('listbox', { name: 'Insert block' })
  await expect(menu.getByRole('option', { name: 'Properties', exact: true })).toHaveCount(0)
  await expect(menu.getByRole('option', { name: 'Two columns', exact: true })).toHaveCount(0)
  await expect(menu.getByRole('option', { name: 'Three columns', exact: true })).toHaveCount(0)
  await expect(menu.getByRole('option', { name: 'Collection', exact: true })).toHaveCount(1)
  await menu.getByRole('option', { name: 'Columns', exact: true }).click()
  await expect(editor.locator('.arx-column')).toHaveCount(2)
  await app.keyboard.insertText('Keep inside columns')
  const settings = await openBlockSettings(app, editor.locator('.arx-column').first().locator('p'), 'Columns')
  await settings.getByRole('button', { name: '3 columns', exact: true }).click()
  await closeSettings(app)
  await expect(editor.locator('.arx-column')).toHaveCount(3)
  await expect(editor).toContainText('Keep inside columns')
  const header = await openProperties(app)
  await header.getByRole('textbox', { name: 'Tags', exact: true }).fill('project')
  await header.getByRole('textbox', { name: 'Tags', exact: true }).press('Enter')
  await closeSettings(app)
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  await expect.poll(async () => JSON.parse(await vault.read(path)).doc.content[0].attrs?.tags).toEqual(['project'])
})
