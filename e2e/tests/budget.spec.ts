import { expect, openType, test } from './fixtures'

const header = '{"type":"budget","version":1}\n'
const storage = 'storage/budget/budget.jsonl'
const fiscalQrPng = Buffer.from(
  [
    'iVBORw0KGgoAAAANSUhEUgAAAUgAAAFIAQMAAAAI2vVwAAAABlBMVEUAAAD///+l2Z/dAAAAAnRSTlP//8i138cAAAAJcEhZcwAACxIAAAsS',
    'AdLdfvwAAAF+SURBVGiB7dXRbsUwCANQ//9PM63YhFTbBHevznalNpz2wUEUMV2wtLS0tHxL5Pq+wfMD96piuZKMljXy58G4keVMMndZRd4q',
    'lh/J/DH8sPyXVOaUYfmp5K6ihwbErzPE8i955sD7jxXLjdRS4Fm7SpYL+VQ4FELfruvCciMZee5xxuoANB0s55I7al/lnUgNbTmXqU9',
    'Fvdta2HIuK3+N2oo/92G5kjVkcwPnebwOwHIic6oqdo3YnAzAfUaWE8l5AB7CtRsRlivZC+0UOCl68pYTGZwMoQ7mlUphuZLK+DyJPA',
    'icl1huJJj0q6T3WK4k0842Rl0F6inLrYQGbaiR1cnROtlyIjUIrjbO+NXllgupNmb/1kyIi1hOJUdBtTH4JcvUW4tbjqQWJFvmfIflQ',
    'irjtqn460AsFzJzP/NBJ5G7lmsJ9S84GFBfLVydbLmRLWX+6xAsP5AZM68qdPyQvOXfUj7U0eeWVcuFVM7t5sn/PGu5kKNlaWlpadn',
    'XFy599ueCl7G7AAAAAElFTkSuQmCC',
  ].join(''),
  'base64',
)
const captureSeed = [
  { type: 'budget', version: 2 },
  { type: 'account', id: 'rub', name: 'Everyday', currency: 'RUB', openingBalance: 100_000 },
  { type: 'category', id: 'food', name: 'Food', kind: 'expense' },
]
  .map((entry) => JSON.stringify(entry))
  .join('\n')

test.describe('budget accounting', () => {
  test.describe.configure({ mode: 'serial' })

  test('records exact income and expenses, persists JSONL and corrects transactions', async ({ app, vault }) => {
    test.setTimeout(60_000)
    await vault.writeData(storage, header)
    await app.reload()
    await openType(app, 'Budget', 'arxhub.budget')
    const page = app.getByTestId('budget-page')

    await page.getByRole('navigation', { name: 'Budget sections' }).getByText('Accounts', { exact: true }).click()
    await page.getByRole('button', { name: 'New account', exact: true }).click()
    let dialog = app.getByRole('dialog', { name: 'New account', exact: true })
    await dialog.getByLabel('Name', { exact: true }).fill('Everyday')
    await dialog.getByLabel('Currency', { exact: true }).fill('RUB')
    await dialog.getByLabel('Opening balance', { exact: true }).fill('1000')
    await dialog.getByRole('button', { name: 'Save account', exact: true }).click()
    await expect(dialog).toBeHidden()

    await page.getByRole('navigation', { name: 'Budget sections' }).getByText('Categories', { exact: true }).click()
    for (const [name, kind] of [
      ['Food', 'Expense'],
      ['Salary', 'Income'],
    ]) {
      await page.getByRole('button', { name: 'New category', exact: true }).click()
      dialog = app.getByRole('dialog', { name: 'New category', exact: true })
      await dialog.getByLabel('Name', { exact: true }).fill(name)
      await dialog.getByLabel('Category type').getByText(kind, { exact: true }).click()
      await dialog.getByRole('button', { name: 'Save category', exact: true }).click()
      await expect(dialog).toBeHidden()
    }

    await page.getByRole('navigation', { name: 'Budget sections' }).getByText('Places', { exact: true }).click()
    await page.getByRole('button', { name: 'New place', exact: true }).click()
    dialog = app.getByRole('dialog', { name: 'New place', exact: true })
    await dialog.getByLabel('Name', { exact: true }).fill('Store')
    await dialog.getByRole('button', { name: 'Save place', exact: true }).click()
    await expect(dialog).toBeHidden()

    await page.getByRole('navigation', { name: 'Budget sections' }).getByText('Overview', { exact: true }).click()
    for (const [kind, amount, note] of [
      ['Expense', '250,50', 'Lunch'],
      ['Income', '2000', 'September pay'],
    ]) {
      await page.getByRole('button', { name: 'New purchase', exact: true }).click()
      dialog = app.getByRole('dialog', { name: 'New transaction', exact: true })
      await dialog.getByRole('button', { name: 'Transaction details', exact: false }).click()
      await dialog.getByLabel('Transaction type').getByText(kind, { exact: true }).click()
      await dialog.getByLabel('Amount', { exact: true }).fill(amount)
      await dialog.getByLabel('Date', { exact: true }).fill('2026-09-19')
      await dialog.getByLabel('Note', { exact: true }).fill(note)
      if (kind === 'Expense') {
        await dialog.getByRole('button', { name: 'Place', exact: true }).click()
        await app.getByRole('menuitem', { name: 'Store', exact: true }).click()
      }
      await dialog.getByRole('button', { name: kind === 'Expense' ? 'Save purchase' : 'Save income', exact: true }).click()
      await expect(dialog).toBeHidden()
    }
    await page.locator('input[type="month"]').fill('2026-09')
    const summary = page.getByTestId('budget-summary')
    await expect(summary).toContainText('2,000.00')
    await expect(summary).toContainText('250.50')
    await expect(summary).toContainText('1,749.50')
    await expect(summary).toContainText('2,749.50')

    const lines: Array<{ type: string; amount?: number }> = (await vault.readData(storage))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(lines[0]).toEqual({ type: 'budget', version: 2 })
    expect(
      lines
        .filter((entry) => entry.type === 'transaction')
        .map((entry) => entry.amount)
        .sort((a, b) => (a ?? 0) - (b ?? 0)),
    ).toEqual([25050, 200000])

    await app.reload()
    await openType(app, 'Budget', 'arxhub.budget')
    await page.getByRole('navigation', { name: 'Budget sections' }).getByText('Accounts', { exact: true }).click()
    await expect(page.getByRole('button', { name: 'Remove Everyday', exact: true })).toBeDisabled()
    await page.getByRole('navigation', { name: 'Budget sections' }).getByText('Transactions', { exact: true }).click()
    await page.locator('input[type="month"]').fill('2026-09')
    await page.getByRole('button', { name: 'Edit Lunch transaction', exact: true }).click()
    dialog = app.getByRole('dialog', { name: 'Edit transaction', exact: true })
    await dialog.getByRole('button', { name: 'Transaction details', exact: false }).click()
    await dialog.getByLabel('Amount', { exact: true }).fill('0')
    await dialog.getByRole('button', { name: 'Save transaction', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('greater than zero')
    await expect(dialog.getByLabel('Note', { exact: true })).toHaveValue('Lunch')
    await dialog.getByLabel('Amount', { exact: true }).fill('275.50')
    await dialog.getByRole('button', { name: 'Save transaction', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId('budget-transactions')).toContainText('275.50')

    await page.getByRole('button', { name: 'Remove Lunch transaction', exact: true }).click()
    dialog = app.getByRole('dialog', { name: 'Remove transaction?', exact: true })
    await dialog.getByRole('button', { name: 'Remove transaction', exact: true }).click()
    await expect(page.getByTestId('budget-transactions')).not.toContainText('Lunch')
    await page.getByRole('navigation', { name: 'Budget sections' }).getByText('Overview', { exact: true }).click()
    await expect(summary).toContainText('3,000.00')
  })

  test('captures a purchase with a place, receipt items, fiscal details, and a photo', async ({ app, vault }) => {
    test.setTimeout(60_000)
    await vault.writeData(storage, `${captureSeed}\n`)
    await app.reload()
    await openType(app, 'Budget', 'arxhub.budget')
    const page = app.getByTestId('budget-page')
    await app.context().grantPermissions(['geolocation'], { origin: new URL(app.url()).origin })
    await app.context().setGeolocation({ latitude: 54.7104, longitude: 20.4522 })

    await page.getByRole('button', { name: 'New purchase', exact: true }).click()
    let dialog = app.getByRole('dialog', { name: 'New transaction', exact: true })
    await expect(dialog.getByLabel('Amount', { exact: true })).toBeFocused()
    await dialog.getByRole('button', { name: 'Add receipt or photo', exact: true }).click()
    await app.evaluate(() => Object.defineProperty(globalThis, 'BarcodeDetector', { configurable: true, value: undefined }))
    await dialog.getByLabel('Scan receipt QR from photo').setInputFiles({
      name: 'budget-fiscal-qr.png',
      mimeType: 'image/png',
      buffer: fiscalQrPng,
    })
    let preview = dialog.getByLabel('Receipt preview')
    await expect(preview).toContainText('123.45')
    await expect(dialog.getByLabel('FN', { exact: true })).toHaveValue('8710000100000001')
    await preview.getByRole('button', { name: 'Get receipt details', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('not configured')
    await expect(preview).toContainText('123.45')
    await dialog.getByLabel('FN', { exact: true }).fill('')
    await expect(preview).toBeHidden()

    const receipt = {
      receipt: {
        dateTime: '2026-09-19T12:34',
        fiscalDriveNumber: '1234567890123456',
        fiscalDocumentNumber: 123,
        fiscalSign: 456,
        totalSum: 1000,
        operationType: 1,
        retailPlace: 'Corner market',
        retailPlaceAddress: 'Market Street 1',
        items: [{ name: 'Bread', quantity: 1, price: 1000, sum: 1000 }],
      },
    }
    await dialog.getByLabel('Import receipt JSON').setInputFiles({
      name: 'receipt.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(receipt)),
    })
    preview = dialog.getByLabel('Receipt preview')
    await expect(preview).toContainText('Corner market')
    await expect(preview).toContainText('Bread')
    await preview.getByRole('button', { name: 'Use receipt', exact: true }).click()

    const fiscalNumber = dialog.getByLabel('FN', { exact: true })
    await fiscalNumber.fill('9')
    await expect(fiscalNumber).toHaveValue('9')
    await fiscalNumber.fill('9999999999999999')
    await dialog.getByRole('button', { name: 'Save purchase', exact: true }).click()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('alert')).toContainText('Review and use the changed fiscal details')
    await expect(dialog.getByRole('status')).toContainText('not applied yet')
    await dialog.getByRole('button', { name: 'Review fiscal details', exact: true }).click()
    preview = dialog.getByLabel('Receipt preview')
    await expect(preview).toContainText('FN 9999999999999999')
    await preview.getByRole('button', { name: 'Use receipt', exact: true }).click()
    await expect(dialog.getByText('These fiscal changes are not applied yet.')).toBeHidden()

    await expect(dialog.getByLabel('Amount', { exact: true })).toHaveValue('10.00')
    await dialog.getByRole('button', { name: 'Transaction details', exact: false }).click()
    await expect(dialog.getByLabel('Note', { exact: true })).toHaveValue('Corner market')
    await dialog.getByLabel('Amount', { exact: true }).fill('12')
    await expect(dialog.getByRole('status')).toContainText('Items add up to')
    await dialog.getByLabel('Amount', { exact: true }).fill('10')

    await expect(dialog.getByLabel('New place name')).toHaveValue('Corner market')
    await dialog.getByRole('button', { name: 'Save place', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Place', exact: true })).toContainText('Corner market')

    await expect(dialog).toContainText('budget-fiscal-qr.png')
    await dialog.getByRole('button', { name: 'Save purchase', exact: true }).click()
    await expect(dialog).toBeHidden()

    const records: Array<Record<string, unknown>> = (await vault.readData(storage))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    const transaction = records.find((entry) => entry.type === 'transaction')
    expect(transaction).toMatchObject({
      kind: 'expense',
      amount: 1000,
      date: '2026-09-19',
      note: 'Corner market',
      items: [{ name: 'Bread', quantity: '1', unitPrice: 1000, total: 1000 }],
      fiscalReceipt: { fn: '9999999999999999', fd: '123', fp: '456', total: 1000, operation: 1 },
    })
    expect(transaction?.placeId).toBeTruthy()
    expect(transaction?.attachments).toEqual([expect.objectContaining({ name: 'budget-fiscal-qr.png', mimeType: 'image/png' })])

    await page.getByRole('button', { name: 'New purchase', exact: true }).click()
    dialog = app.getByRole('dialog', { name: 'New transaction', exact: true })
    await expect(dialog.getByLabel('Amount', { exact: true })).toBeFocused()
    await dialog.getByRole('button', { name: 'Transaction details', exact: false }).click()
    const today = await app.evaluate(() => {
      const value = new Date()
      return `${value.getFullYear().toString().padStart(4, '0')}-${(value.getMonth() + 1).toString().padStart(2, '0')}-${value.getDate().toString().padStart(2, '0')}`
    })
    await expect(dialog.getByRole('button', { name: 'Account', exact: true })).toContainText('Everyday')
    await expect(dialog.getByRole('button', { name: 'Category', exact: true })).toContainText('Food')
    await expect(dialog.getByLabel('Date', { exact: true })).toHaveValue(today)
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()

    await page.getByRole('navigation', { name: 'Budget sections' }).getByText('Places', { exact: true }).click()
    await expect(page).toContainText('Corner market')
    await expect(page.getByRole('button', { name: 'Remove Corner market', exact: true })).toBeDisabled()
  })

  test('an unreadable budget remains intact and can be retried after recovery', async ({ app, vault }) => {
    const broken = `${header}{"type":"transaction"\n`
    await vault.writeData(storage, broken)
    await app.reload()
    await openType(app, 'Budget', 'arxhub.budget')
    const page = app.getByTestId('budget-page')
    await expect(page.getByRole('alert')).toContainText('line 2')
    expect(await vault.readData(storage)).toBe(broken)
    await expect(page.getByRole('button', { name: 'New purchase', exact: true })).toHaveCount(0)
    await vault.writeData(storage, header)
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(page.getByTestId('budget-summary')).toBeVisible()
    await expect(page.getByTestId('budget-summary')).toContainText('No activity in this month')
  })
})
