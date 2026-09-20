import type { Locator, Page } from '@playwright/test'
import { closeSettings, openProperties } from './arx-inspector-helpers'
import { expect, isMobileFrame, openNavigation, openSearchApp, openTreeActions, test } from './fixtures'

// A tooltip-wrapped trigger's hover/focus machinery does not treat a plain Playwright `.click()`
// (or a synthetic 'click' Event) as a real pointer interaction on the mobile project's touch-emulated
// page — a genuine touch sequence is what CDP's own touch events give it, the same trick
// arx-blocks.spec.ts's drag helper uses for the same reason.
async function tapOrClick(page: Page, locator: Locator, mobile: boolean): Promise<void> {
  if (!mobile) {
    await locator.click()
    return
  }
  const box = await locator.boundingBox()
  if (!box) throw new Error('Element has no bounding box to tap')
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

// The smallest valid GIF: one transparent pixel (preview.spec.ts's trick) — binary on purpose, and named
// .png because the point is a file that is not `.arx`, not that its bytes decode as one.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

interface CardDoc {
  version?: number
  doc?: { content?: { type: string; attrs?: Record<string, unknown> }[] }
}

function parseOrNull(text: string): CardDoc | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function save(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Document tools', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Save', exact: true }).click()
}

// A-48: user metadata lives in `.arx` — inside a document, or in a card beside anything else. This
// walks the whole path for a non-`.arx` file: create the card, edit it, see it on disk, see the tree
// fold it into its subject's row, and find it again by tag.
test.describe('properties (A-48)', () => {
  test('a photo gets a properties card, tagged and starred, findable by tag', async ({ app, vault }) => {
    const path = await vault.write('photo.png', PIXEL)
    await app.reload()
    await openNavigation(app)

    const row = app.getByRole('treeitem', { name: path, exact: true })
    await row.click({ button: 'right' })
    await app.getByRole('menuitem', { name: 'Properties…' }).click()

    const cardPath = `${path}.arx`
    const mobile = await isMobileFrame(app)
    await openProperties(app)
    const tags = app.getByRole('textbox', { name: 'Tags' })
    await expect(tags).toBeVisible()

    await tags.click()
    await tags.pressSequentially('family')
    await tags.press('Enter')
    await expect(app.locator('.chip-text', { hasText: 'family' })).toBeVisible()
    const favorite = app.getByRole('button', { name: 'Favorite' })
    // A touch tap is a coordinate gesture, not a locator action — retried like any other flaky gesture:
    // a worker under load can render a frame late enough that the coordinates read before the tap no
    // longer sit on the button by the time it lands.
    await expect
      .poll(async () => {
        await tapOrClick(app, favorite, mobile)
        return favorite.getAttribute('aria-pressed')
      })
      .toBe('true')
    await closeSettings(app)
    await save(app)

    // Polled on the actual tag, not merely on "a properties block exists": the card is written the
    // moment "Properties…" is picked (still empty then), so a loose match here would pass on THAT
    // file — before Save's own write has landed — rather than on what this test just typed.
    await expect
      .poll(() =>
        vault.read(cardPath).then(
          (text) => parseOrNull(text)?.doc?.content?.[0]?.attrs?.tags,
          () => null,
        ),
      )
      .toEqual(['family'])
    const written = parseOrNull(await vault.read(cardPath))
    const properties = written?.doc?.content?.[0]
    expect(properties?.attrs?.favorite).toBe(true)
    expect(properties?.attrs?.subject).toMatchObject({ path })

    // The tree shows one row for the subject file, with a tags glyph — no separate row for the card.
    await app.reload()
    await openNavigation(app)
    await expect(app.getByRole('treeitem', { name: path, exact: true })).toBeVisible()
    await expect(app.getByRole('treeitem', { name: cardPath, exact: true })).toHaveCount(0)
    await expect(app.getByRole('treeitem', { name: path, exact: true }).getByLabel('Has properties')).toBeVisible()

    // Reopening "Properties…" on the subject opens the SAME card rather than overwriting it.
    await openTreeActions(app, app.getByRole('treeitem', { name: path, exact: true }))
    await app.getByRole('menuitem', { name: 'Properties…' }).click()
    await openProperties(app)
    await expect(app.getByRole('textbox', { name: 'Tags' })).toBeVisible()
    await expect(app.locator('.chip-text', { hasText: 'family' })).toBeVisible()

    await closeSettings(app)
    await openSearchApp(app)
    await expect
      .poll(
        async () => {
          const field = app.getByRole('textbox', { name: 'Search' }).first()
          await field.fill('')
          await field.fill('tag:family')
          await app.waitForTimeout(400)
          return app.getByRole('listbox', { name: 'Search results' }).getByRole('option', { hasText: cardPath }).count()
        },
        { timeout: 20_000, message: `tag:family never found ${cardPath}` },
      )
      .toBeGreaterThan(0)
  })

  test('offers itself on any file but an .arx one', async ({ app, vault }) => {
    const path = await vault.write('already.arx', JSON.stringify({ version: 1, doc: { type: 'doc', content: [{ type: 'paragraph' }] } }))
    await app.reload()
    await openNavigation(app)

    await openTreeActions(app, app.getByRole('treeitem', { name: path, exact: true }))
    await expect(app.getByRole('menuitem', { name: 'Rename' })).toBeVisible()
    await expect(app.getByRole('menuitem', { name: 'Properties…' })).toHaveCount(0)
  })
})
