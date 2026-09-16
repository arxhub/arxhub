import { expect, isMobileFrame, openNote, SHEET_LABEL, searchSheet, shownName, test, typeKey } from './fixtures'

// One operation — open or switch to — and one sheet behind it in both frames: a dialog on the desktop,
// a bottom sheet on the phone. Its two sections are guaranteed, so these tests assert that both are
// there rather than that either happens to be non-empty.
test.describe('open or switch to', () => {
  test('shows both sections, with every registered type in the second', async ({ app }) => {
    await app.keyboard.press('ControlOrMeta+k')
    const sheet = searchSheet(app)
    await expect(sheet).toBeVisible()

    await expect(sheet.getByText('Currently open')).toBeVisible()
    await expect(sheet.getByText('Open new')).toBeVisible()

    // "Open new" is the whole registry, not the row: the log viewer holds no place in the row at all,
    // and the sheet is the thing that makes it reachable.
    await expect(sheet.getByTestId('sheet:new:arxhub.notes')).toBeVisible()
    await expect(sheet.getByTestId('sheet:new:arxhub.settings')).toBeVisible()
    await expect(sheet.getByTestId('sheet:new:arxhub.logs')).toBeVisible()
  })

  test('switches to a type and puts itself away', async ({ app }) => {
    await app.keyboard.press('ControlOrMeta+k')
    await searchSheet(app).getByTestId('sheet:new:arxhub.settings').click()

    await expect(searchSheet(app)).toBeHidden()
    await expect(typeKey(app, 'Settings')).toHaveAttribute('aria-pressed', 'true')
  })

  test('an open note stands in the first section and can be switched to', async ({ app, vault }) => {
    const path = await vault.write('sheet-open.md', '# In the sheet\n\nbody\n')
    await openNote(app, path)

    // By name rather than by test id: every opener in the application still writes straight to the panel
    // store, so an open tab's key is the store's generated instance id and not the note's path.
    await app.keyboard.press('ControlOrMeta+k')
    const row = searchSheet(app).getByRole('button', { name: new RegExp(`^${shownName(path)}`) })
    await expect(row).toBeVisible()
    await row.click()

    await expect(searchSheet(app)).toBeHidden()
    await expect(app.locator('.cm-content')).toContainText('In the sheet')
  })

  // The one behaviour F-10 rests on someone else's implementation detail for: CodeMirror's keymap calls
  // preventDefault on a chord it handled but never stopPropagation, so a keydown taken by the editor
  // still reaches the window listener. If that ever changes, the global key goes dead in exactly the
  // place it is needed most — with the caret in a note — and nothing else in the suite would notice.
  test('the global key reaches the sheet from inside the editor, and writes nothing into the note', async ({ app, vault }) => {
    const path = await vault.write('chord.md', 'plain\n')
    await openNote(app, path)
    // The line, not the content box: a click below the last line parks the caret at the end instead.
    await app.locator('.cm-line').first().click()

    await app.keyboard.press('ControlOrMeta+k')
    await expect(searchSheet(app)).toBeVisible()
    await expect(app.locator('.cm-content')).toContainText('plain')
    await expect(app.locator('.cm-content')).not.toContainText('[')
  })

  test('the shifted chord inserts a link and leaves the sheet closed', async ({ app, vault }) => {
    const path = await vault.write('link.md', 'plain\n')
    await openNote(app, path)
    await app.locator('.cm-line').first().click()
    await app.keyboard.press('Home')
    await app.keyboard.down('Shift')
    await app.keyboard.press('End')
    await app.keyboard.up('Shift')

    await app.keyboard.press('ControlOrMeta+Shift+k')
    await expect(app.locator('.cm-content')).toContainText('[plain]()')
    await expect(searchSheet(app)).toBeHidden()
  })

  test('the phone opens the same sheet from the key beside the type row', async ({ app }) => {
    test.skip(!(await isMobileFrame(app)), 'the desktop frame reaches the sheet by the chord alone')

    await app.getByRole('button', { name: SHEET_LABEL }).click()
    const sheet = searchSheet(app)
    await expect(sheet).toBeVisible()
    // The status block the desktop keeps permanently in its bar lives here on this frame — F-11's third
    // layout, and the reason the More sheet can go (F-18).
    await expect(sheet.getByRole('button', { name: 'Open logs' })).toBeVisible()
  })
})
