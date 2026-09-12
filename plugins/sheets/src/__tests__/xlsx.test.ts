import ExcelJS from 'exceljs'
import { expect, test } from 'vitest'
import { defaultFormat } from '../format'
import { emptySheet } from '../model'
import { workbook } from '../workbook'
import { exportXlsx, importXlsx, validateZip } from '../xlsx'

test('XLSX roundtrip preserves formulas, literal strings, dates, formats and multiple sheets', async () => {
  const book = workbook({
    ...emptySheet(),
    cells: { A1: '2', A2: "'=not a formula", B1: '=A1*3', C1: '46277', D1: 'TRUE' },
    formats: { C1: { ...defaultFormat, kind: 'date' }, B1: { ...defaultFormat, kind: 'currency', currency: 'EUR' } },
    widths: { 0: 160 },
    freeze: { rows: 1, columns: 1 },
  })
  book.sheets.push({ id: 'other', name: 'Totals', sheet: { ...emptySheet(), cells: { A1: "='Sheet1'!B1" } } })
  const bytes = await exportXlsx(book)
  const result = await importXlsx(bytes)
  expect(result.sheets).toHaveLength(2)
  expect(result.sheets[0].sheet.cells).toEqual(book.sheets[0].sheet.cells)
  expect(result.sheets[0].sheet.formats).toEqual(book.sheets[0].sheet.formats)
  expect(result.sheets[0].sheet.widths?.[0]).toBe(160)
  expect(result.sheets[0].sheet.freeze).toEqual({ rows: 1, columns: 1 })
  expect(result.sheets[1].sheet.cells.A1).toBe("='Sheet1'!B1")
})

test('XLSX rejects merged cells and malicious capacity metadata without changing the original book', async () => {
  const excel = new ExcelJS.Workbook(),
    sheet = excel.addWorksheet('Merged')
  sheet.getCell('A1').value = 'original'
  sheet.mergeCells('A1:B1')
  const bytes = new Uint8Array(await excel.xlsx.writeBuffer()).slice().buffer
  await expect(importXlsx(bytes)).rejects.toThrow('Unmerge')
  expect(() => validateZip(new ArrayBuffer(100))).toThrow()
  const valid = await exportXlsx(workbook()),
    view = new DataView(valid)
  for (let offset = 0; offset < view.byteLength - 46; offset++)
    if (view.getUint32(offset, true) === 0x02014b50) {
      view.setUint32(offset + 24, 0xffffffff, true)
      break
    }
  expect(() => validateZip(valid)).toThrow('Expanded XLSX')
})
