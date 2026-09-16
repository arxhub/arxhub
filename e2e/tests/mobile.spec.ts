import { expect, isMobileFrame, openDocumentList, openNavigation, openNote, openType, SETTINGS_TYPE, test, typeRow, waitForApp } from './fixtures'

test.describe('the frame is chosen once, by the bundle', () => {
  test('a phone-shaped client mounts the mobile frame and a desktop one the rail', async ({ app }) => {
    // One model, two layouts: the same row of types runs along the bottom of a phone and down the left
    // of a window, and it answers to the same name in both — which is what stops a type from reaching
    // one frame and not the other.
    await expect(typeRow(app)).toBeVisible()
    await expect(typeRow(app).getByRole('button', { name: /^Notes(,|$)/ })).toBeVisible()

    if (await isMobileFrame(app)) {
      await expect(app.locator('.type-rail')).toHaveCount(0)
    } else {
      await expect(app.locator('.mobile-shell')).toHaveCount(0)
      await expect(app.locator('.type-rail')).toBeVisible()
    }
  })

  // The frames are two component trees now, not one tree reacting to a media query. Width is no
  // longer a signal, and this is what stops the app from ending up half in one frame and half in the
  // other at some intermediate size.
  test('resizing does not swap frames mid-session', async ({ app }) => {
    const original = app.viewportSize()
    if (!original) test.skip()
    const mobile = await isMobileFrame(app)

    await app.setViewportSize({ width: 1200, height: 800 })
    expect(await isMobileFrame(app)).toBe(mobile)

    await app.setViewportSize({ width: 400, height: 800 })
    expect(await isMobileFrame(app)).toBe(mobile)

    if (original) await app.setViewportSize(original)
  })
})

test.describe('mobile navigation', () => {
  // These describe the mobile frame specifically; the desktop project has no bottom bar or sheets.
  test.beforeEach(async ({ app }) => {
    test.skip(!(await isMobileFrame(app)), 'only meaningful on the mobile frame')
  })

  test('back closes the files panel instead of leaving the app', async ({ app }) => {
    await openNavigation(app)
    await app.goBack()

    await expect(app.getByRole('region', { name: /navigation$/ })).toBeHidden()
    // Still the app, not a blank tab or the previous page.
    await waitForApp(app)
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

  test('shows one document at a time and lists the rest behind a second tap', async ({ app, vault }) => {
    const first = await vault.write('one.md', 'first\n')
    const second = await vault.write('two.md', 'second\n')

    // One reload, then open both from the tree — reloading between them would drop the first tab.
    await app.reload()
    await openNavigation(app)
    await app.getByRole('treeitem', { name: first }).click()
    await expect(app.locator('.cm-content:visible')).toContainText('first')

    await openNavigation(app)
    await app.getByRole('treeitem', { name: second }).click()
    await expect(app.locator('.cm-content:visible')).toContainText('second')

    // One document on screen — no tiling on a narrow screen. The others stay mounted and hidden, so
    // switching back does not throw away what the editor was holding.
    await expect(app.locator('.cm-content:visible')).toHaveCount(1)

    // One at a time hides how many are waiting, so the second level is a second tap on the type you are
    // already in — the counter on the key is what says there is anything behind it.
    const list = await openDocumentList(app)
    await expect(list.getByRole('menuitem', { name: first })).toBeVisible()
    await expect(list.getByRole('menuitem', { name: second })).toBeVisible()

    await list.getByRole('menuitem', { name: first }).click()
    // Choosing one is navigation, so the layer it was chosen from gets out of the way.
    await expect(list).toBeHidden()
    await expect(app.locator('.cm-content:visible')).toContainText('first')
  })

  test('switching types does not stack navigation in the shared panel', async ({ app, vault }) => {
    const path = await vault.write('kept.md', 'kept\n')
    await openNote(app, path)
    await openType(app, 'Settings', SETTINGS_TYPE)
    await openNavigation(app)
    const panel = app.getByRole('region', { name: /navigation$/ })
    await expect(panel.locator('.settings-nav')).toHaveCount(1)
    await expect(panel.getByRole('tree')).toHaveCount(0)
    await openType(app, 'Search', 'arxhub.search')
    await expect(app.getByRole('textbox', { name: 'Search', exact: true })).toBeVisible()
    await expect(panel).toBeHidden()
    await expect(app.getByTestId('arxhub.shell.rail')).toHaveCount(0)
    await openType(app, 'Notes')
    await openNavigation(app)
    await expect(panel.getByRole('tree')).toHaveCount(1)
    await expect(panel.locator('.settings-nav')).toHaveCount(0)
    await expect(panel.locator('.search-rail')).toHaveCount(0)
  })

  // Back with nothing left to close is the gesture that ends the session, and it is the same gesture
  // that closes a sheet — so the one too many used to throw the owner out of the app, with no forward
  // gesture to come back with (OR-04).
  test('back with nothing left to close asks instead of leaving, and asking costs no history', async ({ app }) => {
    const leaving = app.getByRole('dialog', { name: 'Leave ArxHub?' })

    async function askAndCancel(): Promise<number> {
      await app.goBack()
      await expect(leaving).toBeVisible()
      await leaving.getByRole('button', { name: 'Cancel' }).click()
      await expect(leaving).toBeHidden()
      return app.evaluate(() => window.history.length)
    }

    const first = await askAndCancel()
    // Cancelling puts back the entry the gesture consumed, so asking again reaches the same question
    // rather than a session one entry deeper each time.
    expect(await askAndCancel()).toBe(first)
    await waitForApp(app)
  })

  test('back inside the leave confirmation cancels it, like any other confirmation', async ({ app }) => {
    const leaving = app.getByRole('dialog', { name: 'Leave ArxHub?' })
    await app.goBack()
    await expect(leaving).toBeVisible()

    await app.goBack()
    await expect(leaving).toBeHidden()
    await waitForApp(app)
  })

  test('the app is left once the exit is confirmed', async ({ app }) => {
    // A session whose only entry is the app has nowhere to go, so give it the page the owner would be
    // returning to — landing back there is what leaving means from inside a browser.
    await app.goto('about:blank')
    await app.goto('/')
    await waitForApp(app)

    await app.goBack()
    const leaving = app.getByRole('dialog', { name: 'Leave ArxHub?' })
    await expect(leaving).toBeVisible()
    await leaving.getByRole('button', { name: 'Exit' }).click()

    await expect.poll(() => app.url()).toBe('about:blank')
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
  test.beforeEach(async ({ app }) => {
    test.skip(!(await isMobileFrame(app)), 'only meaningful on the mobile frame')
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
