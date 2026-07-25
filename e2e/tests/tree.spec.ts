import { expect, openNavigation, test } from './fixtures'

// Daily housekeeping: create, rename, delete. Every assertion checks the vault on disk, not just the
// tree, because the tree agreeing with itself proves nothing.
test.describe('keeping the tree in order', () => {
  test('creates a note as markdown', async ({ app, vault }) => {
    await openNavigation(app)
    await app.getByRole('button', { name: '＋ File' }).click()

    // Markdown is the default because the vault has to stay readable outside the product, and the
    // seed must match the extension — a note seeded with a document tree opens as JSON text.
    await expect.poll(() => vault.read('untitled.md').catch(() => null)).toBe('')

    // Clean up so a rerun starts from the same tree.
    await vault.remove('untitled.md')
  })

  test('renames a note in place', async ({ app, vault }) => {
    const path = await vault.write('before.md', 'body\n')
    await app.reload()
    await openNavigation(app)

    await app.getByRole('treeitem', { name: path }).click({ button: 'right' })
    await app.getByRole('menuitem', { name: 'Rename' }).click()

    const renamed = `${path.replace('.md', '')}-after.md`
    const input = app.getByRole('textbox', { name: 'New name' })
    await expect(input).toBeVisible()
    await input.click()
    await input.fill(renamed)
    await input.press('Enter')

    await expect.poll(() => vault.read(renamed).catch(() => null)).toBe('body\n')
    await expect(app.getByRole('treeitem', { name: path })).toHaveCount(0)
  })

  test('deletes only after the confirmation is accepted', async ({ app, vault }) => {
    const path = await vault.write('doomed.md', 'bye\n')
    await app.reload()
    await openNavigation(app)

    await app.getByRole('treeitem', { name: path }).click({ button: 'right' })
    await app.getByRole('menuitem', { name: 'Delete' }).click()

    // Cancel first: an irreversible action must take a deliberate yes (FR-81).
    await app.getByRole('button', { name: 'Cancel' }).click()
    expect(await vault.read(path)).toBe('bye\n')

    await openNavigation(app)
    await app.getByRole('treeitem', { name: path }).click({ button: 'right' })
    await app.getByRole('menuitem', { name: 'Delete' }).click()
    await app.getByRole('button', { name: 'Delete', exact: true }).last().click()

    await expect.poll(() => vault.read(path).catch(() => null)).toBeNull()
  })
})
