import { expect, isMobileFrame, openDocumentList, openMiniApp, openNavigation, openNote, test } from './fixtures'

test.describe('the frame is chosen once, by the bundle', () => {
  test('a phone-shaped client mounts the mobile frame and a desktop one the rail', async ({ app }) => {
    if (await isMobileFrame(app)) {
      await expect(app.getByRole('navigation', { name: 'Navigation' })).toBeVisible()
      // A mini-app is a key in the bottom bar, never a permanent column beside the content. Explorer is
      // "Files" here: its mobile rail also carries the open documents and Search, which the name has to
      // cover (SidebarItem.mobileTitle).
      await expect(app.locator('.app-sidebar')).toHaveCount(0)
      await expect(app.getByRole('navigation', { name: 'Navigation' }).getByRole('button', { name: 'Files' })).toBeVisible()
    } else {
      await expect(app.locator('.mobile-shell')).toHaveCount(0)
      await expect(app.getByRole('button', { name: 'Explorer' })).toBeVisible()
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
    await expect(app.getByRole('main')).toBeVisible()
  })

  // The bar holds five keys, so the sheet is what guarantees reachability: every mini-app is in there,
  // including the utilities that never get a key and anything the bar could not fit.
  test('every mini-app is reachable from the More sheet', async ({ app }) => {
    await app.getByRole('button', { name: 'More' }).click()
    const sheet = app.getByRole('dialog', { name: 'More' })
    await expect(sheet.getByRole('button', { name: 'Files', exact: true })).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
    // And exactly one place per mini-app: Search is a section of the Files rail on this frame
    // (absorbedOnMobileBy), so the sheet must not offer it a second home as well.
    await expect(sheet.getByRole('button', { name: 'Search', exact: true })).toHaveCount(0)

    await app.goBack()
    await expect(sheet).toBeHidden()
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

  test('shows one document at a time and lists the rest in the rail', async ({ app, vault }) => {
    const first = await vault.write('one.md', 'first\n')
    const second = await vault.write('two.md', 'second\n')

    // One reload, then open both from the tree — reloading between them would drop the first tab.
    await app.reload()
    await openNavigation(app)
    await app.getByRole('treeitem', { name: first }).click()
    await expect(app.locator('.cm-content:visible')).toContainText('first')

    // A tap opens a preview tab, which the next tap would reuse. Editing pins it, so both documents
    // stay open — the same rule as the desktop frame.
    await app.locator('.cm-line').first().click()
    await app.keyboard.type('!')

    await openNavigation(app)
    await app.getByRole('treeitem', { name: second }).click()
    await expect(app.locator('.cm-content:visible')).toContainText('second')

    // One document on screen — no tiling on a narrow screen. The others stay mounted and hidden, so
    // switching back does not throw away what the editor was holding.
    await expect(app.locator('.cm-content:visible')).toHaveCount(1)

    // One at a time hides how many are waiting, so the rest are a section of the rail — the same panel
    // the tree came out of, one segment over.
    const list = await openDocumentList(app)
    await expect(list.getByRole('menuitem', { name: first })).toBeVisible()
    await expect(list.getByRole('menuitem', { name: second })).toBeVisible()

    await list.getByRole('menuitem', { name: first }).click()
    // Choosing one is navigation, so the panel it was chosen from gets out of the way.
    await expect(app.getByRole('region', { name: /navigation$/ })).toBeHidden()
    await expect(app.locator('.cm-content:visible')).toContainText('first')
  })

  // Every mini-app teleports its rail into the one shared panel, and switching mini-apps deactivates the
  // outgoing one under KeepAlive instead of destroying it — so a claim made once at setup and never
  // released left every mini-app visited this session still rendering into that panel, stacked under
  // whichever one named it last. The bottom-bar "Notes" key this used to watch is gone (the open
  // documents are a section of Explorer's rail now), but the accumulation it was a symptom of is the
  // same one, and the panel itself is where it shows.
  test('switching mini-apps does not stack rails in the shared panel', async ({ app, vault }) => {
    const path = await vault.write('kept.md', 'kept\n')
    await openNote(app, path)

    await openMiniApp(app, 'Settings')
    await openMiniApp(app, 'Files')

    await openNavigation(app)
    const panel = app.getByRole('region', { name: /navigation$/ })
    // Explorer's rail, once — and Settings' section list not still hiding underneath it.
    await expect(panel.locator('.explorer-mobile-rail')).toHaveCount(1)
    await expect(panel.locator('.settings-nav')).toHaveCount(0)
    // And the key that opens it names the mini-app that is actually in there.
    await expect(app.getByTestId('arxhub.shell.rail')).toHaveAttribute('aria-label', 'Files')
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
