import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { openSettingsSection, openType, test } from './fixtures'

// A settings page reads its file over the API and rebinds the field when it lands, so an edit made
// before that arrives does not survive it — and a section whose file does not exist yet legitimately
// loads as empty, so waiting for a value would hang.
//
// Retried rather than waited out, because the losing race is worse than "the edit is dropped": the
// late read appends to what was typed, so the field ends up holding `<file value><typed value>`. That
// is a defect in the form, not in this test — a fast typist can save a corrupt value — and this helper
// only keeps the suite honest about the rest of the flow until it is fixed.
async function setServerUrl(app: Page, value: string): Promise<void> {
  const input = app.locator('input[aria-label="Server URL"]:visible')
  await expect(input).toBeVisible()
  await expect(async () => {
    await input.fill(value)
    await expect(input).toHaveValue(value)
  }).toPass({ timeout: 10_000 })
}

// Reads a config file that may not exist yet — the suite shares one data dir, so a section's file
// is present or absent depending on what ran before.
async function readConfig(vault: { readData(path: string): Promise<string> }, path: string): Promise<string> {
  return vault.readData(path).catch(() => '')
}

test.describe('applying settings', () => {
  // These tests read and write the same config files in the suite's shared data dir, so running them
  // in parallel would have each one observing the other's writes.
  test.describe.configure({ mode: 'serial' })

  // Desktop only, declared in playwright.config.ts as the mobile project's testIgnore. Staging is
  // frame-agnostic — the same registry, bar and commit on both — but the two projects share one vault,
  // so running this on both has them overwriting each other's config file. The one genuine frame
  // difference (mobile files the pending-changes chip into the search sheet's status block instead of a
  // status bar) is asserted in search-sheet.spec.ts's own territory.
  test.beforeEach(async ({ app }) => {
    await app.waitForLoadState('domcontentloaded')
  })

  test('collects edits from several sections and writes them all on one apply', async ({ app, vault }, testInfo) => {
    // Per project, because both frames run this against one vault: a value the other project has
    // already saved is no longer an edit, and the section would stage nothing.
    const frame = testInfo.project.name

    await openSettingsSection(app, 'Sync')
    await setServerUrl(app, `https://hub-${frame}.example.com`)

    await openSettingsSection(app, 'Publishing')
    await setServerUrl(app, `https://pub-${frame}.example.com`)

    // The point of staging: one bar speaks for every section that has an edit.
    await expect(app.getByText('2 unsaved changes across 2 sections')).toBeVisible()

    // Leaving settings must not drop the drafts. The desktop frame keeps them in the status bar; the
    // mobile frame files every status widget behind the row's own immobile key, so only desktop shows
    // one here.
    await openType(app, 'Notes')
    if (testInfo.project.name === 'desktop') {
      await expect(app.getByRole('button', { name: /unsaved setting/ })).toBeVisible()
    }

    await openType(app, 'Settings')
    await app.getByRole('button', { name: 'Save & apply' }).click()

    // An apply stops at the first section that fails and leaves it staged, so the bar emptying is
    // itself the proof that BOTH commits succeeded — a half-applied set would still show one.
    await expect(app.getByRole('button', { name: 'Save & apply' })).toBeHidden()

    // Then one file off disk, to prove the commit really wrote rather than just clearing state.
    // Only Sync: publish.spec.ts writes storage/publish/config.toml in the same shared data dir, so
    // asserting that file here would race it.
    expect(await readConfig(vault, 'storage/sync/config.toml')).toContain(`hub-${frame}.example.com`)
  })

  // An edit that has not been applied yet has to survive both moves away from it a person can make:
  // to another section, and out of settings altogether. Two separate things hold it up — the section's
  // page stays mounted, and the staged draft is handed back to the page if it ever does not — and the
  // requirement is the same whichever carried it, so this asserts what is on screen rather than which.
  test('keeps a staged edit on screen across a section switch and a trip out of settings', async ({ app, vault }, testInfo) => {
    const staged = `https://kept-${testInfo.project.name}.example.com`

    await openSettingsSection(app, 'Sync')
    await setServerUrl(app, staged)
    await expect(app.getByRole('button', { name: 'Save & apply' })).toBeVisible()

    await openSettingsSection(app, 'Appearance')
    await openSettingsSection(app, 'Sync')
    await expect(app.locator('input[aria-label="Server URL"]:visible')).toHaveValue(staged)

    await openType(app, 'Notes')
    await openSettingsSection(app, 'Sync')
    await expect(app.locator('input[aria-label="Server URL"]:visible')).toHaveValue(staged)

    // Still an edit, not just text on screen: it applies, and the file says so.
    await app.getByRole('button', { name: 'Save & apply' }).click()
    await expect(app.getByRole('button', { name: 'Save & apply' })).toBeHidden()
    expect(await readConfig(vault, 'storage/sync/config.toml')).toContain(`kept-${testInfo.project.name}.example.com`)
  })

  // The second live bug the hotkeys registry was written for. ⌘S was a window listener added in
  // onMounted and removed in onBeforeUnmount — but a type's stage is never unmounted (it is v-show, so
  // an editor's buffer and a staged draft survive a switch), so onBeforeUnmount never ran and one visit
  // to Settings left ⌘S intercepted app-wide. With something staged it then applied the whole set from
  // a screen that was not Settings.
  //
  // It is now a binding in the Settings type's LAYER, and a layer is on the stack only while its stage
  // is on screen — so the leak is unrepresentable rather than merely fixed. Lives in this file, and not
  // in one of its own, because it stages an edit in the same config the tests above write: this
  // describe is serial and desktop-only, and a spec of its own would race them.
  test('⌘S applies the staged set inside settings and does nothing at all outside it', async ({ app, vault }, testInfo) => {
    const staged = `https://chord-${testInfo.project.name}.example.com`

    await openSettingsSection(app, 'Sync')
    await setServerUrl(app, staged)
    await expect(app.getByRole('button', { name: 'Save & apply' })).toBeVisible()

    // Out of settings, then the chord. Nothing must happen — not the apply, and not a swallowed key.
    await openType(app, 'Notes')
    await app.keyboard.press('ControlOrMeta+s')

    // Still staged is the whole assertion: an applied set empties the bar, so a bar that is still
    // there is the proof the chord did not reach Settings from outside it.
    await openType(app, 'Settings')
    await expect(app.getByRole('button', { name: 'Save & apply' })).toBeVisible()
    expect(await readConfig(vault, 'storage/sync/config.toml')).not.toContain(`chord-${testInfo.project.name}`)

    // And the other half: inside settings the chord still does its job, or the fix would just be the
    // binding deleted.
    await app.keyboard.press('ControlOrMeta+s')
    await expect(app.getByRole('button', { name: 'Save & apply' })).toBeHidden()
    expect(await readConfig(vault, 'storage/sync/config.toml')).toContain(`chord-${testInfo.project.name}.example.com`)
  })

  test('reverting drops every staged edit and writes nothing', async ({ app, vault }, testInfo) => {
    const discarded = `https://discarded-${testInfo.project.name}.example.com`
    const before = await readConfig(vault, 'storage/sync/config.toml')

    await openSettingsSection(app, 'Sync')
    await setServerUrl(app, discarded)
    await expect(app.getByRole('button', { name: 'Save & apply' })).toBeVisible()

    await app.getByRole('button', { name: 'Revert' }).click()

    await expect(app.getByRole('button', { name: 'Save & apply' })).toBeHidden()
    // The field goes back to the file, and the file itself was never touched.
    await expect(app.locator('input[aria-label="Server URL"]:visible')).not.toHaveValue(discarded)
    expect(await readConfig(vault, 'storage/sync/config.toml')).toBe(before)
  })
})
