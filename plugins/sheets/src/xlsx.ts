import { validation } from '@arxhub/errors'
import ExcelJS from 'exceljs'
import { type CellFormat, DATE_EPOCH, defaultFormat } from './format'
import { emptySheet, MAX_CELLS, MAX_COLUMNS, MAX_FILE_BYTES, MAX_INPUT, MAX_ROWS, type Sheet } from './model'
import { MAX_SHEETS, parseWorkbook, type Workbook } from './workbook'

export function validateZip(bytes: ArrayBuffer): void {
  if (bytes.byteLength > MAX_FILE_BYTES || bytes.byteLength < 22) throw validation('XLSX must be an unencrypted ZIP file under 8 MB')
  const view = new DataView(bytes)
  let end = bytes.byteLength - 22
  while (end >= Math.max(0, bytes.byteLength - 65_557) && view.getUint32(end, true) !== 0x06054b50) end--
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50) throw validation('Invalid XLSX archive')
  const count = view.getUint16(end + 10, true),
    start = view.getUint32(end + 16, true)
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || count > 2048 || count < 1 || start >= end)
    throw validation('Unsupported XLSX archive')
  let offset = start,
    size = 0
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50 || view.getUint16(offset + 8, true) & 1)
      throw validation('Invalid or encrypted XLSX archive')
    size += view.getUint32(offset + 24, true)
    if (size > 32 * 1024 * 1024) throw validation('Expanded XLSX exceeds 32 MB')
    const nameLength = view.getUint16(offset + 28, true)
    const name = new TextDecoder().decode(new Uint8Array(bytes, offset + 46, nameLength))
    if (/vbaProject|externalLinks\//i.test(name)) throw validation('Macros and external workbook links are not supported')
    offset += 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
  }
  if (offset > end) throw validation('Invalid XLSX directory')
}
function numberFormat(format: CellFormat): string {
  const decimal = format.decimals ? `.${'0'.repeat(format.decimals)}` : ''
  if (format.kind === 'date') return 'yyyy-mm-dd'
  if (format.kind === 'currency') return `"${format.currency}" #,##0${decimal}`
  if (format.kind === 'percent') return `0${decimal}%`
  if (format.kind === 'number') return `#,##0${decimal}`
  return 'General'
}
function readFormat(format: string): CellFormat | undefined {
  if (!format || format === 'General' || format === '@') return undefined
  const clean = format.replace(/"[^"]*"|\[[^\]]*\]/g, '')
  const decimals = Math.min(10, /\.([0#]+)/.exec(clean)?.[1].length ?? 0)
  if (/[dy]/i.test(clean)) return { ...defaultFormat, kind: 'date' }
  if (clean.includes('%')) return { ...defaultFormat, kind: 'percent', decimals }
  const currency =
    /"([A-Z]{3})"/.exec(format)?.[1] ?? (format.includes('$') ? 'USD' : format.includes('€') ? 'EUR' : format.includes('₽') ? 'RUB' : undefined)
  if (currency) return { kind: 'currency', currency, decimals }
  if (/[0#]/.test(clean)) return { ...defaultFormat, kind: 'number', decimals }
  return undefined
}
export async function importXlsx(bytes: ArrayBuffer): Promise<Workbook> {
  validateZip(bytes)
  const source = new ExcelJS.Workbook()
  // ExcelJS accepts ArrayBuffer in browsers; its Buffer declaration predates that supported input.
  await source.xlsx.load(bytes as Parameters<typeof source.xlsx.load>[0])
  if (!source.worksheets.length || source.worksheets.length > MAX_SHEETS) throw validation('XLSX must contain 1–16 sheets')
  let count = 0,
    size = 0
  const sheets = source.worksheets.map((worksheet, index) => {
    if (worksheet.rowCount > MAX_ROWS || worksheet.columnCount > MAX_COLUMNS) throw validation('XLSX exceeds 10,000 rows or 256 columns')
    if (worksheet.model.merges?.length) throw validation('Unmerge XLSX cells before importing')
    const sheet: Sheet = {
      ...emptySheet(),
      rows: Math.max(1000, worksheet.rowCount),
      columns: Math.max(26, worksheet.columnCount),
      formats: {},
      widths: {},
    }
    worksheet.eachRow((row) =>
      row.eachCell({ includeEmpty: true }, (cell) => {
        const value = cell.value
        let raw = ''
        if (cell.formula) raw = `=${cell.formula}`
        else if (value instanceof Date) {
          raw = String((value.getTime() - DATE_EPOCH) / 86_400_000)
          sheet.formats![cell.address] = { ...defaultFormat, kind: 'date' }
        } else if (typeof value === 'string') raw = `'${value}`
        else if (typeof value === 'number') raw = String(value)
        else if (typeof value === 'boolean') raw = value ? 'TRUE' : 'FALSE'
        else if (value && typeof value === 'object') {
          if ('richText' in value) raw = `'${value.richText.map((part) => part.text).join('')}`
          else if ('text' in value) raw = `'${value.text}`
          else if ('error' in value) raw = `=${value.error}`
        }
        if (raw.length > MAX_INPUT) throw validation('An XLSX cell exceeds 4096 characters')
        if (raw) {
          sheet.cells[cell.address] = raw
          count++
          size += raw.length
        }
        if (count > MAX_CELLS || size > 2_000_000) throw validation('XLSX exceeds workbook capacity')
        const format = readFormat(cell.numFmt)
        if (format) sheet.formats![cell.address] = format
        if (cell.alignment?.wrapText) sheet.wrap = true
      }),
    )
    const columns = worksheet.columns ?? []
    columns.forEach((column, index) => {
      if (column.width) sheet.widths![index] = Math.min(640, Math.max(64, Math.round((column.width * 7 + 5) / 4) * 4))
    })
    const view = (worksheet.views ?? []).find((view) => view.state === 'frozen')
    if (view?.state === 'frozen') sheet.freeze = { rows: Math.min(3, view.ySplit ?? 0), columns: Math.min(2, view.xSplit ?? 0) }
    return { id: `sheet${index + 1}`, name: worksheet.name, sheet }
  })
  return parseWorkbook(JSON.stringify({ version: 2, active: sheets[0].id, sheets }))
}
export async function exportXlsx(book: Workbook): Promise<ArrayBuffer> {
  const output = new ExcelJS.Workbook()
  output.calcProperties.fullCalcOnLoad = true
  for (const { name, sheet } of book.sheets) {
    const worksheet = output.addWorksheet(name)
    for (const [key, raw] of Object.entries(sheet.cells)) {
      const cell = worksheet.getCell(key)
      if (raw.startsWith('=')) cell.value = { formula: raw.slice(1) }
      else if (raw.startsWith("'")) cell.value = raw.slice(1)
      else if (/^(TRUE|FALSE)$/i.test(raw)) cell.value = raw.toUpperCase() === 'TRUE'
      else if (raw.trim() && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim()) && Number.isFinite(Number(raw)))
        cell.value = Number(raw)
      else cell.value = raw
      if (sheet.wrap) cell.alignment = { wrapText: true }
    }
    for (const [key, format] of Object.entries(sheet.formats ?? {})) worksheet.getCell(key).numFmt = numberFormat(format)
    for (const [column, width] of Object.entries(sheet.widths ?? {})) worksheet.getColumn(Number(column) + 1).width = (width - 5) / 7
    if (sheet.freeze) worksheet.views = [{ state: 'frozen', xSplit: sheet.freeze.columns, ySplit: sheet.freeze.rows }]
  }
  const bytes = new Uint8Array(await output.xlsx.writeBuffer())
  if (bytes.byteLength > MAX_FILE_BYTES) throw validation('Exported XLSX exceeds 8 MB')
  return bytes.slice().buffer
}
