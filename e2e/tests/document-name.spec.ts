import { expect, openFile, openNavigation, openNote, test, type Vault } from './fixtures'

// OR-02: whatever is showing a document says what the document is CALLED, at the very top, and the
// name is where it is renamed. Both frames run this file — the strip is the same one on the phone,
// deliberately: reading is passive and renaming is rare, so the name is what the top of a phone screen
// is for.

// OR-03: a name is shown the same way everywhere, and '.md'/'.gif' are extensions a viewer claims — so
// what this strip shows, and what its field edits, is the stem. Derived from the path the vault fixture
// actually returned (it prefixes every name with the test's own title) rather than written out, or the
// assertion would pass by coincidence.
function shown(path: string): string {
  return path.slice(0, path.lastIndexOf('.'))
}

// The file may legitimately not be there (that is half of what a rename means), and readFileSync
// throwing would end the poll instead of retrying it.
function readOrNull(vault: Vault, path: string): Promise<string | null> {
  return vault.read(path).catch(() => null)
}

test.describe('the name of an open document', () => {
  test('a note shows its name, and a click on it renames the file', async ({ app, vault }) => {
    const path = await vault.write('rename-me.md', 'the text\n')
    const renamed = path.replace('rename-me.md', 'renamed.md')

    await openNote(app, path)
    const name = app.getByTestId('document-name')
    await expect(name).toHaveText(shown(path))
    // Visible, not merely present: this strip shares its 40px with the formatting keys and Save, and on
    // a phone a name that yields ALL of its room is a name nobody can read or press.
    await expect(name).toBeVisible()

    await name.click()
    // Seeded with the current name and selected, so typing replaces it rather than appending to it.
    const field = app.getByRole('textbox', { name: 'New name' })
    await expect(field).toHaveValue(shown(path))
    // The visible name only — the hidden '.md' is glued back on at commit, and typing it here would
    // write 'renamed.md.md'. The prefix stays because the vault fixture puts the test's own name in
    // front of every file, and a bare 'renamed' would be a path two workers could collide on.
    await field.fill(shown(renamed))
    await field.press('Enter')

    await expect.poll(() => readOrNull(vault, renamed)).toContain('the text')
    await expect.poll(() => readOrNull(vault, path)).toBeNull()
    // The strip follows the file: the tab was retargeted through VaultWatcher, not re-opened.
    await expect(app.getByTestId('document-name')).toHaveText(shown(renamed))
  })

  test('Escape leaves the file alone', async ({ app, vault }) => {
    const path = await vault.write('keep-me.md', 'untouched\n')

    await openNote(app, path)
    await app.getByTestId('document-name').click()
    const field = app.getByRole('textbox', { name: 'New name' })
    await field.fill(shown(path.replace('keep-me.md', 'something-else.md')))
    await field.press('Escape')

    await expect(app.getByTestId('document-name')).toHaveText(shown(path))
    await expect.poll(() => readOrNull(vault, path)).toContain('untouched')
    await expect.poll(() => readOrNull(vault, path.replace('keep-me.md', 'something-else.md'))).toBeNull()
  })

  // A rejected write with only a log entry behind it is indistinguishable from a name that simply did
  // not change — which is exactly the failure the explorer's runAction was added for.
  test('a name already taken is refused out loud, not swallowed', async ({ app, vault }) => {
    const occupied = await vault.write('occupied.md', 'the neighbour\n')
    const path = await vault.write('collides.md', 'mine\n')

    await openNote(app, path)
    await app.getByTestId('document-name').click()
    const field = app.getByRole('textbox', { name: 'New name' })
    await field.fill(shown(occupied))
    await field.press('Enter')

    // The refusal names the whole file, extension and all: what was typed is only part of it while one
    // is hidden, and 'Could not rename to occupied' would name a file that does not exist.
    await expect(app.getByText(`Could not rename to ${occupied}`)).toBeVisible()
    await expect.poll(() => readOrNull(vault, occupied)).toContain('the neighbour')
    await expect.poll(() => readOrNull(vault, path)).toContain('mine')
  })

  // The tab is retargeted rather than re-opened (NotesPlugin's VaultWatcher subscription), so the live
  // buffer — and anything typed into it that has not reached disk yet — belongs to the new path.
  test('renaming an open note keeps its buffer', async ({ app, vault }) => {
    const path = await vault.write('buffered.md', 'first line\n')
    const renamed = path.replace('buffered.md', 'buffered-2.md')

    await openNote(app, path)
    await app.locator('.cm-line').first().click()
    await app.keyboard.press('End')
    await app.keyboard.type(' plus more')
    await expect(app.locator('.cm-content')).toContainText('first line plus more')

    await app.getByTestId('document-name').click()
    const field = app.getByRole('textbox', { name: 'New name' })
    await field.fill(shown(renamed))
    await field.press('Enter')

    // The same editor, still holding the edit — not a fresh mount that re-read the file.
    await expect(app.locator('.cm-content')).toContainText('first line plus more')
    await expect.poll(() => readOrNull(vault, renamed)).toContain('first line plus more')
  })

  // The tree is no longer refreshed only by whoever wrote: a rename from here reaches it through
  // VaultWatcher, so the row carries the new name without a reload.
  test('the tree follows a rename made from the strip', async ({ app, vault }) => {
    const path = await vault.write('from-the-strip.md', 'the text\n')
    const renamed = path.replace('from-the-strip.md', 'from-the-strip-2.md')

    await openNote(app, path)
    await app.getByTestId('document-name').click()
    const field = app.getByRole('textbox', { name: 'New name' })
    await field.fill(shown(renamed))
    await field.press('Enter')

    await openNavigation(app)
    await expect(app.getByRole('treeitem', { name: renamed, exact: true })).toBeVisible()
    await expect(app.getByRole('treeitem', { name: path, exact: true })).toHaveCount(0)
  })

  // Every viewer, not only the editors: the name is the type's, so a picture carries it too.
  test('a viewer that is not an editor carries the same name', async ({ app, vault }) => {
    // The smallest valid GIF: one transparent pixel.
    const path = await vault.write('picture.gif', Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'))

    await openFile(app, path)

    await expect(app.getByTestId('document-name')).toHaveText(shown(path))
  })
})
