import { expect, isMobileFrame, openType, searchSheet, SETTINGS_TYPE, test, typeKey, waitForApp, withShellChrome } from './fixtures'

// The navigation model at the level both frames share: one registry of types behind the row, one sheet
// as the way to everything that holds no key in it, one desk that comes back after a restart — and no
// layer that ever does. Nothing here is about a layout, which is why nothing here skips itself on a
// frame: a claim that needed to would belong in mobile.spec.ts instead.

test.describe('the row of types', () => {
  // Exactly one key per type is the point of the one registry: Search used to be a mini-app on the
  // desktop and a section of Explorer's rail on the phone, which is the divergence a single
  // registration makes unrepresentable. Asked of BOTH frames deliberately — it is a claim about the
  // registry, and it used to be asked of the phone alone, which is the one place it could not fail.
  test('holds one key per type, and none for a type that is not open', async ({ app }) => {
    // Notes is the only pinned type left: settings joined search and the log viewer behind the sheet
    // (OR-05), because a permanent key is the frame's most reachable place and none of the three is
    // where the owner works.
    await expect(typeKey(app, 'Notes')).toHaveCount(1)

    // `pinned: false` means no permanent key — not "hidden", which is what it replaced. The key
    // appears for as long as the type is open and there is never a second one beside it.
    for (const [title, id] of [
      ['Search', 'arxhub.search'],
      ['Settings', 'arxhub.settings'],
    ] as const) {
      await expect(typeKey(app, title)).toHaveCount(0)
      await openType(app, title, id)
      await expect(typeKey(app, title)).toHaveCount(1)
    }
  })

  test('reaches an unpinned type only through the sheet, which then lists it as open', async ({ app }) => {
    // The log viewer is read when something has already gone wrong, so it holds no place in the row
    // (F-25). Its status item is a shortcut to it; the sheet's "Open new" section is the way that does
    // not depend on one plugin choosing to offer a shortcut, and it is the only one every type has.
    await expect(typeKey(app, 'Logs')).toHaveCount(0)

    await openType(app, 'Logs', 'arxhub.logs')
    await expect(app.locator('.log-panel')).toBeVisible()

    // And now it is something that IS open — a type with no objects stands for itself in the first
    // section rather than being left out for having no tabs, which would make the section quietly lie
    // about what is open.
    await app.keyboard.press('ControlOrMeta+k')
    await expect(searchSheet(app).getByTestId('sheet:open:arxhub.logs')).toBeVisible()
  })
})

test.describe('the desk', () => {
  test('comes back after a restart, and a layer never does', async ({ app }) => {
    await openType(app, 'Settings', SETTINGS_TYPE)
    await app.keyboard.press('ControlOrMeta+k')
    await expect(searchSheet(app)).toBeVisible()

    await app.reload()
    await waitForApp(app)

    // A clean desk opens on Notes, so Settings can only have come from the record on the device.
    await expect(typeKey(app, 'Settings')).toHaveAttribute('aria-pressed', 'true')
    // The sheet does not come back, and cannot: the record has four fields and none of them can hold a
    // layer. This is where a person would meet that if it ever stopped being true.
    await expect(searchSheet(app)).toBeHidden()
  })
})

test.describe('the status registry', () => {
  // A plugin declares WHAT it contributes and never where to draw it, and the one registration is laid
  // out differently per frame from the `kind` alone. Two of the three layouts are on screen here: the
  // desktop bar, which puts states and actions on opposite sides, and the phone's status block inside
  // the search sheet, which has one column and spends reading order on the same distinction. The
  // registry's own ordering is a unit test (plugins/shell status.test.ts); this is the half that is
  // only true once something has drawn it.
  test('lays one registration out by its kind, states before actions', async ({ app }) => {
    if (await isMobileFrame(app)) {
      await withShellChrome(app, async (chrome) => {
        const labels = await chrome
          .locator('.status-card button')
          .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') ?? ''))
        expect(labels).toContain('Open logs')
        expect(labels).toContain('Sync now')
        expect(labels.indexOf('Open logs')).toBeLessThan(labels.indexOf('Sync now'))
      })
      return
    }

    const bar = app.getByTestId('shell-footer')
    await expect(bar.locator('.states').getByRole('button', { name: 'Open logs' })).toBeVisible()
    await expect(bar.locator('.actions').getByRole('button', { name: 'Sync now' })).toBeVisible()
    // And not the other way round: the side belongs to the kind, never to the plugin.
    await expect(bar.locator('.actions').getByRole('button', { name: 'Open logs' })).toHaveCount(0)
    await expect(bar.locator('.states').getByRole('button', { name: 'Sync now' })).toHaveCount(0)
  })
})
