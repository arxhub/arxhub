import type { Locator, Page } from '@playwright/test'
import { expect, isMobileFrame, openNavigation, openSearchApp, openSettingsSection, test, withShellChrome } from './fixtures'

async function unobstructed(control: Locator): Promise<void> {
  await expect(control).toBeVisible()
  expect(
    await control.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      return hit != null && el.contains(hit)
    }),
  ).toBe(true)
}

async function capture(page: Page, name: string): Promise<void> {
  const path = test.info().outputPath(`${name}.png`)
  await page.screenshot({ path, scale: 'css' })
  await test.info().attach(name, { path, contentType: 'image/png' })
}

test('compact editors keep formatting and save reachable', async ({ app, vault }) => {
  const mobile = await isMobileFrame(app)
  await app.setViewportSize(mobile ? { width: 360, height: 640 } : { width: 800, height: 600 })
  for (const ext of ['md', 'arx']) {
    const content =
      ext === 'md'
        ? '# A note\n\nWrite something here.\n'
        : JSON.stringify({
            version: 1,
            doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Write something here.' }] }] },
          })
    const path = await vault.write(`compact.${ext}`, content)
    await app.reload()
    await openNavigation(app)
    await app.getByRole('treeitem', { name: path, exact: true }).click()
    await expect(app.locator(ext === 'arx' ? '.ProseMirror:visible' : '.cm-content:visible')).toBeVisible()
    if (ext === 'arx') {
      await unobstructed(app.getByRole('button', { name: 'Document tools', exact: true }))
      await expect(app.getByRole('toolbar', { name: 'Formatting' })).toHaveCount(0)
      await app.locator('.ProseMirror:visible p').first().click()
      await app.keyboard.press('Home')
      await app.keyboard.press('Shift+End')
    } else await unobstructed(app.getByRole('button', { name: 'Save', exact: true }))
    if (mobile) {
      await unobstructed(app.getByRole('button', { name: 'More formatting', exact: true }))
      await capture(app, `${ext}-compact`)
      await app.getByRole('button', { name: 'More formatting', exact: true }).click()
      await expect(app.getByRole('menuitem', { name: ext === 'arx' ? 'Italic' : 'Heading 2', exact: true })).toBeVisible()
      await capture(app, `${ext}-formatting`)
      await app.keyboard.press('Escape')
    } else {
      await capture(app, `${ext}-compact`)
    }
    expect(await app.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})

test('compact tools keep their controls within the viewport', async ({ app }) => {
  const mobile = await isMobileFrame(app)
  await app.setViewportSize(mobile ? { width: 360, height: 640 } : { width: 800, height: 600 })
  await withShellChrome(app, (chrome) => chrome.getByRole('button', { name: 'Open logs' }).click())
  await unobstructed(app.getByRole('textbox', { name: 'Filter logs', exact: true }))
  await unobstructed(app.getByRole('combobox', { name: 'Log session', exact: true }))
  await capture(app, 'logs-compact')
  await openSearchApp(app)
  await capture(app, 'search-compact')
  await app.getByRole('button', { name: 'SQL console', exact: true }).click()
  await expect(app.getByTestId('sql-console')).toBeVisible()
  await capture(app, 'sql-compact')
  await openSettingsSection(app, 'Sync')
  await expect(app.getByRole('button', { name: 'Technical details', exact: true })).toBeVisible()
  await capture(app, 'settings-compact')
  expect(await app.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
