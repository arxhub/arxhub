import { validation } from '@arxhub/errors'
import type { CellFormat } from './format'

export const MAX_ROWS = 10_000
export const MAX_COLUMNS = 256
export const MAX_CELLS = 50_000
export const MAX_INPUT = 4096
export const MAX_FILE_BYTES = 8 * 1024 * 1024
export const MAX_RANGE = 50_000

export interface Point {
  row: number
  column: number
}
export interface Sheet {
  version: 1
  rows: number
  columns: number
  cells: Record<string, string>
  formats?: Record<string, CellFormat>
  widths?: Record<string, number>
  wrap?: boolean
  freeze?: { rows: number; columns: number }
}
export type Patch = Record<string, string>

export function columnName(column: number): string {
  let name = ''
  for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}

export function address(point: Point): string {
  return `${columnName(point.column)}${point.row + 1}`
}

export function pointOf(value: string): Point | null {
  const match = /^\$?([A-Z]{1,3})\$?([1-9]\d{0,4})$/i.exec(value)
  if (!match) return null
  let column = 0
  for (const char of match[1].toUpperCase()) column = column * 26 + char.charCodeAt(0) - 64
  const row = Number(match[2]) - 1
  return row < MAX_ROWS && column <= MAX_COLUMNS ? { row, column: column - 1 } : null
}

export function emptySheet(): Sheet {
  return { version: 1, rows: 1000, columns: 26, cells: {} }
}

export function parseSheet(raw: string): Sheet {
  if (raw.length > MAX_FILE_BYTES) throw validation('Spreadsheet is too large (8 MB maximum)')
  const value: unknown = JSON.parse(raw)
  if (
    !record(value) ||
    value.version !== 1 ||
    Object.keys(value).some((key) => !['version', 'rows', 'columns', 'cells', 'formats', 'widths', 'wrap', 'freeze'].includes(key))
  ) {
    throw validation('Unsupported spreadsheet format or version')
  }
  const { rows, columns, cells } = value
  if (
    !Number.isInteger(rows) ||
    typeof rows !== 'number' ||
    rows < 1 ||
    rows > MAX_ROWS ||
    !Number.isInteger(columns) ||
    typeof columns !== 'number' ||
    columns < 1 ||
    columns > MAX_COLUMNS ||
    !record(cells)
  ) {
    throw validation('Invalid spreadsheet dimensions or cells')
  }
  if (Object.keys(cells).length > MAX_CELLS) throw validation('A spreadsheet can contain at most 50,000 filled cells')
  const result: Sheet = { version: 1, rows, columns, cells: {} }
  let size = 0
  for (const [key, input] of Object.entries(cells)) {
    const point = pointOf(key)
    if (
      !point ||
      address(point) !== key ||
      point.row >= rows ||
      point.column >= columns ||
      typeof input !== 'string' ||
      input.length > MAX_INPUT
    ) {
      throw validation(`Invalid spreadsheet cell: ${key}`)
    }
    size += input.length
    if (size > 2_000_000) throw validation('Cell contents exceed the 2 million character limit')
    if (input !== '') result.cells[key] = input
  }
  if (value.formats !== undefined) {
    if (!record(value.formats) || Object.keys(value.formats).length > MAX_CELLS) throw validation('Invalid cell formats')
    result.formats = {}
    for (const [key, format] of Object.entries(value.formats)) {
      const point = pointOf(key)
      if (
        !point ||
        address(point) !== key ||
        point.row >= rows ||
        point.column >= columns ||
        !record(format) ||
        Object.keys(format).some((key) => !['kind', 'decimals', 'currency'].includes(key)) ||
        !['general', 'number', 'percent', 'currency', 'date'].includes(String(format.kind)) ||
        typeof format.decimals !== 'number' ||
        !Number.isInteger(format.decimals) ||
        format.decimals < 0 ||
        format.decimals > 10 ||
        typeof format.currency !== 'string' ||
        !/^[A-Z]{3}$/.test(format.currency)
      )
        throw validation('Invalid cell format')
      result.formats[key] = { kind: format.kind as CellFormat['kind'], decimals: format.decimals, currency: format.currency }
    }
  }
  if (value.widths !== undefined) {
    if (!record(value.widths) || Object.keys(value.widths).length > columns) throw validation('Invalid column widths')
    result.widths = {}
    for (const [key, width] of Object.entries(value.widths)) {
      if (
        !/^(0|[1-9]\d*)$/.test(key) ||
        Number(key) >= columns ||
        typeof width !== 'number' ||
        !Number.isInteger(width) ||
        width < 64 ||
        width > 640 ||
        width % 4
      )
        throw validation('Invalid column width')
      result.widths[key] = width
    }
  }
  if (value.wrap !== undefined) {
    if (typeof value.wrap !== 'boolean') throw validation('Invalid text wrap')
    result.wrap = value.wrap
  }
  if (value.freeze !== undefined) {
    if (
      !record(value.freeze) ||
      Object.keys(value.freeze).some((key) => !['rows', 'columns'].includes(key)) ||
      typeof value.freeze.rows !== 'number' ||
      typeof value.freeze.columns !== 'number' ||
      !Number.isInteger(value.freeze.rows) ||
      !Number.isInteger(value.freeze.columns) ||
      value.freeze.rows < 0 ||
      value.freeze.rows > Math.min(3, rows) ||
      value.freeze.columns < 0 ||
      value.freeze.columns > Math.min(2, columns)
    )
      throw validation('Invalid frozen panes')
    result.freeze = { rows: value.freeze.rows, columns: value.freeze.columns }
  }
  return result
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function rangePoints(a: Point, b: Point): Point[] {
  const top = Math.min(a.row, b.row),
    bottom = Math.max(a.row, b.row)
  const left = Math.min(a.column, b.column),
    right = Math.max(a.column, b.column)
  if ((bottom - top + 1) * (right - left + 1) > MAX_RANGE) throw validation('Select at most 50,000 cells at a time')
  const points: Point[] = []
  for (let row = top; row <= bottom; row++) for (let column = left; column <= right; column++) points.push({ row, column })
  return points
}

interface Change {
  before: Patch
  after: Patch
  size: number
}

export class SheetHistory {
  readonly sheet: Sheet
  private undoStack: Change[] = []
  private redoStack: Change[] = []
  private size = 0
  private contentSize: number
  private cellCount: number

  constructor(sheet: Sheet) {
    this.sheet = sheet
    this.contentSize = Object.values(sheet.cells).reduce((sum, text) => sum + text.length, 0)
    this.cellCount = Object.keys(sheet.cells).length
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  apply(patch: Patch): Patch | null {
    const before: Patch = {},
      after: Patch = {}
    let size = this.contentSize,
      count = this.cellCount,
      historySize = 0
    for (const [key, input] of Object.entries(patch)) {
      const point = pointOf(key)
      if (!point || address(point) !== key || point.row >= this.sheet.rows || point.column >= this.sheet.columns || input.length > MAX_INPUT) {
        throw validation(`Cell ${key} is outside the sheet or exceeds 4096 characters`)
      }
      const old = this.sheet.cells[key] ?? ''
      if (old === input) continue
      before[key] = old
      after[key] = input
      size += input.length - old.length
      count += Number(input !== '') - Number(old !== '')
      historySize += old.length + input.length + key.length * 2
    }
    if (size > 2_000_000 || count > MAX_CELLS) throw validation('Spreadsheet capacity exceeded (50,000 filled cells / 2 million characters)')
    if (!Object.keys(after).length) return null
    this.write(after)
    this.redoStack = []
    this.undoStack.push({ before, after, size: historySize })
    this.size += historySize
    while (this.undoStack.length > 100 || (this.size > 4_000_000 && this.undoStack.length > 1)) this.size -= this.undoStack.shift()?.size ?? 0
    return after
  }

  undo(): Patch | null {
    const change = this.undoStack.pop()
    if (!change) return null
    this.size -= change.size
    this.redoStack.push(change)
    this.write(change.before)
    return change.before
  }

  redo(): Patch | null {
    const change = this.redoStack.pop()
    if (!change) return null
    this.undoStack.push(change)
    this.size += change.size
    this.write(change.after)
    return change.after
  }

  private write(patch: Patch): void {
    for (const [key, value] of Object.entries(patch)) {
      const old = this.sheet.cells[key] ?? ''
      this.contentSize += value.length - old.length
      this.cellCount += Number(value !== '') - Number(old !== '')
      if (value === '') delete this.sheet.cells[key]
      else this.sheet.cells[key] = value
    }
  }
}
