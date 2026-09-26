import type { Page } from '@playwright/test'
import { expect, isMobileFrame, openNavigation, test } from './fixtures'

const document = (content: unknown[]) => JSON.stringify({ version: 1, doc: { type: 'doc', content } })
const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

async function open(app: Page, path: string) {
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  await expect(editor).toBeVisible()
  return editor
}

test('the slash menu speaks the UI font and inserts the block the next keystroke goes into', async ({ app, vault }) => {
  const path = await vault.write('slash.arx', document([paragraph('First')]))
  const editor = await open(app, path)
  await editor.locator('p', { hasText: 'First' }).click()
  await app.keyboard.press('End')
  await app.keyboard.press('Enter')
  await app.keyboard.insertText('/')
  const menu = app.getByRole('listbox', { name: 'Insert block' })
  await expect(menu).toBeVisible()
  expect(await menu.evaluate((el) => getComputedStyle(el).fontFamily)).not.toMatch(/^(serif|"?Times)/)

  if (await isMobileFrame(app)) {
    const filter = app.getByRole('textbox', { name: 'Filter blocks' })
    await filter.fill('heading 2')
    await expect(menu.getByRole('option')).toHaveCount(1)
    await filter.press('Enter')
  } else {
    await expect(app.getByText('Type to filter')).toBeVisible()
    await app.keyboard.insertText('heading 2')
    await expect(app.getByText('/heading 2', { exact: true }).last()).toBeVisible()
    // Under the caret line, never over it.
    const line = await editor.locator('p').last().boundingBox()
    const box = await menu.boundingBox()
    expect(line && box && box.y >= line.y + line.height).toBe(true)
    await app.keyboard.press('Enter')
  }
  await expect(menu).toBeHidden()
  await app.keyboard.insertText('Typed')
  await expect(editor.locator('h2')).toHaveText('Typed')
})
