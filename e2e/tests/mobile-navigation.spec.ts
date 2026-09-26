import type { Locator, Page } from '@playwright/test'
import {
  activeTypeKey,
  expect,
  isMobileFrame,
  navigationSheet,
  openDocumentList,
  openNavigation,
  openNote,
  openType,
  SETTINGS_TYPE,
  setKeyboard,
  shownName,
  tabEntry,
  test,
  typeKey,
  typeRow,
} from './fixtures'

// Mobile navigation v2 (forge-wiki/planning/initiatives/01-navigation-model/mobile-navigation-v2.md): the type
// row and its counter, the second tap, the vault over the whole screen, New in three steps, the object bar
// and the band the keyboard turns it into. The counter is the one piece both frames draw.

function openCount(label: string | null): number {
  const match = /, (\d+) open$/.exec(label ?? '')
  return match == null ? 0 : Number(match[1])
}

// The keys of the phone's type row, More included.
function rowKeys(page: Page): Locator {
  return typeRow(page).getByRole('button')
}

function objectBar(page: Page): Locator {
  return page.getByTestId('object-bar')
}

// The tabs in the second-tap sheet, top to bottom, by their key (the document's path).
async function tabOrder(list: Locator): Promise<string[]> {
  const ids = await list
    .locator('[data-testid^="open:arxhub.documents:"]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-testid') ?? ''))
  return ids.map((id) => id.slice('open:arxhub.documents:'.length))
}

async function openFromTree(page: Page, path: string, text: string): Promise<void> {
  await openNavigation(page)
  await page.getByRole('treeitem', { name: path }).click()
  await expect(page.locator('.cm-content:visible')).toContainText(text)
}

test('a type key counts the tabs open inside it', async ({ app, vault }) => {
  const first = await vault.write('count-a.md', 'alpha\n')
  const second = await vault.write('count-b.md', 'beta\n')
  await openNote(app, first)

  const key = typeKey(app, 'Documents')
  const before = openCount(await key.getAttribute('aria-label'))
  expect(before).toBeGreaterThan(0)

  await openFromTree(app, second, 'beta')
  // The count is part of what the key says, so it is in the name as well as on the badge.
  await expect(key).toHaveAttribute('aria-label', `Documents, ${before + 1} open`)
  await expect(key).toContainText(String(before + 1))
})

test.describe('mobile navigation v2', () => {
  test.beforeEach(async ({ app }) => {
    test.skip(!(await isMobileFrame(app)), 'the type row, sheets and object bar are the phone frame')
  })

  test('the row holds four types and More, and the active type is always among them', async ({ app }) => {
    for (const [title, id] of [
      ['Search', 'arxhub.search'],
      ['Settings', SETTINGS_TYPE],
      ['Logs', 'arxhub.logs'],
      ['Budget', 'arxhub.budget'],
    ] as const) {
      await openType(app, title, id)
    }
    // Five types open, four keys and More — never a ribbon to scroll.
    await expect(rowKeys(app)).toHaveCount(5)
    const more = typeRow(app).getByTestId('arxhub.shell.search')
    await expect(more).toHaveAttribute('aria-label', 'More, 1 not in the row')
    // Budget was opened last and would not fit: it takes the last key rather than hiding where you are.
    await expect(typeKey(app, 'Budget')).toHaveAttribute('aria-pressed', 'true')
    await expect(typeKey(app, 'Budget')).toBeInViewport()
    // Keys are icons; the names live in the accessible names only.
    await expect(typeRow(app)).not.toContainText('Budget')
  })

  test('a second tap lists the tabs oldest first, and a chosen tab becomes the freshest', async ({ app, vault }) => {
    const a = await vault.write('order-a.md', 'first\n')
    const b = await vault.write('order-b.md', 'second\n')
    const c = await vault.write('order-c.md', 'third\n')
    await app.reload()
    await openFromTree(app, a, 'first')
    await openFromTree(app, b, 'second')
    await openFromTree(app, c, 'third')

    let list = await openDocumentList(app)
    expect((await tabOrder(list)).slice(-3)).toEqual([a, b, c])
    // The freshest sits under the thumb, and the sheet opens scrolled to it.
    await expect(tabEntry(list, shownName(c))).toHaveAccessibleName(/ Current tab$/)
    await expect(tabEntry(list, shownName(c))).toBeInViewport()
    // The road from what is open to everything that could be.
    await expect(list.getByTestId('type-sheet-browse')).toBeVisible()
    await expect(list.getByTestId('type-sheet-find')).toBeVisible()

    await tabEntry(list, shownName(a)).click()
    await expect(list).toBeHidden()
    await expect(app.locator('.cm-content:visible')).toContainText('first')

    list = await openDocumentList(app)
    expect((await tabOrder(list)).slice(-3)).toEqual([b, c, a])

    // By id: the sheet is modal, so the row under it is out of the accessibility tree while it is up.
    const key = app.getByTestId('type-arxhub.documents')
    const before = openCount(await key.getAttribute('aria-label'))
    await list.getByRole('button', { name: `Close ${shownName(b)}`, exact: true }).click()
    await expect.poll(() => tabOrder(list)).not.toContain(b)
    await expect(key).toHaveAttribute('aria-label', `Documents, ${before - 1} open`)
  })

  test("Budget's second tap is its months by year, the current one marked", async ({ app }) => {
    await openType(app, 'Budget', 'arxhub.budget')
    await activeTypeKey(app).click()
    const sheet = app.getByRole('dialog', { name: 'Budget · Months', exact: true })
    await expect(sheet).toBeVisible()

    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const current = sheet.getByTestId(`budget-month:${month}`)
    await expect(sheet).toContainText(String(now.getFullYear()))
    await expect(current).toHaveAttribute('aria-current', 'true')
    await expect(current).toContainText('this month')
    // Months are a choice, not a search.
    await expect(sheet.getByRole('searchbox')).toHaveCount(0)
    await expect(sheet.getByTestId('type-sheet-find')).toHaveCount(0)

    await current.click()
    await expect(sheet).toBeHidden()
  })

  test('the vault opens over the whole screen with its finder focused, and reveals where you are', async ({ app, vault }) => {
    const path = await vault.write('reveal/zebrafinder.md', 'found by name\n')
    await app.reload()
    await openNavigation(app)
    const sheet = app.getByRole('dialog', { name: 'Vault', exact: true })
    await expect(sheet).toBeVisible()
    const viewport = app.viewportSize()
    const box = await sheet.boundingBox()
    if (viewport != null && box != null) expect(box.height).toBeGreaterThan(viewport.height * 0.8)

    const find = sheet.getByTestId('nav-sheet-find')
    await expect(find).toBeFocused()
    await find.fill('zebrafinder')
    // The walk runs detached from the boot, so the finder answers once the file is in the index.
    const hit = sheet.getByRole('option').filter({ hasText: shownName('zebrafinder.md') })
    await expect(hit.first()).toBeVisible({ timeout: 40_000 })
    await hit.first().click()
    await expect(sheet).toBeHidden()
    await expect(app.locator('.cm-content:visible')).toContainText('found by name')

    // Back in the vault, the open document's folder is unfolded to it.
    await openNavigation(app)
    await expect(navigationSheet(app).getByRole('treeitem', { name: path.split('/')[1], exact: true })).toBeVisible()
  })

  test('New makes a document in three steps: what, where, confirm', async ({ app, vault }) => {
    const seed = await vault.write('create-home/seed.md', 'seed\n')
    const folder = seed.split('/')[0]
    await app.reload()

    await objectBar(app).getByRole('button', { name: 'New document', exact: true }).click()
    const sheet = app.getByRole('dialog', { name: 'Create', exact: true })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByTestId('create-kind:upload')).toBeVisible()
    await sheet.getByTestId('create-kind:.arx').click()

    const where = app.getByRole('dialog', { name: 'Where · Document', exact: true })
    await expect(where).toBeVisible()
    await where.getByTestId('folder-picker').getByRole('treeitem', { name: folder, exact: true }).click()

    // A new folder is a draft row in the tree itself, and making it chooses it.
    await where.getByTestId('folder-picker-new').click()
    await where.getByRole('textbox', { name: 'Folder name' }).fill('inner')
    await where.getByRole('button', { name: 'Create folder', exact: true }).click()
    await expect(where.getByTestId('folder-picker-new')).toHaveAccessibleName('New folder in «inner»')

    await where.getByTestId('create-name').fill('Plan')
    const confirm = where.getByTestId('create-confirm')
    await expect(confirm).toHaveText('Create document in «inner»')
    await confirm.click()
    await expect(where).toBeHidden()

    await expect
      .poll(() =>
        vault.read(`${folder}/inner/Plan.arx`).then(
          () => true,
          () => false,
        ),
      )
      .toBe(true)
    // What was made opens as a new tab, and the band names it.
    await expect(objectBar(app)).toContainText('Plan')
  })

  test('at 360 the band keeps its name and moves what does not fit into More', async ({ app, vault }) => {
    await app.setViewportSize({ width: 360, height: 740 })
    const path = await vault.write('narrow-band-with-a-long-name.md', 'narrow\n')
    await openNote(app, path)

    const bar = objectBar(app)
    await expect(bar).toBeVisible()
    await expect(bar.getByTestId('object-bar-name')).toContainText(shownName(path))
    const nameBox = await bar.getByTestId('object-bar-name').boundingBox()
    expect(nameBox?.width ?? 0).toBeGreaterThanOrEqual(120)
    for (const key of await bar.getByRole('button').all()) {
      const box = await key.boundingBox()
      if (box == null) continue
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(360)
    }
    expect(await bar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)

    await bar.getByRole('button', { name: 'More actions', exact: true }).click()
    const items = app.getByRole('menuitem')
    await expect(items.filter({ hasText: 'Rename' })).toBeVisible()
    await expect(items.filter({ hasText: 'Close' })).toBeVisible()
    // Destructive last.
    await expect(items.last()).toHaveText(/Delete/)
    await app.goBack()
  })

  test('while typing the type row goes and the band becomes the editing band', async ({ app, vault }) => {
    const path = await vault.write('typing-band.md', 'line\n')
    await openNote(app, path)
    await app.locator('.cm-content:visible').click()
    await app.keyboard.type('more ')

    await setKeyboard(app, 300)
    await expect(typeRow(app)).toBeHidden()
    const band = objectBar(app).getByRole('toolbar', { name: 'Formatting' })
    await expect(band).toBeVisible()
    // Undo and redo first — they matter only while editing — and Hide keyboard at the end.
    const keys = band.getByRole('button')
    await expect(keys.first()).toHaveAccessibleName('Undo')
    await expect(keys.nth(1)).toHaveAccessibleName('Redo')
    await expect(keys.last()).toHaveAccessibleName('Hide keyboard')
    const box = await band.boundingBox()
    const viewport = app.viewportSize()
    if (box != null && viewport != null) expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 300)

    await keys.last().click()
    await expect(app.locator('.cm-content:visible')).not.toBeFocused()

    await setKeyboard(app, 0)
    await expect(typeRow(app)).toBeVisible()
  })
})
