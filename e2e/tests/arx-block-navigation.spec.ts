import type { Page } from '@playwright/test'
import { expect, isMobileFrame, openNavigation, test } from './fixtures'

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const document = (content: unknown[]) => JSON.stringify({ version: 1, doc: { type: 'doc', content } })
const table = () => ({
  type: 'table',
  content: ['Top', 'Bottom'].map((label) => ({
    type: 'table_row',
    content: ['left', 'right'].map((side) => ({ type: 'table_cell', content: [paragraph(`${label} ${side}`)] })),
  })),
})

async function open(app: Page, path: string) {
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  await expect(editor).toBeVisible()
  return editor
}

async function save(app: Page) {
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  await expect(app.locator('.document-save-status')).toContainText('Saved')
}

test('table line breaks and paragraphs stay in the cell; Mod-Enter continues outside with undo and persistence', async ({ app, vault }) => {
  test.skip(await isMobileFrame(app), 'Desktop keyboard navigation')
  const path = await vault.write('table-exit-keyboard.arx', document([table()]))
  const editor = await open(app, path)
  const first = editor.locator('td').first()
  await first.locator('p').click()
  await app.keyboard.press('End')
  await app.keyboard.press('Shift+Enter')
  await app.keyboard.insertText('Second line')
  await expect(first.locator('p')).toHaveCount(1)
  await expect(first.locator('br')).toHaveCount(1)
  await app.keyboard.press('Enter')
  await app.keyboard.insertText('Second paragraph')
  await expect(first.locator('p')).toHaveCount(2)
  await expect(editor.locator(':scope > p')).toHaveCount(0)
  await app.keyboard.press('ControlOrMeta+Enter')
  await expect(editor.locator(':scope > p')).toHaveCount(1)
  await app.keyboard.press('ControlOrMeta+z')
  await expect(editor.locator(':scope > p')).toHaveCount(0)
  await expect(first.locator('p').last()).toHaveText('Second paragraph')
  await app.keyboard.press('ControlOrMeta+Shift+z')
  await app.keyboard.insertText('After table')
  await expect(editor.locator(':scope > p')).toHaveText('After table')
  await expect(editor.locator('td')).toHaveCount(4)
  await save(app)
  await expect.poll(() => vault.read(path)).toContain('After table')
  await app.reload()
  await expect(editor.locator(':scope > p')).toHaveText('After table')
  await expect(first.locator('p')).toHaveCount(2)
  await expect(first.locator('br')).toHaveCount(1)
})

test('Down leaves only the bottom of a table and reuses the following paragraph', async ({ app, vault }) => {
  test.skip(await isMobileFrame(app), 'Desktop keyboard navigation')
  const grid = table()
  grid.content[1].content[0].content = [paragraph('First line'), paragraph('Last line')]
  const path = await vault.write('table-exit-down.arx', document([grid]))
  const editor = await open(app, path)
  await editor.locator('td p').first().click()
  await app.keyboard.press('End')
  await app.keyboard.press('ArrowDown')
  await expect(editor.locator(':scope > p')).toHaveCount(0)
  const bottom = editor.locator('tr').last().locator('td').first()
  await bottom.locator('p').first().click()
  await app.keyboard.press('End')
  await app.keyboard.press('ArrowDown')
  await expect(editor.locator(':scope > p')).toHaveCount(0)
  await bottom.locator('p').last().click()
  await app.keyboard.press('End')
  await app.keyboard.press('ArrowDown')
  await app.keyboard.insertText('Outside')
  await expect(editor.locator(':scope > p')).toHaveText('Outside')
  await editor.locator('td p').last().click()
  await app.keyboard.press('End')
  await app.keyboard.press('ArrowDown')
  await app.keyboard.insertText('Still ')
  await expect(editor.locator(':scope > p')).toHaveCount(1)
  await expect(editor.locator(':scope > p')).toHaveText('Still Outside')
})

test('the block menu leaves a nested table inside its callout, then leaves the callout', async ({ app, vault }) => {
  const path = await vault.write('nested-table-exit-menu.arx', document([{ type: 'callout', content: [table(), paragraph('Tail')] }]))
  const editor = await open(app, path)
  await editor.locator('td p').first().click()
  await app.getByRole('button', { name: 'Block actions', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Add paragraph after block', exact: true }).click()
  await app.keyboard.insertText('After table: ')
  await expect(editor.locator('.callout > p')).toHaveText('After table: Tail')
  await expect(editor.locator(':scope > p')).toHaveCount(0)
  await app.getByRole('button', { name: 'Block actions', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Add paragraph after block', exact: true }).click()
  await app.keyboard.insertText('After callout')
  await expect(editor.locator(':scope > p')).toHaveText('After callout')
  await expect(editor.locator('td')).toHaveCount(4)
  await save(app)
  await expect.poll(() => vault.read(path)).toContain('After callout')
  await app.reload()
  await expect(editor.locator('.callout > p')).toHaveText('After table: Tail')
  await expect(editor.locator(':scope > p')).toHaveText('After callout')
})

test('Mod-Enter leaves code, quotes, sections, lists and columns through the same command', async ({ app, vault }) => {
  test.skip(await isMobileFrame(app), 'Desktop keyboard navigation')
  const blocks = [
    { type: 'code_block', content: [{ type: 'text', text: 'Code' }] },
    { type: 'blockquote', content: [paragraph('Quote')] },
    { type: 'section', content: [paragraph('Section')] },
    { type: 'bullet_list', content: [{ type: 'list_item', content: [paragraph('List')] }] },
    {
      type: 'columns',
      content: [
        { type: 'column', content: [paragraph('Left')] },
        { type: 'column', content: [paragraph('Right')] },
      ],
    },
  ]
  const path = await vault.write('container-exit-keyboard.arx', document(blocks))
  const editor = await open(app, path)
  for (const [selector, text] of [
    ['pre code', 'Code'],
    ['blockquote p', 'Quote'],
    ['.section-content p', 'Section'],
    ['li p', 'List'],
    ['.arx-column p', 'Left'],
  ]) {
    await editor.locator(selector).filter({ hasText: text }).click()
    await app.keyboard.press('ControlOrMeta+Enter')
    await app.keyboard.insertText(`After ${text}`)
    await expect(editor.locator(':scope > p').filter({ hasText: `After ${text}` })).toHaveCount(1)
  }
  await expect(editor.locator(':scope > p')).toHaveCount(5)
  await save(app)
  await expect.poll(() => vault.read(path)).toContain('After Left')
  await app.reload()
  await expect(editor.locator(':scope > p')).toHaveCount(5)
})
