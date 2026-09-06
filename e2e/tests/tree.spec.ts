import { expect, openNavigation, test } from './fixtures'

// Daily housekeeping: create, rename, delete. Every assertion checks the vault on disk, not just the
// tree, because the tree agreeing with itself proves nothing.
test.describe('keeping the tree in order', () => {
  test('creates a note in the format the product reasons about', async ({ app, vault }) => {
    await openNavigation(app)
    await app.getByRole('button', { name: 'New file', exact: true }).click()

    // '.arx' is the primary format (planning/decisions.md A-29): markdown stays readable and editable,
    // but everything structural is read from the '.arx' tree. The seed has to match the extension — an
    // '.arx' reader rejects a bare file, so an empty one would open as a broken document.
    await expect.poll(() => vault.read('untitled.arx').catch(() => null)).not.toBeNull()
    expect(JSON.parse(await vault.read('untitled.arx'))).toMatchObject({ version: 1, doc: { type: 'doc' } })

    // Clean up so a rerun starts from the same tree.
    await vault.remove('untitled.arx')
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
