import { closeSettings, openBlockSettings, openProperties } from './arx-inspector-helpers'
import { expect, isMobileFrame, openNavigation, test } from './fixtures'

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

test('settings stay pinned while the caret moves and disappear when the block is deleted', async ({ app, vault }) => {
  test.skip(await isMobileFrame(app), 'Desktop permits simultaneous document and inspector interaction')
  const path = await vault.write(
    'pinned.arx',
    JSON.stringify({
      version: 1,
      doc: {
        type: 'doc',
        content: [
          { type: 'callout', attrs: { type: 'info' }, content: [paragraph('Pinned block')] },
          paragraph('Another paragraph'),
          { type: 'callout', attrs: { type: 'info' }, content: [paragraph('Second callout')] },
        ],
      },
    }),
  )
  const other = await vault.write('other.arx', JSON.stringify({ version: 1, doc: { type: 'doc', content: [paragraph('Other document')] } }))
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  const first = editor.locator('.callout').first()
  const panel = await openBlockSettings(app, first.locator('p'), 'Callout')
  await editor.locator(':scope > p').click()
  await app.keyboard.press('End')
  await app.keyboard.insertText(' changed')
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: 'Warning', exact: true }).click()
  await expect(first).toHaveAttribute('data-type', 'warning')
  await expect(editor.locator('.callout').last()).toHaveAttribute('data-type', 'info')
  await app.getByRole('treeitem', { name: other, exact: true }).click()
  await expect(app.getByRole('complementary', { name: 'Callout', exact: true })).toBeHidden()
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  await expect(panel).toBeVisible()
  await first.locator('p').click()
  await app.getByRole('button', { name: 'Block actions', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Select parent block', exact: true }).click()
  await app.getByRole('button', { name: 'Block actions', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Delete block', exact: true }).click()
  await expect(panel).toBeHidden()
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Undo', exact: true }).click()
  await expect(editor.locator('.callout').first()).toContainText('Pinned block')
})

test('opening and closing properties creates no metadata or undo entry', async ({ app, vault }) => {
  const path = await vault.write('no-metadata.arx', JSON.stringify({ version: 1, doc: { type: 'doc', content: [paragraph('Body')] } }))
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  await openProperties(app)
  await closeSettings(app)
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await expect(app.getByRole('menuitem', { name: 'Undo', exact: true })).toBeDisabled()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  await expect
    .poll(async () => JSON.parse(await vault.read(path)).doc.content.map((node: { type: string }) => node.type))
    .toEqual(['paragraph'])
})
