import { expect, isMobileViewport, openNavigation, openNote, test } from './fixtures'

test.describe('the frame follows the viewport', () => {
  test('a narrow viewport gets the mobile frame, a wide one the desktop frame', async ({ app }) => {
    if (isMobileViewport(app)) {
      await expect(app.getByRole('button', { name: 'Open navigation' })).toBeVisible()
      // The mini-app list is behind the menu, not in a permanent column.
      await expect(app.getByRole('button', { name: 'Explorer' })).toBeHidden()
    } else {
      await expect(app.getByRole('button', { name: 'Open navigation' })).toHaveCount(0)
      await expect(app.getByRole('button', { name: 'Explorer' })).toBeVisible()
    }
  })

  test('resizing the window switches the frame without a reload', async ({ app }) => {
    const original = app.viewportSize()
    if (!original) test.skip()

    await app.setViewportSize({ width: 400, height: 800 })
    await expect(app.getByRole('button', { name: 'Open navigation' })).toBeVisible()

    await app.setViewportSize({ width: 1200, height: 800 })
    await expect(app.getByRole('button', { name: 'Open navigation' })).toHaveCount(0)
    await expect(app.getByRole('button', { name: 'Explorer' })).toBeVisible()

    if (original) await app.setViewportSize(original)
  })
})

test.describe('mobile navigation', () => {
  // These describe the mobile frame specifically; the desktop project has no drawer or sheets.
  test.beforeEach(({ app }) => {
    test.skip(!isMobileViewport(app), 'only meaningful on the mobile frame')
  })

  test('back closes the drawer instead of leaving the app', async ({ app }) => {
    await openNavigation(app)
    await app.goBack()

    await expect(app.getByRole('navigation', { name: 'Navigation' })).toBeHidden()
    // Still the app, not a blank tab or the previous page.
    await expect(app.getByRole('main')).toBeVisible()
  })

  test('node actions open as a bottom sheet, and back dismisses it', async ({ app, vault }) => {
    const path = await vault.write('actions.md', 'note\n')
    await app.reload()
    await openNavigation(app)

    // Long-press is the touch equivalent of a right click; the tree opens the same action list.
    await app.getByRole('treeitem', { name: path }).click({ button: 'right' })
    const sheet = app.getByRole('dialog', { name: 'Actions' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('menuitem', { name: 'Rename' })).toBeVisible()

    await app.goBack()
    await expect(sheet).toBeHidden()
  })

  test('shows one document at a time and lists the rest in a sheet', async ({ app, vault }) => {
    const first = await vault.write('one.md', 'first\n')
    const second = await vault.write('two.md', 'second\n')

    // One reload, then open both from the tree — reloading between them would drop the first tab.
    await app.reload()
    await openNavigation(app)
    await app.getByRole('treeitem', { name: first }).click()
    await expect(app.locator('.cm-content')).toContainText('first')

    // A tap opens a preview tab, which the next tap would reuse. Editing pins it, so both documents
    // stay open — the same rule as the desktop frame.
    await app.locator('.cm-line').first().click()
    await app.keyboard.type('!')

    await openNavigation(app)
    await app.getByRole('treeitem', { name: second }).click()
    await expect(app.locator('.cm-content')).toContainText('second')

    // Only the active document is rendered — no tiling on a narrow screen.
    await expect(app.locator('.cm-content')).toHaveCount(1)

    await app.getByRole('button', { name: /Open documents/ }).click()
    const sheet = app.getByRole('dialog', { name: 'Open documents' })
    await expect(sheet).toBeVisible()

    await sheet.getByRole('menuitem', { name: first }).click()
    await expect(app.locator('.cm-content')).toContainText('first')
  })

  test('back in a confirmation means cancel, never confirm', async ({ app, vault }) => {
    const path = await vault.write('keep.md', 'keep me\n')
    await app.reload()
    await openNavigation(app)

    await app.getByRole('treeitem', { name: path }).click({ button: 'right' })
    await app.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(app.getByRole('dialog')).toContainText('cannot be undone')

    await app.goBack()

    // The irreversible action must not have happened.
    await expect.poll(() => vault.read(path)).toBe('keep me\n')
  })
})

test.describe('the on-screen keyboard', () => {
  test.beforeEach(({ app }) => {
    test.skip(!isMobileViewport(app), 'only meaningful on the mobile frame')
  })

  // A real soft keyboard cannot be raised from a test, so this drives the signal the app actually
  // reacts to: an Android WebView shrinks the visual viewport without touching the layout viewport,
  // which is exactly why 100dvh alone leaves the toolbar under the keyboard.
  test('gives up the height the keyboard covers', async ({ app, vault }) => {
    const path = await vault.write('typing.md', 'line\n')
    await openNote(app, path)

    const shell = app.locator('.mobile-shell')
    await expect(shell).toHaveCSS('padding-bottom', '0px')

    await app.evaluate(() => {
      const vv = window.visualViewport
      if (vv == null) throw new Error('visualViewport is unavailable')
      Object.defineProperty(vv, 'height', { configurable: true, get: () => window.innerHeight - 300 })
      vv.dispatchEvent(new Event('resize'))
    })

    await expect(shell).toHaveCSS('padding-bottom', '300px')

    // The formatting toolbar has to stay above the keyboard, not behind it.
    const toolbar = app.getByRole('toolbar', { name: 'Formatting' })
    const box = await toolbar.boundingBox()
    const viewport = app.viewportSize()
    expect(box).not.toBeNull()
    if (box && viewport) expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 300)
  })
})
