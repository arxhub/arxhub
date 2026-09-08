// The rendered half of the design discipline (.claude/rules/design.md §Enforcement). It refuses what a
// source check cannot see: a strip assembled by hand out of perfectly good tokens, a role that renders at
// the wrong density because nothing asked the frame, a panel that moves where content starts.
//
// The other half is scripts/check-design.mjs. Neither replaces the other.
//
// This is a MEASUREMENT, so it asserts against the role's token value rather than a number typed twice:
// the expected values are read out of the running document's own custom properties.
import type { Page } from '@playwright/test'
import {
  expect,
  isMobileFrame,
  openDocumentList,
  openNavigation,
  openSettingsSection,
  openType,
  SHEET_LABEL,
  searchSheet,
  test,
  withShellChrome,
} from './fixtures'

async function token(page: Page, name: string): Promise<number> {
  const value = await page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)
  return Number.parseFloat(value)
}

async function heights(page: Page, selector: string): Promise<number[]> {
  return page
    .locator(selector)
    .evaluateAll((nodes) =>
      nodes.filter((n) => (n as HTMLElement).offsetParent !== null).map((n) => Math.round(n.getBoundingClientRect().height)),
    )
}

test.describe('the visual language holds on screen', () => {
  test('every strip renders at the strip role height', async ({ app, vault }) => {
    const note = await vault.write('strip.md', '# Strip\n\nbody\n')
    await app.reload()
    const expected = await token(app, '--size-md')

    // Enough surfaces to be worth measuring: the shell chrome plus a note, which brings the panel tab bar
    // and the editor strip with it.
    await openNavigation(app)
    await app.getByRole('treeitem', { name: note }).click()
    await expect(app.locator('.cm-content')).toBeVisible()

    const measured = await heights(app, '.strip')
    expect(measured.length).toBeGreaterThan(0)
    for (const height of measured) expect(height).toBe(expected)
  })

  test('rows render at the density the frame asks for', async ({ app, vault }) => {
    const note = await vault.write('rows.md', '# Rows\n\nbody\n')
    await app.reload()
    const mobile = await isMobileFrame(app)
    const expected = await token(app, mobile ? '--size-xl' : '--size-2xs')

    await openNavigation(app)
    await expect(app.getByRole('treeitem', { name: note })).toBeVisible()
    const tree = await heights(app, '.tree-node')
    expect(tree.length).toBeGreaterThan(0)
    for (const height of tree) expect(height).toBe(expected)

    // A second list, behind a right click: the action list of a tree node, which is a popover on the
    // desktop frame and a bottom sheet on the mobile one. Two presentations, one density — the sheet used
    // to be 56px on the argument that it holds the largest targets in the app, which is how the mobile
    // frame ended up with two touch densities at once.
    await app.getByRole('treeitem', { name: note }).click({ button: 'right' })
    await expect(app.getByRole('menuitem', { name: 'Rename' })).toBeVisible()
    const actions = await heights(app, '[role="menuitem"]')
    expect(actions.length).toBeGreaterThan(0)
    for (const height of actions) expect(height).toBe(expected)
    // Left as found: an open menu (a sheet especially) swallows the next click.
    if (mobile) await app.goBack()
    else await app.keyboard.press('Escape')
    await expect(app.getByRole('menuitem', { name: 'Rename' })).toBeHidden()

    // A third list, in another type, to prove the density is the role's and not one list's habit.
    await openSettingsSection(app, 'Appearance')
    // Picking a section is a navigation step, so the mobile frame closes the panel the rail lives in —
    // summon it back before measuring, or there is nothing laid out to measure.
    await openNavigation(app)
    const sections = await heights(app, '.settings-nav .row')
    expect(sections.length).toBeGreaterThan(0)
    for (const height of sections) expect(height).toBe(expected)
  })

  // A row whose content legitimately wraps has to grow DOWN from the role's value. Measuring it as "at
  // least" is the whole point: a log line that came out at 17px was not a dense row, it was a row that
  // never asked what a row is.
  test('a wrapping row grows down from the density, never below it', async ({ app }) => {
    const mobile = await isMobileFrame(app)
    const expected = await token(app, mobile ? '--size-xl' : '--size-2xs')

    // The log is where the boot writes itself down, so it has entries without seeding any. It is a hidden
    // mini-app opened from the status item, which lives in the search sheet on a phone.
    await withShellChrome(app, (chrome) => chrome.getByRole('button', { name: 'Open logs' }).click())
    await expect(app.locator('.log-panel')).toBeVisible()

    const entries = await heights(app, '.log-row')
    expect(entries.length).toBeGreaterThan(0)
    for (const height of entries) expect(height).toBeGreaterThanOrEqual(expected)
  })

  test('the sheets are the same touch density as the lists in front of them', async ({ app, vault }) => {
    test.skip(!(await isMobileFrame(app)), 'the desktop frame has no sheets')
    const note = await vault.write('sheets.md', '# Sheets\n\nbody\n')
    await app.reload()
    const expected = await token(app, '--size-xl')

    // The search sheet: one line each, so it lands exactly on the role's touch value.
    await app.getByRole('button', { name: SHEET_LABEL }).click()
    const sheet = searchSheet(app)
    await expect(sheet).toBeVisible()
    const apps = await heights(app, '.sheet-list .row')
    expect(apps.length).toBeGreaterThan(0)
    for (const height of apps) expect(height).toBe(expected)
    await app.goBack()
    await expect(sheet).toBeHidden()

    // The list of what is open in the type — a name with its path under it, so it grows down from the
    // same value rather than landing exactly on it.
    await openNavigation(app)
    await app.getByRole('treeitem', { name: note }).click()
    await expect(app.locator('.cm-content')).toBeVisible()
    await openDocumentList(app)
    const open = await heights(app, '.open-list .row')
    expect(open.length).toBeGreaterThan(0)
    for (const height of open) expect(height).toBeGreaterThanOrEqual(expected)
    await app.goBack()
  })

  test('switching workspace tabs does not move where content starts', async ({ app, vault }) => {
    test.skip(await isMobileFrame(app), 'the mobile frame shows one document at a time, with no tab strip')
    const note = await vault.write('tabs.md', '# Tabs\n\nbody\n')
    await app.reload()

    await openNavigation(app)
    await app.getByRole('treeitem', { name: note }).click()
    await expect(app.locator('.cm-content')).toBeVisible()
    const noteTop = await app
      .locator('.cm-editor')
      .first()
      .evaluate((n) => Math.round(n.getBoundingClientRect().top))

    await openType(app, 'Search')
    await app.locator('.search-rail').getByRole('button', { name: 'SQL console' }).click()
    // The visible one: every type entered this session keeps its stage mounted (F-05), and both of
    // these types still draw the ONE application panel store, so the console is in the document once
    // per stage — the debt AGENTS.md files under "one shared panel store for every type".
    const console = app.getByTestId('sql-console').filter({ visible: true })
    await expect(console).toBeVisible()
    const consoleTop = await console.locator('.console').evaluate((n) => Math.round(n.getBoundingClientRect().top))

    // Both panels of the same workspace: a page frame in one of them is what put 140px between these.
    expect(Math.abs(consoleTop - noteTop)).toBeLessThanOrEqual(1)
  })

  test('no glyph stands in for an icon in the chrome', async ({ app, vault }) => {
    const note = await vault.write('icons.arx', '')
    await app.reload()
    await openNavigation(app)
    await app.getByRole('treeitem', { name: note }).click()
    await expect(app.locator('.ProseMirror')).toBeVisible({ timeout: 60_000 })

    // An icon control renders an <svg>. A letter, a typographic mark or an emoji leaves text behind
    // instead — which is exactly what the formatting row of this editor used to be.
    const textOnlyControls = await app.locator('.strip button').evaluateAll((nodes) =>
      nodes
        .filter((n) => (n as HTMLElement).offsetParent !== null)
        .filter((n) => !n.querySelector('svg'))
        .map((n) => (n.textContent ?? '').trim())
        // A control that is labelled by a word is a button, not an icon standing in for one.
        .filter((text) => text.length > 0 && text.length <= 2),
    )
    expect(textOnlyControls).toEqual([])
  })
})
