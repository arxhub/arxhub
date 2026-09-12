import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { expect, isMobileFrame, openNavigation, test } from './fixtures'

const cell = (page: Page, name: string) => page.getByRole('gridcell', { name, exact: true })
const input = (page: Page) => page.getByRole('textbox', { name: 'Cell value or formula', exact: true })
const sheet = (cells: Record<string, string>) => ({ version: 1, rows: 1000, columns: 26, cells })
async function open(page: Page, path: string) {
  await page.reload()
  await openNavigation(page)
  await page.getByRole('treeitem', { name: path, exact: true }).click()
  await expect(page.getByRole('grid', { name: 'Spreadsheet', exact: true })).toBeVisible()
}
async function action(page: Page, name: string, advanced = true) {
  await page.getByRole('button', { name: 'Spreadsheet actions', exact: true }).click()
  if (advanced) await page.getByRole('menuitem', { name: 'More tools', exact: true }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
}
async function edit(page: Page, key: string, value: string) {
  await cell(page, key).click()
  await input(page).fill(value)
  await page.getByRole('button', { name: 'Apply cell', exact: true }).click()
}

test('scrolling cached cells does not post calculation requests or blank their results', async ({ app, vault }) => {
  await app.addInitScript(() => {
    const original = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (message, options) {
      if (message && Array.isArray(message.keys))
        document.documentElement.dataset.calculationRequests = String(Number(document.documentElement.dataset.calculationRequests ?? 0) + 1)
      return original.call(this, message, options as StructuredSerializeOptions)
    }
  })
  const path = await vault.write(
    `${test.info().project.name}-cache.arxs`,
    JSON.stringify(sheet({ A1: '5', B1: '=SUM(A1:A1000)', B300: '=B1*2' })),
  )
  await open(app, path)
  await expect(cell(app, 'B1')).toHaveText('5')
  const grid = app.getByRole('grid', { name: 'Spreadsheet', exact: true })
  await grid.evaluate((node) => {
    node.scrollTop = 3000
  })
  await expect(cell(app, 'B1')).toHaveCount(0)
  await grid.evaluate((node) => {
    node.scrollTop = 0
  })
  await expect(cell(app, 'B1')).toHaveText('5')
  const count = await app.locator('html').getAttribute('data-calculation-requests')
  await grid.evaluate((node) => {
    node.scrollTop = 3000
  })
  await expect(cell(app, 'B1')).toHaveCount(0)
  await grid.evaluate((node) => {
    node.scrollTop = 0
  })
  await expect(cell(app, 'B1')).toHaveText('5')
  expect(await app.locator('html').getAttribute('data-calculation-requests')).toBe(count)
  await edit(app, 'A1', '7')
  await expect(cell(app, 'B1')).toHaveText('7')
})

test('structural edits update cross-sheet formulas and undo survives sheet switches', async ({ app, vault }) => {
  const path = await vault.write(
    `${test.info().project.name}-book.arxs`,
    JSON.stringify({
      version: 2,
      active: 'a',
      sheets: [
        { id: 'a', name: 'Data', sheet: sheet({ A1: '2', A2: '3', B1: '=SUM(A1:A2)' }) },
        { id: 'b', name: 'Totals', sheet: sheet({ A1: "=SUM('Data'!A1:A2)" }) },
      ],
    }),
  )
  await open(app, path)
  await cell(app, 'A2').click()
  await action(app, 'Insert selected rows above')
  await expect(cell(app, 'A3')).toHaveText('3')
  await cell(app, 'B1').click()
  await expect(input(app)).toHaveValue('=SUM(A1:A3)')
  await app.locator('.sheet-tabs').getByText('Totals', { exact: true }).click()
  await expect(cell(app, 'A1')).toHaveText('5')
  await expect(input(app)).toHaveValue("=SUM('Data'!A1:A3)")
  await app.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(app.getByRole('radio', { name: 'Data', exact: true })).toBeChecked()
  await expect(cell(app, 'A2')).toHaveText('3')
  await app.getByRole('button', { name: 'Add sheet', exact: true }).click()
  await edit(app, 'A1', "='Totals'!A1*2")
  await expect(cell(app, 'A1')).toHaveText('10')
  await app.getByRole('button', { name: 'Worksheet actions', exact: true }).click()
  await app.getByRole('menuitem', { name: 'Rename sheet', exact: true }).click()
  await app.getByRole('textbox', { name: 'Sheet name', exact: true }).fill('Report')
  await app.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click()
  await app.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => vault.read(path)).toContain('Report')
  await open(app, path)
  await expect(cell(app, 'A1')).toHaveText('10')
})

test('formula assistance completes a function and cycles absolute references without committing', async ({ app, vault }) => {
  const path = await vault.write(`${test.info().project.name}-assist.arxs`, JSON.stringify(sheet({ A1: '2', A2: '3' })))
  await open(app, path)
  await cell(app, 'B1').click()
  await input(app).fill('=SU')
  await expect(app.getByRole('button', { name: 'SUM', exact: true })).toBeVisible()
  await input(app).press('Tab')
  await expect(input(app)).toHaveValue('=SUM(')
  await expect(app.locator('.sheet-formula-help')).toContainText('argument 1')
  await cell(app, 'A1').click()
  await input(app).press('F4')
  await expect(input(app)).toHaveValue('=SUM($A$1')
  await input(app).pressSequentially(')')
  await input(app).press('Enter')
  await expect(cell(app, 'B1')).toHaveText('2')
  await cell(app, 'B1').click()
  await input(app).fill('=1+99')
  await input(app).press('Tab')
  await expect(app.getByRole('button', { name: 'Cancel cell edit', exact: true })).toBeFocused()
  await expect(cell(app, 'B1')).toHaveText('2')
  await app.keyboard.press('Enter')
  await expect(input(app)).toHaveValue('=SUM($A$1)')
  await expect(cell(app, 'B1')).toHaveText('2')
})

test('formats, variable widths and frozen panes persist while sorting and filtering keep related cells together', async ({ app, vault }) => {
  const path = await vault.write(
    `${test.info().project.name}-layout.arxs`,
    JSON.stringify(sheet({ A1: 'Rate', B1: 'Name', A2: '0.3', B2: 'C', A3: '0.1', B3: 'A', A4: '0.2', B4: 'B' })),
  )
  await open(app, path)
  await cell(app, 'A2').click()
  await cell(app, 'A4').click({ modifiers: ['Shift'] })
  await action(app, 'Format cells')
  const formatChoices = app.getByRole('dialog').getByRole('radiogroup', { name: 'Number format' })
  expect(await formatChoices.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  await expect(formatChoices.getByText('Date', { exact: true })).toBeInViewport()
  await app.getByRole('dialog').getByText('Percent', { exact: true }).click()
  await app.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(cell(app, 'A2')).toContainText('30')
  await action(app, 'Column width, wrapping and freeze')
  await app.getByRole('spinbutton', { name: 'Column width' }).fill('160')
  await app.getByRole('spinbutton', { name: 'Frozen rows' }).fill('1')
  await app.getByRole('spinbutton', { name: 'Frozen columns' }).fill('1')
  await app.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click()
  expect((await cell(app, 'A2').boundingBox())?.width).toBe(160)
  const grid = app.getByRole('grid', { name: 'Spreadsheet', exact: true })
  const before = await cell(app, 'A1').boundingBox()
  await grid.evaluate((node) => {
    node.scrollTop = 500
    node.scrollLeft = 500
  })
  await expect.poll(() => cell(app, 'A1').boundingBox()).toEqual(before)
  await grid.evaluate((node) => {
    node.scrollTop = 0
    node.scrollLeft = 0
  })
  await cell(app, 'A1').click()
  await cell(app, 'B4').click({ modifiers: ['Shift'] })
  await action(app, 'Sort selected range')
  await app.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(cell(app, 'B2')).toHaveText('A')
  await expect(cell(app, 'B4')).toHaveText('C')
  await cell(app, 'A1').click()
  await cell(app, 'B4').click({ modifiers: ['Shift'] })
  await action(app, 'Filter selected range')
  await app.getByRole('textbox', { name: 'Column letter' }).fill('B')
  await app.getByRole('textbox', { name: 'Filter text' }).fill('B')
  await app.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(cell(app, 'B2')).toHaveCount(0)
  await expect(cell(app, 'B3')).toHaveText('B')
  await action(app, 'Clear filter')
  await expect(cell(app, 'B2')).toHaveText('A')
  await app.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => vault.read(path)).toContain('"freeze":{"rows":1,"columns":1}')
})

test('fill handle extends numeric sequences using mouse and touch', async ({ app, vault }) => {
  const path = await vault.write(`${test.info().project.name}-fill.arxs`, JSON.stringify(sheet({ A1: '2', A2: '4' })))
  await open(app, path)
  await cell(app, 'A1').click()
  await cell(app, 'A2').click({ modifiers: ['Shift'] })
  const handle = await app.getByRole('button', { name: 'Drag to autofill', exact: true }).boundingBox(),
    target = await cell(app, 'A5').boundingBox()
  if (!handle || !target) throw new Error('Fill endpoints missing')
  const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
    end = { x: target.x + target.width / 2, y: target.y + target.height / 2 }
  if (await isMobileFrame(app)) {
    const cdp = await app.context().newCDPSession(app)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
  } else {
    await app.mouse.move(start.x, start.y)
    await app.mouse.down()
    await app.mouse.move(end.x, end.y, { steps: 6 })
    await app.mouse.up()
  }
  await expect(cell(app, 'A5')).toHaveText('10')
  await app.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(app, 'A5')).toHaveText('')
})

test('XLSX export and reviewed import run in the browser worker and can be undone', async ({ app, vault }) => {
  const path = await vault.write(`${test.info().project.name}-exchange.arxs`, JSON.stringify(sheet({ A1: '7', B1: '=A1*2' })))
  await open(app, path)
  const downloading = app.waitForEvent('download')
  await action(app, 'Export XLSX workbook')
  const download = await downloading,
    file = await download.path()
  if (!file) throw new Error('XLSX download missing')
  expect(download.suggestedFilename()).toContain('.xlsx')
  await edit(app, 'A1', '99')
  await app.getByLabel('Import XLSX', { exact: true }).setInputFiles({
    name: 'roundtrip.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await readFile(file),
  })
  await expect(app.getByRole('dialog', { name: 'Import XLSX workbook' })).toBeVisible()
  await expect(app.locator('.sheet-cell[aria-label="B1"]')).toHaveText('198')
  await app.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(cell(app, 'B1')).toHaveText('14')
  await app.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(app, 'B1')).toHaveText('198')
})

test('arx spreadsheet embed displays saved results and opens the source workbook', async ({ app, vault }) => {
  const source = await vault.write(`${test.info().project.name}-source.arxs`, JSON.stringify(sheet({ A1: '3', B1: '=A1*2' })))
  const path = await vault.write(
    `${test.info().project.name}-embed.arx`,
    JSON.stringify({
      version: 1,
      plugins: { 'arxhub.sheets.embed': 1 },
      doc: { type: 'doc', content: [{ type: 'spreadsheet_embed', attrs: { path: source, sheet: '', range: 'A1:B2' } }, { type: 'paragraph' }] },
    }),
  )
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  const preview = app.getByRole('table', { name: 'Embedded spreadsheet', exact: true })
  await expect(preview.getByRole('cell', { name: '6', exact: true })).toBeVisible()
  await app.getByRole('button', { name: 'Open spreadsheet', exact: true }).click()
  await expect(cell(app, 'B1')).toHaveText('6')
})
