import type { Locator, Page } from '@playwright/test'
import { expect, isMobileFrame, openNavigation, test } from './fixtures'

const arx = (text: string) =>
  JSON.stringify({ version: 1, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } })

async function open(page: Page, path: string, extension: string): Promise<Locator> {
  await page.reload()
  await openNavigation(page)
  await page.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = page.locator(extension === 'arx' ? '.ProseMirror:visible' : '.cm-content:visible')
  await expect(editor).toBeVisible()
  return editor
}

async function close(page: Page): Promise<void> {
  const control = (await isMobileFrame(page))
    ? page.getByRole('button', { name: 'Close document', exact: true })
    : page.locator('.tab.active .tab-close')
  await control.click()
}

for (const extension of ['md', 'arx']) {
  test(`closing ${extension} immediately saves the edit before removing its buffer`, async ({ app, vault }) => {
    const path = await vault.write(`${test.info().project.name}-close.${extension}`, extension === 'arx' ? arx('original') : 'original')
    const editor = await open(app, path, extension)
    await editor.click()
    await app.keyboard.press('ControlOrMeta+End')
    await app.keyboard.insertText(' last edit')
    await close(app)
    await expect(editor).toHaveCount(0)
    expect(await vault.read(path)).toContain('original last edit')
  })

  test(`a failed ${extension} close keeps the buffer for retry`, async ({ app, vault }) => {
    const path = await vault.write(`${test.info().project.name}-retry.${extension}`, extension === 'arx' ? arx('original') : 'original')
    const editor = await open(app, path, extension)
    const writes = (url: URL) => url.pathname.endsWith('/vfs/write') && url.searchParams.get('path') === `vault/${path}`
    await app.route(writes, (route) => route.fulfill({ status: 503, body: 'offline' }))
    await editor.click()
    await app.keyboard.press('ControlOrMeta+End')
    await app.keyboard.insertText(' retry me')
    await close(app)
    await expect(app.getByText('Save failed', { exact: true }).first()).toBeVisible()
    await expect(editor).toContainText('retry me')
    expect(await vault.read(path)).not.toContain('retry me')
    await app.unroute(writes)
    await close(app)
    await expect(editor).toHaveCount(0)
    expect(await vault.read(path)).toContain('original retry me')
  })

  test(`closing ${extension} includes edits made during an in-flight save`, async ({ app, vault }) => {
    const path = await vault.write(`${test.info().project.name}-inflight.${extension}`, extension === 'arx' ? arx('original') : 'original')
    const editor = await open(app, path, extension)
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let writing = false
    await app.route(
      (url) => url.pathname.endsWith('/vfs/write') && url.searchParams.get('path') === `vault/${path}`,
      async (route) => {
        if (!writing) {
          writing = true
          await gate
        }
        await route.continue()
      },
    )
    await editor.click()
    await app.keyboard.press('ControlOrMeta+End')
    await app.keyboard.insertText(' first')
    await app.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => writing).toBe(true)
    await editor.click()
    await app.keyboard.press('ControlOrMeta+End')
    await app.keyboard.insertText(' second')
    await close(app)
    await expect(editor).toBeVisible()
    release()
    await expect(editor).toHaveCount(0)
    expect(await vault.read(path)).toContain('original first second')
  })
}
