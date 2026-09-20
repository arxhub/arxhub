import type { Page } from '@playwright/test'
import { expect, isMobileFrame, openNavigation, test } from './fixtures'

async function resizeNavigation(page: Page, width: number): Promise<void> {
  const column = page.getByTestId('nav-column')
  const box = await column.boundingBox()
  const handle = column.getByRole('separator')
  await handle.hover()
  await page.mouse.down()
  await page.mouse.move(box!.x + width, box!.y + 100)
  await page.mouse.up()
  await expect(handle).toHaveAttribute('aria-valuenow', String(width))
}

test.beforeEach(async ({ app }) => {
  test.skip(await isMobileFrame(app), 'desktop column resize')
  await openNavigation(app)
})

test('navigation actions fit across overflow boundaries and align with panel tabs', async ({ app }) => {
  const strip = app.locator('.file-tree-wrap > .strip')
  const actions = ['New file', 'New folder', 'Add files…', 'Collapse tree', 'Refresh']
  // The column's border consumes a pixel: six 40px controls fit at 241, not 240.
  for (const [width, visible] of [
    [280, 5],
    [240, 3],
    [201, 3],
    [200, 2],
    [180, 2],
    [241, 5],
    [560, 5],
  ] as const) {
    await resizeNavigation(app, width)
    await expect(strip.getByRole('button')).toHaveCount(visible + 1 + (visible < 5 ? 1 : 0))
    const labels = await strip.getByRole('button').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')))
    expect(labels.slice(0, visible)).toEqual(actions.slice(0, visible))

    const boxes = await strip.getByRole('button').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()))
    const band = (await strip.boundingBox())!
    const tabs = (await app.locator('.panel-tab-bar').boundingBox())!
    expect(band.y).toBe(tabs.y)
    expect(band.height).toBe(tabs.height)
    expect(boxes[0].x).toBe(band.x)
    expect(boxes.at(-1)!.right).toBe(band.x + band.width)
    for (let index = 0; index < boxes.length; index++) {
      expect(boxes[index].height).toBe(band.height)
      expect(boxes[index].right).toBeLessThanOrEqual(band.x + band.width)
      if (index > 0) expect(boxes[index].left).toBeGreaterThanOrEqual(boxes[index - 1].right)
    }
    const more = strip.getByRole('button', { name: 'More vault actions' })
    if (visible < 5) {
      expect(boxes.at(-2)!.right).toBe(boxes.at(-1)!.left)
      await more.focus()
      await more.press('Enter')
      await expect(app.getByRole('menuitem')).toHaveText(actions.slice(visible))
      const buttonFont = await more.evaluate((node) => getComputedStyle(node).fontFamily)
      await expect(app.getByRole('menuitem').first()).toHaveCSS('font-family', buttonFont)
      await expect(app.getByRole('menuitem').first()).toBeFocused()
      await app.keyboard.press('Escape')
      await expect(app.getByRole('menuitem')).toHaveCount(0)
      await expect(more).toBeFocused()
    } else await expect(more).toHaveCount(0)
  }
})

test('overflow actions import files, refresh the tree and collapse folders', async ({ app, vault }) => {
  const path = await vault.write('folder/child.txt', 'child')
  const folder = path.split('/')[0]!
  await app.reload()
  await openNavigation(app)
  await resizeNavigation(app, 180)
  const more = app.getByRole('button', { name: 'More vault actions' })

  await app.getByRole('treeitem', { name: folder, exact: true }).click()
  await expect(app.getByRole('treeitem', { name: 'child.txt', exact: true })).toBeVisible()
  await more.click()
  await app.getByRole('menuitem', { name: 'Collapse tree' }).click()
  await expect(app.getByRole('treeitem', { name: 'child.txt', exact: true })).toBeHidden()

  const added = await vault.write('external.txt', 'external')
  await more.click()
  await app.getByRole('menuitem', { name: 'Refresh', exact: true }).click()
  await expect(app.getByRole('treeitem', { name: added, exact: true })).toBeVisible()

  await more.click()
  const chooser = app.waitForEvent('filechooser')
  await app.getByRole('menuitem', { name: 'Add files…' }).click()
  await (await chooser).setFiles({ name: 'overflow-import.txt', mimeType: 'text/plain', buffer: Buffer.from('imported') })
  await expect.poll(() => vault.read(`${folder}/overflow-import.txt`).catch(() => null)).toBe('imported')

  await app.getByTestId('nav-column').getByTestId('nav-toggle').click()
  await expect(app.getByTestId('nav-column')).toHaveClass(/collapsed/)
  await app.getByRole('button', { name: 'Expand navigation', exact: true }).click()
  await expect(more).toBeVisible()
})
