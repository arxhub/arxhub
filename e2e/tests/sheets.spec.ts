import type { Page } from '@playwright/test'
import { expect, isMobileFrame, openNavigation, openType, SETTINGS_TYPE, test } from './fixtures'

const spreadsheet = (cells: Record<string, string>, rows = 1000, columns = 26) => JSON.stringify({ version: 1, rows, columns, cells })
const cell = (page: Page, name: string) => page.getByRole('gridcell', { name, exact: true })

async function openSheet(page: Page, path: string) {
  await page.reload()
  await openNavigation(page)
  await page.getByRole('treeitem', { name: path, exact: true }).click()
  await expect(page.getByRole('grid', { name: 'Spreadsheet' })).toBeVisible()
}

async function input(page: Page, name: string, value: string) {
  await cell(page, name).click()
  await page.getByRole('textbox', { name: 'Cell value or formula' }).fill(value)
  await page.getByRole('button', { name: 'Apply cell', exact: true }).click()
}

test('spreadsheet formulas recalculate, undo and survive reopening', async ({ app, vault }) => {
  const path = await vault.write(
    `${test.info().project.name}-formulas.arxs`,
    spreadsheet({ A1: '3', B1: '20', C1: '=A1*B1', A2: '4', B2: '5', C2: '=A2*B2', C3: '=SUM(C1:C2)' }),
  )
  await openSheet(app, path)
  await expect(cell(app, 'C3')).toHaveText('80')
  await input(app, 'A1', '5')
  await expect(cell(app, 'C3')).toHaveText('120')
  await app.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(app, 'C3')).toHaveText('80')
  await app.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(cell(app, 'C3')).toHaveText('120')
  await input(app, 'B2', '=1/0')
  await expect(cell(app, 'C3')).toHaveText('#DIV/0!')
  await input(app, 'B2', '6')
  await expect(cell(app, 'C3')).toHaveText('124')
  await app.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(app.locator('.sheet-status')).toHaveText('Saved')
  await expect.poll(() => vault.read(path)).toContain('"A1":"5"')
  await openSheet(app, path)
  await expect(cell(app, 'C3')).toHaveText('124')
})

test('new spreadsheet is created from the vault menu', async ({ app }) => {
  await openNavigation(app)
  await app.getByRole('button', { name: 'New file', exact: true }).click()
  await app.getByRole('menuitem', { name: 'New spreadsheet', exact: true }).click()
  await expect(app.getByRole('grid', { name: 'Spreadsheet' })).toBeVisible()
  await input(app, 'A1', '=SUM(2,3)')
  await expect(cell(app, 'A1')).toHaveText('5')
  await app.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(app.locator('.sheet-status')).toHaveText('Saved')
})

test('range paste is atomic, shifts formulas, and can be undone', async ({ app, vault }) => {
  const path = await vault.write(`${test.info().project.name}-clipboard.arxs`, spreadsheet({ A1: '3', B1: '=A1*2' }))
  await openSheet(app, path)
  await cell(app, 'A1').click()
  await app.getByRole('grid', { name: 'Spreadsheet' }).press('Shift+ArrowRight')
  const data = await app.getByRole('grid', { name: 'Spreadsheet' }).evaluate((element) => {
    const clipboardData = new DataTransfer()
    element.dispatchEvent(new ClipboardEvent('copy', { clipboardData, bubbles: true, cancelable: true }))
    return { text: clipboardData.getData('text/plain'), internal: clipboardData.getData('application/x-arxhub-sheet') }
  })
  await cell(app, 'A2').click()
  await app.getByRole('grid', { name: 'Spreadsheet' }).evaluate((element, data) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', data.text)
    clipboardData.setData('application/x-arxhub-sheet', data.internal)
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  }, data)
  await expect(cell(app, 'B2')).toHaveText('6')
  await cell(app, 'B2').click()
  await expect(app.getByRole('textbox', { name: 'Cell value or formula' })).toHaveValue('=A2*2')
  await app.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(app, 'A2')).toHaveText('')
  await expect(cell(app, 'B2')).toHaveText('')
})

test('large sheets virtualize both axes and keep touch input above the keyboard', async ({ app, vault }) => {
  const path = await vault.write(
    `${test.info().project.name}-large.arxs`,
    spreadsheet({ A1: '2', B1: '=SUM(A1:A10000)', IV10000: 'Last cell' }, 10000, 256),
  )
  await openSheet(app, path)
  const grid = app.getByRole('grid', { name: 'Spreadsheet' })
  await expect(cell(app, 'B1')).toHaveText('2')
  expect(await grid.getByRole('gridcell').count()).toBeLessThan(1000)
  await grid.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.scrollLeft = element.scrollWidth
  })
  await expect(cell(app, 'IV10000')).toHaveText('Last cell')
  expect(await grid.getByRole('gridcell').count()).toBeLessThan(1000)
  await grid.evaluate((element) => {
    element.scrollTop = 0
    element.scrollLeft = 0
  })
  await expect(cell(app, 'A1')).toHaveText('2')
  if (await isMobileFrame(app)) {
    await cell(app, 'B1').click()
    const input = app.getByRole('textbox', { name: 'Cell value or formula' })
    await input.fill('=A1*3')
    await app.evaluate(() => {
      const viewport = window.visualViewport
      if (!viewport) return
      Object.defineProperty(viewport, 'height', { configurable: true, value: 360 })
      viewport.dispatchEvent(new Event('resize'))
    })
    await expect
      .poll(() => app.locator('.sheet-formula').evaluate((element) => element.getBoundingClientRect().bottom))
      .toBeLessThanOrEqual(360)
    await expect.poll(() => grid.evaluate((element) => element.clientHeight)).toBeGreaterThanOrEqual(96)
    await expect(app.getByRole('button', { name: 'Open documents', exact: true })).toBeHidden()
    expect((await cell(app, 'A1').boundingBox())?.height).toBe(48)
    await app.getByRole('button', { name: 'Cancel cell edit', exact: true }).tap()
    await expect(input).toHaveValue('=SUM(A1:A10000)')
    await expect(cell(app, 'B1')).toHaveText('2')
    await expect(app.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
    await input.fill('=A1*3')
    await app.getByRole('button', { name: 'Apply cell', exact: true }).tap()
    await expect(cell(app, 'B1')).toHaveText('6')
    await expect(grid).toBeFocused()
    await app.evaluate(() => {
      const viewport = window.visualViewport
      if (!viewport) return
      Object.defineProperty(viewport, 'height', { configurable: true, value: window.innerHeight })
      viewport.dispatchEvent(new Event('resize'))
    })
    await expect(app.getByRole('button', { name: 'Open documents', exact: true })).toBeVisible()
  }
  await app.screenshot({ path: test.info().outputPath('spreadsheet.png') })
})

test('unsupported spreadsheet cannot be overwritten', async ({ app, vault }) => {
  const original = '{"version":2,"data":"preserve"}'
  const path = await vault.write(`${test.info().project.name}-unsupported.arxs`, original)
  await app.reload()
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click()
  await expect(app.getByRole('alert')).toContainText('Unsupported spreadsheet')
  await expect(app.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await expect(app.getByRole('textbox', { name: 'Cell value or formula' })).toBeDisabled()
  expect(await vault.read(path)).toBe(original)
})

async function action(page: Page, name: string) {
  await page.getByRole('button', { name: 'Spreadsheet actions', exact: true }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
}

test('CSV, range fill and address navigation work through the visible controls', async ({ app, vault }) => {
  const path = await vault.write(`${test.info().project.name}-tools.arxs`, spreadsheet({}))
  await openSheet(app, path)
  await app
    .getByLabel('Import CSV', { exact: true })
    .setInputFiles({ name: 'budget.csv', mimeType: 'text/csv', buffer: Buffer.from('2,=A1*3\r\n4,\r\n5,') })
  await expect(cell(app, 'B1')).toHaveText('6')
  await cell(app, 'B1').click()
  await action(app, 'Select range')
  await cell(app, 'B3').click()
  await action(app, 'Fill down')
  await expect(cell(app, 'B2')).toHaveText('12')
  await expect(cell(app, 'B3')).toHaveText('15')
  const downloading = app.waitForEvent('download')
  await action(app, 'Export CSV (formulas)')
  const download = await downloading
  expect(download.suggestedFilename()).toContain('tools.csv')
  await action(app, 'Add 1,000 rows')
  await action(app, 'Add column')
  await action(app, 'Go to cell')
  await app.getByRole('textbox', { name: 'Cell address', exact: true }).fill('AA1900')
  await app.getByRole('button', { name: 'Go', exact: true }).click()
  await expect(cell(app, 'AA1900')).toBeVisible()
  await app.getByRole('textbox', { name: 'Cell value or formula' }).fill('=SUM(B1:B3)')
  await app.getByRole('button', { name: 'Apply cell', exact: true }).click()
  await expect(cell(app, 'AA1900')).toHaveText('33')
  await app.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => vault.read(path)).toContain('"AA1900":"=SUM(B1:B3)"')
})

async function closeSheet(page: Page) {
  if (await isMobileFrame(page)) {
    await page.getByRole('button', { name: 'Close document', exact: true }).click()
  } else {
    await page.locator('.tab.active').getByRole('button', { name: 'Close', exact: true }).click()
  }
}

test('failed save refuses closing and retry drains edits made during an in-flight write', async ({ app, vault }) => {
  const path = await vault.write(`${test.info().project.name}-save.arxs`, spreadsheet({ A1: 'original' }))
  await openSheet(app, path)
  let fail = true
  let writeStarted: (() => void) | undefined, releaseWrite: (() => void) | undefined
  let writes = 0
  let rejectedWrites = 0
  await app.route('**/write?**', async (route) => {
    if (!new URL(route.request().url()).searchParams.get('path')?.endsWith(path)) {
      await route.continue()
      return
    }
    if (fail) {
      rejectedWrites++
      await route.fulfill({ status: 500, body: 'Storage unavailable' })
      return
    }
    writes++
    if (writes === 1) {
      writeStarted?.()
      await new Promise<void>((resolve) => {
        releaseWrite = resolve
      })
    }
    await route.continue()
  })
  await input(app, 'A1', 'first edit')
  await app.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(app.locator('.sheet-status')).toHaveText('Save failed')
  await closeSheet(app)
  await expect.poll(() => rejectedWrites).toBeGreaterThanOrEqual(2)
  await expect(app.locator('.sheet-status')).toHaveText('Save failed')
  await expect(app.getByRole('grid', { name: 'Spreadsheet' })).toBeVisible()
  expect(await vault.read(path)).toContain('original')
  fail = false
  const started = new Promise<void>((resolve) => {
    writeStarted = resolve
  })
  await app.getByRole('button', { name: 'Save', exact: true }).click()
  await started
  await input(app, 'A1', 'latest edit')
  releaseWrite?.()
  await expect.poll(() => vault.read(path)).toContain('latest edit')
  await expect(app.locator('.sheet-status')).toHaveText('Saved')
  await closeSheet(app)
  await expect(app.getByRole('grid', { name: 'Spreadsheet' })).toHaveCount(0)
})

test('renaming and switching types retain the spreadsheet buffer and restart calculation', async ({ app, vault }) => {
  const path = await vault.write(`${test.info().project.name}-rename.arxs`, spreadsheet({ A1: '2', B1: '=A1*3' }))
  await openSheet(app, path)
  await input(app, 'A1', '7')
  await expect(cell(app, 'B1')).toHaveText('21')
  await openType(app, 'Settings', SETTINGS_TYPE)
  await openType(app, 'Notes')
  await expect(cell(app, 'B1')).toHaveText('21')
  await openNavigation(app)
  await app.getByRole('treeitem', { name: path, exact: true }).click({ button: 'right' })
  await app.getByRole('menuitem', { name: 'Rename', exact: true }).click()
  const renamed = path.replace('.arxs', '-renamed.arxs')
  // OR-03: '.arxs' is an extension a viewer claims, so the row hides it and the field holds the stem
  // alone — the tail is glued back on at commit, and typing it here would write '….arxs.arxs'.
  await app.getByRole('textbox', { name: 'New name', exact: true }).fill(renamed.replace('.arxs', ''))
  await app.getByRole('textbox', { name: 'New name', exact: true }).press('Enter')
  await app.getByRole('treeitem', { name: renamed, exact: true }).click()
  await expect(cell(app, 'B1')).toHaveText('21')
  await app.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(app, 'B1')).toHaveText('6')
  await app.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(app.locator('.sheet-status')).toHaveText('Saved')
  await expect.poll(() => vault.read(renamed)).toContain('"A1":"2"')
  expect(await vault.read(path).catch(() => null)).toBeNull()
})

test('a failed calculation worker preserves inputs and can be retried', async ({ app, vault }) => {
  const path = await vault.write(`${test.info().project.name}-worker.arxs`, spreadsheet({ A1: '=SUM(2,3)' }))
  const workerUrl = '**/calculation.worker.ts?*'
  await app.route(workerUrl, (route) => route.fulfill({ status: 503, body: 'Worker unavailable' }))
  await openSheet(app, path)
  await expect(app.getByRole('alert')).toContainText('Calculation could not start')
  await input(app, 'A1', '=SUM(3,4)')
  await app.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => vault.read(path)).toContain('=SUM(3,4)')
  await app.unroute(workerUrl)
  await app.getByRole('button', { name: 'Retry calculation', exact: true }).click()
  await expect(cell(app, 'A1')).toHaveText('7')
})

test('autosave catches edits after its debounce expires during a slow write', async ({ app, vault }) => {
  const path = await vault.write(`${test.info().project.name}-autosave.arxs`, spreadsheet({ A1: 'original' }))
  await openSheet(app, path)
  let release: (() => void) | undefined
  let started: (() => void) | undefined
  const writing = new Promise<void>((resolve) => {
    started = resolve
  })
  let writes = 0
  await app.route('**/write?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('path')?.endsWith(path) && ++writes === 1) {
      started?.()
      await new Promise<void>((resolve) => {
        release = resolve
      })
    }
    await route.continue()
  })
  await input(app, 'A1', 'first autosave')
  await writing
  await input(app, 'A1', 'latest autosave')
  // The second debounce must expire while the first write still owns the save path.
  await app.waitForTimeout(1400)
  release?.()
  await expect.poll(() => vault.read(path)).toContain('latest autosave')
  await expect(app.locator('.sheet-status')).toHaveText('Saved')
})
