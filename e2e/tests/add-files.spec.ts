import type { Page, TestInfo } from '@playwright/test'
import { expect, openNavigation, test } from './fixtures'

// OR-07: putting a file the owner already has into the vault. The chooser is the platform's own, opened
// through a plain `<input type="file">` — so what is driven here is the real dialog Playwright
// intercepts, not a test-only path around it.
//
// A picked name has to be unique in the vault this project's workers all share, and distinct on a
// retry (a second attempt would otherwise find the first one's copy and be told the name was taken).
// The `vault` fixture does this for the files it writes; the picker's names are chosen by the test, so
// they need their own.
function pickedName(testInfo: TestInfo, name: string): string {
  const prefix = testInfo.title
    .replace(/[^a-z0-9]+/gi, '-')
    .toLowerCase()
    .slice(0, 40)
  return `${prefix}-r${testInfo.retry}--${name}`
}

// Opens the chooser and hands it the files. The listener is armed BEFORE whatever opens it: the chooser
// is intercepted at the browser, and one nobody is waiting on leaves the page holding a modal dialog.
async function chooseFiles(page: Page, open: () => Promise<void>, files: { name: string; body: string }[]): Promise<void> {
  const chooser = page.waitForEvent('filechooser')
  await open()
  const files_ = files.map((file) => ({ name: file.name, mimeType: 'text/plain', buffer: Buffer.from(file.body) }))
  await (await chooser).setFiles(files_)
}

test.describe('adding an existing file to the vault', () => {
  test('the strip button copies what was picked and shows it in the tree', async ({ app, vault }, testInfo) => {
    const name = pickedName(testInfo, 'brief.txt')
    await vault.remove(name)
    await app.reload()
    await openNavigation(app)

    await chooseFiles(app, () => app.getByRole('button', { name: 'Add files…' }).click(), [{ name, body: 'what the owner already had\n' }])

    await expect(app.getByRole('treeitem', { name })).toBeVisible()
    // The bytes, not only the row: a tree that draws a name it was handed proves nothing about what
    // reached the disk.
    await expect.poll(() => vault.read(name).catch(() => null)).toBe('what the owner already had\n')
  })

  test('several files land in one gesture', async ({ app, vault }, testInfo) => {
    const first = pickedName(testInfo, 'one.txt')
    const second = pickedName(testInfo, 'two.txt')
    await vault.remove(first)
    await vault.remove(second)
    await app.reload()
    await openNavigation(app)

    await chooseFiles(app, () => app.getByRole('button', { name: 'Add files…' }).click(), [
      { name: first, body: 'first\n' },
      { name: second, body: 'second\n' },
    ])

    await expect(app.locator('.toast-title').first()).toHaveText('2 files added')
    await expect(app.getByRole('treeitem', { name: first })).toBeVisible()
    await expect(app.getByRole('treeitem', { name: second })).toBeVisible()
    await expect.poll(() => vault.read(second).catch(() => null)).toBe('second\n')
  })

  // The case that must never be silent: what was in the vault stays, the copy lands beside it, and the
  // toast says under which name — otherwise the owner goes looking for it under the one they picked.
  test('a name that is already taken is not overwritten, and the toast says where the copy went', async ({ app, vault }, testInfo) => {
    const taken = await vault.write(pickedName(testInfo, 'report.txt'), 'the one that was already there\n')
    const beside = taken.replace('.txt', ' 2.txt')
    await vault.remove(beside)
    await app.reload()
    await openNavigation(app)

    await chooseFiles(app, () => app.getByRole('button', { name: 'Add files…' }).click(), [{ name: taken, body: 'the new one\n' }])

    await expect(app.locator('.toast-desc').first()).toHaveText(`The name was taken, so ${taken} → ${beside}.`)
    await expect.poll(() => vault.read(taken).catch(() => null)).toBe('the one that was already there\n')
    await expect.poll(() => vault.read(beside).catch(() => null)).toBe('the new one\n')
  })

  // The strip acts on the selection; a folder's own menu is how the owner says "here". Both roads exist,
  // so both are driven — and this one also proves the place, since the copy has to land INSIDE the
  // folder whose menu was opened.
  test('a folder context menu adds a file into that folder', async ({ app, vault }, testInfo) => {
    const seed = await vault.write('shelf/seed.txt', 'irrelevant\n')
    const folder = seed.split('/')[0] as string
    const name = pickedName(testInfo, 'from-menu.txt')
    await vault.remove(`${folder}/${name}`)
    await app.reload()
    await openNavigation(app)

    await chooseFiles(app, async () => {
      await app.getByRole('treeitem', { name: folder }).click({ button: 'right' })
      await app.getByRole('menuitem', { name: 'Add files…' }).click()
    }, [{ name, body: 'picked from the menu\n' }])

    await expect.poll(() => vault.read(`${folder}/${name}`).catch(() => null)).toBe('picked from the menu\n')
    await expect(app.getByRole('treeitem', { name })).toBeVisible()
  })
})
