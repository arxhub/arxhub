import type { Page } from '@playwright/test'
import { expect, isMobileFrame, openNavigation, test } from './fixtures'

const cell = (page: Page, name: string) => page.getByRole('gridcell', { name, exact: true })
const formula = (page: Page) => page.getByRole('textbox', { name: 'Cell value or formula', exact: true })

async function drag(page: Page, from: string, to: string) {
  const a = await cell(page, from).boundingBox(),
    b = await cell(page, to).boundingBox()
  if (!a || !b) throw new Error('Range endpoints are not visible')
  const start = { x: a.x + a.width / 2, y: a.y + a.height / 2 }
  const end = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  if (await isMobileFrame(page)) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
  } else {
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(end.x, end.y, { steps: 6 })
    await page.mouse.up()
  }
}

test('formula editing picks cells and ranges without committing or changing the edited cell', async ({ app, vault }) => {
  const path = await vault.write(
    `${test.info().project.name}-point.arxs`,
    JSON.stringify({ version: 1, rows: 1000, columns: 26, cells: { A1: '2', B1: '3', A2: '4', B2: '5', C4: 'original' } }),
  )
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  await cell(app, 'C4').click()
  await formula(app).fill('=SUM(')
  await drag(app, 'A1', 'B2')
  await expect(formula(app)).toHaveValue('=SUM(A1:B2')
  await expect(formula(app)).toBeFocused()
  await expect(app.locator('.sheet-address')).toHaveText('C4')
  await expect(app.locator('.sheet-cell.referenced')).toHaveCount(4)
  expect(await vault.read(path)).toContain('"C4":"original"')
  await formula(app).press('End')
  await formula(app).pressSequentially(')+')
  if (await isMobileFrame(app)) await cell(app, 'A1').tap()
  else await cell(app, 'A1').click()
  await expect(formula(app)).toHaveValue('=SUM(A1:B2)+A1')
  await expect(formula(app)).toBeFocused()
  await cell(app, 'B1').click()
  await expect(formula(app)).toHaveValue('=SUM(A1:B2)+B1')
  await formula(app).press('Enter')
  await expect(cell(app, 'C4')).toHaveText('17')
  await app.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => vault.read(path)).toContain('"C4":"=SUM(A1:B2)+B1"')
})

test('a picked reference replaces the token at the caret and Escape cancels the edit', async ({ app, vault }) => {
  const path = await vault.write(
    `${test.info().project.name}-caret.arxs`,
    JSON.stringify({ version: 1, rows: 1000, columns: 26, cells: { A1: '2', A2: '10', B1: '5', C3: '=A1+B1' } }),
  )
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  await cell(app, 'C3').click()
  await formula(app).focus()
  await formula(app).evaluate((input) => {
    ;(input as HTMLInputElement).setSelectionRange(2, 2)
  })
  await cell(app, 'A2').click()
  await expect(formula(app)).toHaveValue('=A2+B1')
  await formula(app).press('Escape')
  await expect(cell(app, 'C3')).toHaveText('7')
  await expect(formula(app)).toHaveValue('=A1+B1')
  await expect(app.locator('.sheet-cell.referenced')).toHaveCount(0)
  expect(await vault.read(path)).toContain('"C3":"=A1+B1"')
})

test('pointing near the viewport edge scrolls through virtual rows', async ({ app, vault }) => {
  const path = await vault.write(
    `${test.info().project.name}-scroll.arxs`,
    JSON.stringify({ version: 1, rows: 1000, columns: 26, cells: { A1: '2' } }),
  )
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  await cell(app, 'B1').click()
  await formula(app).fill('=SUM(')
  const grid = app.getByRole('grid', { name: 'Spreadsheet' })
  const start = await cell(app, 'A1').boundingBox(),
    bounds = await grid.boundingBox()
  if (!start || !bounds) throw new Error('Grid is not visible')
  await app.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await app.mouse.down()
  await app.mouse.move(start.x + start.width / 2, bounds.y + bounds.height - 2)
  await expect.poll(() => grid.evaluate((element) => element.scrollTop)).toBeGreaterThan(96)
  await app.mouse.up()
  await expect(formula(app)).toHaveValue(/^=SUM\(A1:A\d+$/)
  await expect(formula(app)).toBeFocused()
  await formula(app).pressSequentially(')')
  await formula(app).press('Enter')
  await expect(cell(app, 'B1')).toHaveText('2')
})
