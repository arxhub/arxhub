import type { Locator, Page } from '@playwright/test'
import { documentTool, expect, isMobileFrame, openDocumentTools, openNavigation, shownName, test } from './fixtures'

// The name above the body is the page's title, so a first heading that repeats it is not drawn a second
// time — and stays in the file untouched (plugins/editor/src/title-echo.ts).
const document = (content: unknown[]) => JSON.stringify({ version: 1, doc: { type: 'doc', content } })
const heading = (text: string) => ({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text }] })
const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

async function open(app: Page, path: string): Promise<Locator> {
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  await expect(editor).toBeVisible()
  return editor
}

async function startRename(app: Page): Promise<Locator> {
  if (await isMobileFrame(app)) {
    await openDocumentTools(app)
    await app.getByRole('menuitem', { name: 'Rename', exact: true }).click()
    return app.getByTestId('rename-document-field')
  }
  await app.getByTestId('document-name').click()
  return app.getByRole('textbox', { name: 'New name' })
}

test('a first heading repeating the name is not drawn twice, and the caret never goes into it', async ({ app, vault }) => {
  const path = await vault.write('plan.arx', '')
  const name = shownName(path)
  // The fixture prefixes every name with the test's title, so the path is only known after a first write.
  await vault.write('plan.arx', document([heading(name), paragraph('Body text')]))
  const editor = await open(app, path)
  await expect(editor.locator('p', { hasText: 'Body text' })).toBeVisible()
  await expect(editor.locator('h1:visible')).toHaveCount(0)
  await expect(app.locator('.document-name.inline:visible')).toHaveText(name)

  await editor.locator('p', { hasText: 'Body text' }).click()
  if (!(await isMobileFrame(app))) {
    await app.keyboard.press('Home')
    await app.keyboard.press('ArrowUp')
  }
  await app.keyboard.press('Home')
  await app.keyboard.insertText('X')
  await expect(editor.locator('p').first()).toHaveText('XBody text')
  await documentTool(app, 'Save')
  await expect.poll(async () => JSON.parse(await vault.read(path)).doc.content[0]).toMatchObject(heading(name))
})

test('a first heading that says something else is shown', async ({ app, vault }) => {
  const path = await vault.write('other.arx', document([heading('Something else'), paragraph('Body')]))
  const editor = await open(app, path)
  await expect(editor.locator('h1', { hasText: 'Something else' })).toBeVisible()
})

test('renaming the file to what its first heading says hides the heading', async ({ app, vault }) => {
  const path = await vault.write('before.arx', '')
  const renamed = path.replace('before.arx', 'after.arx')
  await vault.write('before.arx', document([heading(shownName(renamed)), paragraph('Body')]))
  const editor = await open(app, path)
  await expect(editor.locator('h1', { hasText: shownName(renamed) })).toBeVisible()
  const field = await startRename(app)
  await field.fill(shownName(renamed))
  await field.press('Enter')
  await expect(editor.locator('h1:visible')).toHaveCount(0)
  await expect(editor.locator('p', { hasText: 'Body' })).toBeVisible()
})
