import { expect, openNavigation, test } from './fixtures'

// A half-written file is not a failure, it is "not yet" — the poll that waits for the seed needs it to
// answer that way rather than throwing out of the poll callback, which expect.poll does not retry.
function parseOrNull(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// Daily housekeeping: create, rename, delete. Every assertion checks the vault on disk, not just the
// tree, because the tree agreeing with itself proves nothing.
test.describe('keeping the tree in order', () => {
  test('creates a note in the format the product reasons about', async ({ app, vault }) => {
    await openNavigation(app)
    await app.getByRole('button', { name: 'New file', exact: true }).click()

    // '.arx' is the primary format (planning/decisions.md A-29): markdown stays readable and editable,
    // but everything structural is read from the '.arx' tree. The seed has to match the extension — an
    // '.arx' reader rejects a bare file, so an empty one would open as a broken document.
    //
    // Polled on the parsed seed, not on the file existing: the write goes over HTTP and the file is on disk
    // before its bytes are, so a read that only waited for the name came back empty and the parse died with
    // "Unexpected end of JSON input". Nothing deletes it afterwards either — the name is the app's own, so
    // both projects create the same untitled.arx in the one vault, and a cleanup here removes the file the
    // other project is still reading. Each run gets its own temp vault, so there is nothing to tidy up for.
    await expect.poll(() => vault.read('untitled.arx').then(parseOrNull, () => null)).toMatchObject({ version: 1, doc: { type: 'doc' } })
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

test.describe('opening from the tree', () => {
  test('a file nothing can open says so instead of doing nothing', async ({ app, vault }) => {
    // '.text' is claimed by no panel, which is exactly the case the notification is for. Search already
    // answers this way; the tree used to refuse in silence, which reads as a broken row.
    const path = await vault.write('unopenable.text', 'plain bytes nothing claims\n')
    await app.reload()
    await openNavigation(app)

    await app.getByRole('treeitem', { name: path }).click()

    await expect(app.getByText('Nothing can open this file')).toBeVisible()
  })
})
