import type { Locator, Page } from '@playwright/test'
import { expect, isMobileFrame, openNavigation, test } from './fixtures'

async function drag(page: Page, source: Locator, target: Locator) {
  const from = (await source.boundingBox())!
  const to = (await target.boundingBox())!
  await page.mouse.move(from.x + 60, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + 72, from.y + from.height / 2, { steps: 4 })
  await page.mouse.move(to.x + 80, to.y + Math.min(to.height / 2, 30), { steps: 15 })
}

test('tree drag moves a file into a closed folder and back to the root', async ({ app, vault }) => {
  test.skip(await isMobileFrame(app), 'desktop dragging')
  const source = await vault.write('note.txt', 'move these bytes')
  const seed = await vault.write('destination/.keep', '')
  const folder = seed.split('/')[0]!
  await app.reload()
  await openNavigation(app)
  const tree = app.getByRole('tree', { name: 'Files', exact: true })
  const file = tree.getByRole('treeitem', { name: source, exact: true })
  const target = tree.getByRole('treeitem', { name: folder, exact: true })
  await drag(app, file, target)
  await expect(target).toHaveClass(/drop-target/)
  await expect(target).toHaveAttribute('aria-expanded', 'true')
  await app.mouse.up()
  await expect.poll(() => vault.read(`${folder}/${source}`).catch(() => null)).toBe('move these bytes')
  await expect.poll(() => vault.read(source).catch(() => null)).toBeNull()
  await expect(file).toHaveAttribute('aria-level', '2')
  const root = tree.locator('.tree-root-drop')
  await drag(app, file, root)
  await expect(root).toHaveClass(/drop-target/)
  await expect(root).toHaveText('Move to vault root')
  await app.mouse.up()
  await expect.poll(() => vault.read(source).catch(() => null)).toBe('move these bytes')
  await expect.poll(() => vault.read(`${folder}/${source}`).catch(() => null)).toBeNull()
  await expect(file).toHaveAttribute('aria-level', '1')
})

test('tree drag cancels, rejects descendants and preserves duplicate names', async ({ app, vault }) => {
  test.skip(await isMobileFrame(app), 'desktop dragging')
  const sourcePath = await vault.write('source/note.txt', 'original')
  const folder = sourcePath.split('/')[0]!
  const seed = await vault.write('source/child/.keep', '')
  await vault.write('destination/note.txt', 'existing')
  const destinationSeed = await vault.write('destination/.keep', '')
  const destination = destinationSeed.split('/')[0]!
  await app.reload()
  await openNavigation(app)
  const tree = app.getByRole('tree', { name: 'Files', exact: true })
  const sourceFolder = tree.getByRole('treeitem', { name: folder, exact: true })
  await sourceFolder.click()
  const child = tree.getByRole('treeitem', { name: 'child', exact: true })
  await drag(app, sourceFolder, child)
  await expect(child).not.toHaveClass(/drop-target/)
  await app.mouse.up()
  expect(await vault.read(seed)).toBe('')
  const file = tree.getByRole('treeitem', { name: 'note.txt', exact: true })
  const target = tree.getByRole('treeitem', { name: destination, exact: true })
  await drag(app, file, target)
  await expect(target).toHaveClass(/drop-target/)
  await app.keyboard.press('Escape')
  await app.mouse.up()
  expect(await vault.read(sourcePath)).toBe('original')
  await drag(app, file, target)
  await expect(target).toHaveClass(/drop-target/)
  await app.mouse.up()
  await expect(app.getByText('"note.txt" already exists in the destination folder', { exact: true })).toBeVisible()
  expect(await vault.read(sourcePath)).toBe('original')
  expect(await vault.read(`${destination}/note.txt`)).toBe('existing')
})

test('tree drag moves a folder with its contents', async ({ app, vault }) => {
  test.skip(await isMobileFrame(app), 'desktop dragging')
  const sourcePath = await vault.write('bundle/nested/file.txt', 'nested bytes')
  const folder = sourcePath.split('/')[0]!
  const targetPath = await vault.write('archive/.keep', '')
  const archive = targetPath.split('/')[0]!
  await app.reload()
  await openNavigation(app)
  const tree = app.getByRole('tree', { name: 'Files', exact: true })
  await drag(app, tree.getByRole('treeitem', { name: folder, exact: true }), tree.getByRole('treeitem', { name: archive, exact: true }))
  await expect(tree.getByRole('treeitem', { name: archive, exact: true })).toHaveClass(/drop-target/)
  await app.mouse.up()
  await expect.poll(() => vault.read(`${archive}/${folder}/nested/file.txt`).catch(() => null)).toBe('nested bytes')
  await expect.poll(() => vault.read(sourcePath).catch(() => null)).toBeNull()
})

test('tree dragging scrolls to destinations below the viewport and ignores outside drops', async ({ app, vault }) => {
  test.skip(await isMobileFrame(app), 'desktop dragging')
  const source = await vault.write('000-source.txt', 'stay intact')
  for (let index = 0; index < 50; index++) await vault.write(`row-${String(index).padStart(2, '0')}.txt`, 'body')
  const dest = await vault.write('zzz-folder/.keep', '')
  const folder = dest.split('/')[0]!
  await app.reload()
  await openNavigation(app)
  const tree = app.getByRole('tree', { name: 'Files', exact: true })
  const file = tree.getByRole('treeitem', { name: source, exact: true })
  await file.scrollIntoViewIfNeeded()
  const from = (await file.boundingBox())!
  await app.mouse.move(from.x + 60, from.y + from.height / 2)
  await app.mouse.down()
  await app.mouse.move(from.x + 80, from.y + from.height / 2, { steps: 4 })
  const box = (await tree.boundingBox())!
  const before = await tree.evaluate((node) => node.scrollTop)
  await app.mouse.move(box.x + 80, box.y + box.height - 4, { steps: 10 })
  await expect.poll(() => tree.evaluate((node) => node.scrollTop)).toBeGreaterThan(before)
  await app.mouse.move(box.x + box.width + 80, box.y + 100, { steps: 10 })
  await app.mouse.up()
  expect(await vault.read(source)).toBe('stay intact')
  await expect(tree.locator('.drop-target')).toHaveCount(0)
  // The tree remains usable after auto-scrolling and releasing outside it.
  await expect(tree.getByRole('treeitem', { name: folder, exact: true })).toBeAttached()
})
