import type { Locator, Page } from '@playwright/test'
import { expect, isMobileFrame, openNavigation, test } from './fixtures'

async function blockAction(page: Page, name: string) {
  await page.getByRole('button', { name: 'Block actions', exact: true }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
}

async function undo(page: Page) {
  await page.getByRole('button', { name: 'Document tools', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Undo', exact: true }).click()
}

async function dragBlock(page: Page, target: Locator) {
  const handle = await page.getByRole('button', { name: 'Block actions', exact: true }).boundingBox()
  const destination = await target.boundingBox()
  if (!handle || !destination) throw new Error('Block drag needs visible source and destination')
  const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }
  const end = { x: destination.x + 20, y: destination.y + destination.height + 4 }
  if (await isMobileFrame(page)) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] })
    for (let step = 1; step <= 8; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: start.x + ((end.x - start.x) * step) / 8, y: start.y + ((end.y - start.y) * step) / 8, id: 1 }],
      })
    }
    await expect(page.locator('.block-drop-line')).toBeVisible()
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
  } else {
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(end.x, end.y, { steps: 8 })
    await expect(page.locator('.block-drop-line')).toBeVisible()
    await page.mouse.up()
  }
}

test('block groups transform, duplicate and drag with one-step undo in both frames', async ({ app, vault }) => {
  const path = await vault.write(
    `${test.info().project.name}-block-groups.arx`,
    JSON.stringify({
      version: 1,
      doc: { type: 'doc', content: ['First', 'Second', 'Third'].map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) },
    }),
  )
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  await editor.locator('p').first().click()
  await blockAction(app, 'Select next block too')
  await expect(editor.locator('.arx-block-selected')).toHaveCount(2)
  await blockAction(app, 'Duplicate block')
  await expect(editor.locator('p')).toHaveText(['First', 'Second', 'First', 'Second', 'Third'])
  await undo(app)
  await expect(editor.locator('p')).toHaveText(['First', 'Second', 'Third'])
  await blockAction(app, 'Turn into')
  await app.getByRole('menuitem', { name: 'Task list', exact: true }).click()
  await expect(editor.getByRole('checkbox')).toHaveCount(2)
  await dragBlock(app, editor.locator(':scope > p').last())
  await expect(editor.locator(':scope > p').first()).toHaveText('Third')
  await expect(editor.locator(':scope > :last-child')).toHaveAttribute('data-type', 'task_list')
  await undo(app)
  await expect(editor.locator(':scope > :first-child')).toHaveAttribute('data-type', 'task_list')
  await expect(editor.locator(':scope > p').last()).toHaveText('Third')
  await app.getByRole('button', { name: 'Document tools', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Save', exact: true }).click()
  await expect.poll(() => vault.read(path)).toContain('"type": "task_list"')
})
