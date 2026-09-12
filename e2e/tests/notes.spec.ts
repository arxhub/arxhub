import { expect, isMobileFrame, openNote, test } from './fixtures'

// The whole point of markdown-first storage: the file on disk is the note. These tests read and
// write the vault through the same guarded API the app uses, then check what the editor did to it.
test.describe('editing a note', () => {
  test('opens a markdown note with the formatting toolbar', async ({ app, vault }) => {
    const path = await vault.write('toolbar.md', '# Title\n\nsome text\n')

    await openNote(app, path)
    await expect(app.getByRole('toolbar', { name: 'Formatting' })).toBeVisible()
    await expect(app.locator('.cm-content')).toContainText('# Title')
  })

  test('leaves an untouched file byte-identical on save', async ({ app, vault }) => {
    // Round-tripping through a document tree would reformat lists, emphasis and spacing. Notes are
    // edited as text precisely so this holds.
    const original = '# Kept\n\n*   odd   spacing\n-  [ ] task\n\n<div>raw html</div>\n'
    const path = await vault.write('untouched.md', original)

    await openNote(app, path)
    await expect(app.locator('.cm-content')).toContainText('Kept')
    await app.getByRole('button', { name: 'Save' }).click()

    await expect.poll(() => vault.read(path)).toBe(original)
  })

  test('the toolbar writes plain markdown', async ({ app, vault }) => {
    const path = await vault.write('format.md', 'plain\n')

    await openNote(app, path)
    await expect(app.locator('.cm-content')).toContainText('plain')

    // Click the line, not the content box: the box is taller than the text, and a click below the
    // last line parks the caret at the end of the document.
    await app.locator('.cm-line').first().click()
    await app.keyboard.press('Home')
    await app.keyboard.down('Shift')
    await app.keyboard.press('End')
    await app.keyboard.up('Shift')
    await app.getByRole('button', { name: 'Bold' }).click()

    await expect(app.locator('.cm-content')).toContainText('**plain**')
    await app.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => vault.read(path)).toBe('**plain**\n')
  })

  test('a heading survives the round trip through the vault', async ({ app, vault }) => {
    const path = await vault.write('heading.md', 'title\n')

    await openNote(app, path)
    await expect(app.locator('.cm-content')).toContainText('title')
    await app.locator('.cm-line').first().click()
    if (await isMobileFrame(app)) {
      await app.getByRole('button', { name: 'More formatting' }).click()
      await app.getByRole('menuitem', { name: 'Heading 2', exact: true }).click()
    } else await app.getByRole('button', { name: 'Heading 2', exact: true }).click()
    await app.getByRole('button', { name: 'Save' }).click()

    await expect.poll(() => vault.read(path)).toBe('## title\n')
  })
})

// The ⌘B collision, which was a live bug and not a hypothesis: CodeMirror's keymap calls
// `preventDefault` on a chord it handled but never `stopPropagation`, so the same keystroke reached
// the desktop frame's window listener as well and did two things at once — bolded the word AND
// collapsed the navigation column.
//
// The fix is the layer stack: the editor declares `Mod-b` in its own layer, that layer is on the stack
// while the caret is in the text, and resolution stops there without touching the event. Both halves
// are asserted, because either one alone would pass with the chord simply broken.
test.describe('⌘B belongs to whatever the caret is in', () => {
  test.beforeEach(async ({ app }) => {
    test.skip(await isMobileFrame(app), 'the navigation column is the desktop frame; the phone has a panel and no column to collapse')
  })

  test('bolds the word and leaves the navigation column alone', async ({ app, vault }) => {
    const path = await vault.write('bold-chord.md', 'plain\n')

    await openNote(app, path)
    await expect(app.locator('.cm-content')).toContainText('plain')
    const column = app.locator('[data-testid="nav-column"]')
    await expect(column).not.toHaveClass(/collapsed/)

    // The caret has to be IN the text: the whole rule is about where focus is, so clicking the line
    // is the step under test rather than setup.
    await app.locator('.cm-line').first().click()
    await app.keyboard.press('Home')
    await app.keyboard.down('Shift')
    await app.keyboard.press('End')
    await app.keyboard.up('Shift')
    await app.keyboard.press('ControlOrMeta+b')

    await expect(app.locator('.cm-content')).toContainText('**plain**')
    await expect(column).not.toHaveClass(/collapsed/)
  })

  test('still collapses the column when the caret is not in an editor', async ({ app, vault }) => {
    const path = await vault.write('column-chord.md', 'plain\n')

    // Clicking the tree row opens the note and leaves focus on the row — outside the editor's layer,
    // which is exactly the case the app-wide binding is for.
    await openNote(app, path)
    const column = app.locator('[data-testid="nav-column"]')
    await app.getByRole('treeitem', { name: path }).click()
    await expect(column).not.toHaveClass(/collapsed/)

    await app.keyboard.press('ControlOrMeta+b')
    await expect(column).toHaveClass(/collapsed/)

    // And back, so the column is not left collapsed for whatever runs next in this frame.
    await app.keyboard.press('ControlOrMeta+b')
    await expect(column).not.toHaveClass(/collapsed/)
  })
})
