import { expect, openNote, openType, SETTINGS_TYPE, test } from './fixtures'

// F-05. Switching type is the row's basic operation, and on a phone it is the most frequent one there
// is — so it must cost nothing. Both frames keep every type entered this session mounted and show only
// the active one; these two tests are what tells that apart from a stage that is rebuilt each time,
// which looks identical the moment it comes back and has lost everything the person had not saved.
test.describe('coming back to a type shows what was there', () => {
  test('an unsaved edit survives a trip to another type', async ({ app, vault }) => {
    const original = 'kept\n'
    const path = await vault.write('unsaved.md', original)
    await openNote(app, path)

    await app.locator('.cm-line').first().click()
    await app.keyboard.press('End')
    await app.keyboard.type(' and typed')
    await expect(app.locator('.cm-content:visible')).toContainText('kept and typed')

    await openType(app, 'Settings', SETTINGS_TYPE)
    await openType(app, 'Notes')

    await expect(app.locator('.cm-content:visible')).toContainText('kept and typed')
    // The file was never saved, so what came back is the editor's own buffer — a remounted editor would
    // have re-read the note from disk and shown exactly the text below instead, with no way to tell.
    expect(await vault.read(path)).toBe(original)
  })

  // The half a cache cannot give back: Vue's KeepAlive moves the subtree into a detached container, and
  // a scroll offset does not survive leaving the document — hiding the box does.
  test('the scroll position of a long note survives it too', async ({ app, vault }) => {
    const lines = Array.from({ length: 300 }, (_, i) => `line ${i + 1}`).join('\n')
    const path = await vault.write('long.md', `${lines}\n`)
    await openNote(app, path)

    const scroller = app.locator('.cm-scroller:visible')
    await scroller.evaluate((el) => {
      el.scrollTop = 600
    })
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(400)

    await openType(app, 'Settings', SETTINGS_TYPE)
    await openType(app, 'Notes')

    expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(400)
  })
})
