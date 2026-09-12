import { fileURLToPath } from 'node:url'
import type { Page, Route } from '@playwright/test'
import { expect, openNavigation, test } from './fixtures'

const fixtureModule = `/@fs${fileURLToPath(new URL('../fixtures/arx-components.ts', import.meta.url))}`
const mainModule = (url: URL) => url.pathname === '/src/main.ts'

// Contribute exactly as another installed plugin would, before the app's lifecycle starts.
// Intercepting this composition root keeps the fixture out of every shipped application bundle.
async function withComponents(page: Page) {
  const install = async (route: Route) => {
    const response = await route.fetch()
    const source = await response.text()
    const registration = 'arxhub.plugins.register(ArxEditorPlugin)'
    expect(source).toContain(registration)
    const body = `import { ArxComponentsFixturePlugin } from ${JSON.stringify(fixtureModule)};\n${source.replace(registration, `${registration}; arxhub.plugins.register(ArxComponentsFixturePlugin)`)}`
    await route.fulfill({ response, body })
  }
  await page.route(mainModule, install)
  return () => page.unroute(mainModule, install)
}

async function mode(page: Page, name: string) {
  await page.getByRole('button', { name: /^Editor mode:/ }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
}

test('an installed plugin renders, validates, saves and restores its component in both frames', async ({ app, vault }) => {
  const uninstall = await withComponents(app)
  const original = JSON.stringify({ version: 1, doc: { type: 'doc', content: [{ type: 'paragraph' }] } })
  const path = await vault.write(`${test.info().project.name}-components.arx`, original)
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const editor = app.locator('.ProseMirror:visible')
  await editor.click()
  await app.keyboard.insertText('/rating')
  await app.getByRole('option', { name: 'Rating', exact: true }).click()
  const rating = editor.getByTestId('plugin-rating')
  await expect(rating).toBeVisible()
  await mode(app, 'Interactive')
  await rating.getByRole('button', { name: 'Increase rating' }).click()
  await expect(rating.getByLabel('Rating value')).toHaveText('1')
  await rating.getByRole('button', { name: 'Invalid rating' }).click()
  await expect(rating.getByLabel('Rating value')).toHaveText('1')
  await app.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => vault.read(path)).toContain('"value": 1')
  await mode(app, 'Read only')
  await expect(rating.getByRole('button', { name: 'Increase rating' })).toBeDisabled()
  await app.reload()
  await expect(app.getByTestId('plugin-rating').getByLabel('Rating value')).toHaveText('1')
  const saved = await vault.read(path)
  await uninstall()
  await app.reload()
  await expect(app.locator('.unknown-block')).toContainText('fixture_rating')
  await app.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(async () => JSON.parse(await vault.read(path))).toEqual(JSON.parse(saved))
  await withComponents(app)
  await app.reload()
  await expect(app.getByTestId('plugin-rating').getByLabel('Rating value')).toHaveText('1')
})

test('a failing plugin component is contained and retried without reloading the buffer', async ({ app, vault }) => {
  await withComponents(app)
  const path = await vault.write(
    `${test.info().project.name}-recoverable.arx`,
    JSON.stringify({
      version: 1,
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Keep these words' }] },
          { type: 'fixture_recoverable', attrs: { payload: 'Keep plugin data too' } },
        ],
      },
    }),
  )
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  await expect(app.getByRole('alert')).toContainText("This block couldn't load")
  const editor = app.locator('.ProseMirror:visible')
  await editor.locator('p').first().click()
  await app.keyboard.press('End')
  await app.keyboard.insertText(' and edits')
  await app.getByRole('button', { name: 'Retry block', exact: true }).click()
  await expect(editor).toContainText('Recovered plugin component')
  await expect(editor).toContainText('Keep these words and edits')
  await app.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => vault.read(path)).toContain('Keep these words and edits')
  expect(await vault.read(path)).toContain('Keep plugin data too')
})

test('an installed plugin migrates its saved data before editing', async ({ app, vault }) => {
  await withComponents(app)
  const original = JSON.stringify({
    version: 1,
    plugins: { 'fixture.rating': 1 },
    doc: { type: 'doc', content: [{ type: 'fixture_rating', attrs: { score: '3', maximum: 5 } }] },
  })
  const path = await vault.write(`${test.info().project.name}-migration.arx`, original)
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  await expect(app.getByTestId('plugin-rating').getByLabel('Rating value')).toHaveText('3')
  expect(await vault.read(path)).toBe(original)
  await app.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(async () => JSON.parse(await vault.read(path)).plugins['fixture.rating']).toBe(2)
  expect(JSON.parse(await vault.read(path)).doc.content[0].attrs).toEqual({ value: 3, maximum: 5 })
  await app.reload()
  await expect(app.getByTestId('plugin-rating').getByLabel('Rating value')).toHaveText('3')
})
