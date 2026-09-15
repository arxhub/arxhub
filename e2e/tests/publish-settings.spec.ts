import type { Page } from '@playwright/test'
import { expect, openNavigation, openSettingsSection, openType, publishTest as test } from './fixtures'

// Same retry shape as settings-save.spec.ts's setServerUrl: a settings page rebinds its field when its
// file read lands, so a fast fill can race it.
async function setServerUrl(app: Page, value: string): Promise<void> {
  const input = app.locator('input[aria-label="Server URL"]:visible')
  await expect(input).toBeVisible()
  await expect(async () => {
    await input.fill(value)
    await expect(input).toHaveValue(value)
  }).toPass({ timeout: 10_000 })
}

// The worked example for PluginConfig.watch (AGENTS.md, "Settings saves are global"): the Publish
// section used to say "Restart ArxHub after changing the server", because PublishPlugin only ever read
// serverUrl once, in start(). Saving the section now rebuilds the remote live — no reload, and the
// tree's context menu is the affordance that proves it (registerNodeActions only offers Publish/
// Republish/Copy link/Unpublish while PublishExtension.enabled, i.e. while a publisher exists).
//
// Runs under publishTest: this writes storage/publish/config.toml in the project's data dir, and the other
// publishing specs seed the same file — so the three take the project's publish store in turn.
test('saving a server URL turns on Publish; clearing it turns it off — both without a reload', async ({ app, vault, baseURL }, testInfo) => {
  const path = await vault.write(`${testInfo.project.name}-live-publish.arx`, JSON.stringify({ version: 1, doc: { type: 'doc', content: [] } }))
  // Off to begin with, on purpose: the other publishing specs seed an address into this same file and
  // leave it there, and this test's first claim is what the tree offers while there is none.
  await vault.writeData('storage/publish/config.toml', 'serverUrl = ""\n')
  await app.reload()

  await openNavigation(app)
  await app.getByRole('treeitem', { name: path }).click({ button: 'right' })
  await expect(app.getByRole('menuitem', { name: 'Publish', exact: true })).toHaveCount(0)
  await app.keyboard.press('Escape')

  await openSettingsSection(app, 'Publishing')
  await setServerUrl(app, baseURL ?? '')
  await app.getByRole('button', { name: 'Save & apply' }).click()
  await expect(app.getByRole('button', { name: 'Save & apply' })).toBeHidden()

  await openType(app, 'Notes')
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path }).click({ button: 'right' })
  await expect(app.getByRole('menuitem', { name: 'Publish', exact: true })).toBeVisible()
  await app.keyboard.press('Escape')

  await openSettingsSection(app, 'Publishing')
  await setServerUrl(app, '')
  await app.getByRole('button', { name: 'Save & apply' }).click()
  await expect(app.getByRole('button', { name: 'Save & apply' })).toBeHidden()

  await openType(app, 'Notes')
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path }).click({ button: 'right' })
  await expect(app.getByRole('menuitem', { name: 'Publish', exact: true })).toHaveCount(0)
})
