import { expect, openNote, test } from './fixtures'

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
    await app.getByRole('button', { name: 'Heading 2' }).click()
    await app.getByRole('button', { name: 'Save' }).click()

    await expect.poll(() => vault.read(path)).toBe('## title\n')
  })
})
