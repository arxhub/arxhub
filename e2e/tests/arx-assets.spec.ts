import type { Page } from '@playwright/test'
import { expect, isMobileFrame, openNavigation, test } from './fixtures'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR1sAAAAASUVORK5CYII=', 'base64')
const document = (text?: string) =>
  JSON.stringify({ version: 1, doc: { type: 'doc', content: [{ type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) }] } })

async function open(page: Page, path: string) {
  await page.reload()
  await openNavigation(page)
  await page.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = page.locator('.ProseMirror:visible')
  await expect(editor).toBeVisible()
  return editor
}

test('images upload, resize, retain captions and download after reopening', async ({ app, vault }) => {
  const path = await vault.write(`${test.info().project.name}-image.arx`, document())
  const editor = await open(app, path)
  await editor.click()
  await app.keyboard.insertText('/image')
  await app.getByRole('option', { name: 'Image', exact: true }).click()
  await editor.getByLabel('Choose image file').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: png })
  const image = editor.getByRole('img', { name: 'pixel.png' })
  await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(1)
  await editor.getByRole('button', { name: 'Image width', exact: true }).click()
  await app.getByRole('menuitem', { name: '50%', exact: true }).click()
  await editor.getByRole('button', { name: 'Edit caption', exact: true }).click()
  await editor.getByRole('textbox', { name: 'Attachment caption', exact: true }).fill('A saved image')
  await editor.getByRole('textbox', { name: 'Image alternative text', exact: true }).fill('A sample pixel')
  await editor.getByRole('button', { name: 'Apply caption', exact: true }).click()
  await app.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => vault.read(path)).toContain('A saved image')
  expect(await vault.read(path)).toContain('"width": 50')
  expect(await vault.read(path)).not.toContain('blob:')
  await open(app, path)
  await expect.poll(() => editor.getByRole('img', { name: 'A sample pixel' }).evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(1)
  await expect(editor).toContainText('A saved image')
  await app.getByRole('button', { name: /^Editor mode:/ }).click()
  await app.getByRole('menuitem', { name: 'Read only', exact: true }).click()
  await expect(editor.getByRole('button', { name: 'Edit caption', exact: true })).toHaveCount(0)
  const downloaded = app.waitForEvent('download')
  await editor.getByRole('button', { name: 'Download', exact: true }).click()
  expect((await downloaded).suggestedFilename()).toBe('pixel.png')
})

test('a failed clipboard upload retries and closing waits for its insertion and save', async ({ app, vault }) => {
  const path = await vault.write(`${test.info().project.name}-file.arx`, document('Original'))
  const editor = await open(app, path)
  let fail = true
  let uploading = false
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await app.route(
    (url) => url.pathname.endsWith('/vfs/write') && (url.searchParams.get('path') ?? '').startsWith('vault/attachments/'),
    async (route) => {
      if (fail) return route.fulfill({ status: 503, body: 'offline' })
      uploading = true
      await gate
      await route.continue()
    },
  )
  await editor.locator('p').click()
  await editor.evaluate((element) => {
    const clipboardData = new DataTransfer()
    clipboardData.items.add(new File(['receipt contents'], 'receipt.txt', { type: 'text/plain' }))
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  })
  await expect(app.getByRole('button', { name: 'Retry upload', exact: true })).toBeVisible()
  await expect(editor.locator('p')).toHaveText('Original')
  fail = false
  await app.getByRole('button', { name: 'Retry upload', exact: true }).click()
  await expect.poll(() => uploading).toBe(true)
  await editor.locator('p').click()
  await app.keyboard.press('End')
  await app.keyboard.insertText(' edits')
  const close = (await isMobileFrame(app))
    ? app.getByRole('button', { name: 'Close document', exact: true })
    : app.locator('.tab.active .tab-close')
  await close.click()
  await expect(editor).toBeVisible()
  release()
  await expect(editor).toHaveCount(0)
  expect(await vault.read(path)).toContain('Original edits')
  expect(await vault.read(path)).toContain('receipt.txt')
  await open(app, path)
  await expect(editor).toContainText('receipt.txt')
  await expect(editor.getByRole('button', { name: 'Download', exact: true })).toBeEnabled()
})
