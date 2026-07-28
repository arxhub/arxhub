// The rendered half of the design discipline (.claude/rules/design.md §Enforcement). It refuses what a
// source check cannot see: a strip assembled by hand out of perfectly good tokens, a role that renders at
// the wrong density because nothing asked the frame, a panel that moves where content starts.
//
// The other half is scripts/check-design.mjs. Neither replaces the other.
//
// This is a MEASUREMENT, so it asserts against the role's token value rather than a number typed twice:
// the expected values are read out of the running document's own custom properties.
import type { Page } from '@playwright/test'
import { expect, isMobileFrame, openMiniApp, openNavigation, openSettingsSection, test } from './fixtures'

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

    // A second list, in another mini-app, to prove the density is the role's and not one list's habit.
    await openSettingsSection(app, 'Appearance')
    // Picking a section is a navigation step, so the mobile frame closes the panel the rail lives in —
    // summon it back before measuring, or there is nothing laid out to measure.
    await openNavigation(app)
    const sections = await heights(app, '.settings-nav .row')
    expect(sections.length).toBeGreaterThan(0)
    for (const height of sections) expect(height).toBe(expected)
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

    await openMiniApp(app, 'Search')
    await app.locator('.search-rail').getByRole('button', { name: 'SQL console' }).click()
    await expect(app.getByTestId('sql-console')).toBeVisible()
    const consoleTop = await app
      .getByTestId('sql-console')
      .locator('.console')
      .evaluate((n) => Math.round(n.getBoundingClientRect().top))

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
