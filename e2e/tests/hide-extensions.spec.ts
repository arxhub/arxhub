import { expect, openFile, openNavigation, openSettingsSection, openType, test } from './fixtures'

// The seed an '.arx' reader accepts: the test that opens a document needs a file the editor can read,
// and a bare one is refused.
const ARX_DOC = JSON.stringify({ version: 1, doc: { type: 'doc', content: [{ type: 'paragraph' }] } })

// OR-03: a viewer claiming an extension is "known" — never a hand-written list — so these exercise the
// display through the registrations the app already carries rather than restating them: '.arx' is
// always claimed (the editor plugin), '.text' is claimed by nobody (tree.spec.ts's own case for "nothing
// can open this"), and '.png' is claimed only while Preview is running.
//
// Serial, like settings-save.spec.ts's own describe: one test here stages the Notes section's SYNCED
// setting off before restoring it, and every other test in this file reads the tree assuming the
// schema's own default (hide) — `fullyParallel` would otherwise let that one test's mid-flight "off" be
// read by another as if it were the default.
test.describe.configure({ mode: 'serial' })

// `vault.write` prefixes every name with the test's own title, so the expected visible name is always
// derived from the path it actually returned — never a bare literal like "contract" — or the assertion
// would pass by coincidence on a title that happens to produce one.
function withoutExtension(path: string, ext: string): string {
  return path.slice(0, -ext.length)
}

test.describe('hiding a known extension in the tree', () => {
  test('shows the bare name for a claimed extension, the full name for one nothing claims', async ({ app, vault }) => {
    const known = await vault.write('contract.arx', 'irrelevant — the tree never opens this file here\n')
    const unknown = await vault.write('report.text', 'irrelevant\n')
    await app.reload()
    await openNavigation(app)

    // The accessible name stays the full name either way (aria-label carries it untouched) — only the
    // visible label hides the tail, so a screen reader is never told less than the tree actually holds.
    await expect(app.getByRole('treeitem', { name: known }).locator('.tree-view-label')).toHaveText(withoutExtension(known, '.arx'))
    await expect(app.getByRole('treeitem', { name: unknown }).locator('.tree-view-label')).toHaveText(unknown)
  })

  // The half this rule was moved for: the tree hid the extension while the strip above the open
  // document spelled it out, which is one file named two ways on one screen. Both now read the same
  // answer, so a change to one of them cannot leave the other behind.
  test('the open document is named exactly as its row is', async ({ app, vault }) => {
    const path = await vault.write('agenda.arx', ARX_DOC)
    await openFile(app, path)

    await expect(app.getByTestId('document-name')).toHaveText(withoutExtension(path, '.arx'))
    await openNavigation(app)
    await expect(app.getByRole('treeitem', { name: path }).locator('.tree-view-label')).toHaveText(withoutExtension(path, '.arx'))
  })

  // The subtle part (OR-03): the rename field holds the visible stem only, so committing it must not
  // silently drop the extension that was never on screen to begin with.
  test('an inline rename keeps the hidden extension', async ({ app, vault }) => {
    const path = await vault.write('contract.arx', 'irrelevant\n')
    await app.reload()
    await openNavigation(app)

    await app.getByRole('treeitem', { name: path }).click({ button: 'right' })
    await app.getByRole('menuitem', { name: 'Rename' }).click()

    const input = app.getByRole('textbox', { name: 'New name' })
    await expect(input).toBeVisible()
    await expect(input).toHaveValue(withoutExtension(path, '.arx'))

    const renamedStem = `${withoutExtension(path, '.arx')}-v2`
    await input.fill(renamedStem)
    await input.press('Enter')

    await expect.poll(() => vault.read(`${renamedStem}.arx`).catch(() => null)).toBe('irrelevant\n')
    await expect(app.getByRole('treeitem', { name: path })).toHaveCount(0)
  })
})

// The setting belongs to the type, not to the tree: every surface that names a file reads one answer
// (NotesExtension.displayName), so it is the Notes section that carries it.
test.describe('the Notes settings section', () => {
  test('defaults to hiding, and switching it off shows every extension again — live, no restart', async ({ app, vault }) => {
    const path = await vault.write('brief.arx', 'irrelevant\n')
    await app.reload()
    await openNavigation(app)
    await expect(app.getByRole('treeitem', { name: path }).locator('.tree-view-label')).toHaveText(withoutExtension(path, '.arx'))

    await openSettingsSection(app, 'Notes')
    const toggle = app.getByRole('checkbox', { name: 'Hide known extensions' })
    await expect(toggle).toBeChecked()

    // The switch's own input is visually hidden — the maintenance and search switches carry a testid
    // for exactly this, but a schema-driven field (ConfigField.vue) has none to click instead, so the
    // click is forced through the accessible element rather than the box the owner actually sees.
    await toggle.click({ force: true })
    await expect(toggle).not.toBeChecked()
    await app.getByRole('button', { name: 'Save & apply' }).click()

    // Applied live, through the same PluginConfig.watch every other section's Save goes through — no
    // reload, and the row updates where it already is.
    await openType(app, 'Notes')
    await openNavigation(app)
    await expect(app.getByRole('treeitem', { name: path }).locator('.tree-view-label')).toHaveText(path)

    // Left as found (search.spec.ts's own rule for a device-wide toggle): this setting is SYNCED, so it
    // outlives this test in the one stand the whole project shares, and a later test's "defaults to
    // hiding" would otherwise be answered by whatever this test left behind rather than the schema's
    // own default.
    await openSettingsSection(app, 'Notes')
    await expect(toggle).not.toBeChecked()
    await toggle.click({ force: true })
    await expect(toggle).toBeChecked()
    await app.getByRole('button', { name: 'Save & apply' }).click()
  })
})

test.describe('the known set is never a snapshot', () => {
  // Proves OR-03's dynamism the same way maintenance.spec.ts proves a plugin switch itself: through the
  // real Plugins page and a real restart, not by asserting behaviour explorer only promises internally.
  test('switching off the plugin that claims an extension un-hides it on the next boot', async ({ app, vault }) => {
    const path = await vault.write('scan.png', 'not really a png — the tree never opens it here\n')
    await app.reload()
    await openNavigation(app)
    await expect(app.getByRole('treeitem', { name: path }).locator('.tree-view-label')).toHaveText(withoutExtension(path, '.png'))

    await openSettingsSection(app, 'Plugins')
    await app.getByTestId('plugin-switch-Preview').click()
    await app.getByRole('button', { name: 'Restart now' }).click()

    await openType(app, 'Notes')
    await openNavigation(app)
    await expect(app.getByRole('treeitem', { name: path }).locator('.tree-view-label')).toHaveText(path)
  })
})
