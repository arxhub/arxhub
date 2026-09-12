import { validation } from '@arxhub/errors'
import { address, emptySheet, MAX_CELLS, MAX_FILE_BYTES, MAX_INPUT, type Patch, parseSheet, pointOf, type Sheet } from './model'

export interface Worksheet {
  id: string
  name: string
  sheet: Sheet
}
export interface Workbook {
  version: 2
  active: string
  sheets: Worksheet[]
}
export const MAX_SHEETS = 16
export function workbook(sheet = emptySheet()): Workbook {
  return { version: 2, active: 'sheet1', sheets: [{ id: 'sheet1', name: 'Sheet1', sheet }] }
}
export function validSheetName(name: string): boolean {
  return name.length > 0 && name.length <= 31 && name.trim() === name && !/[\\/?*[\]:!']/u.test(name)
}
export function parseWorkbook(raw: string): Workbook {
  if (raw.length > MAX_FILE_BYTES) throw validation('Spreadsheet exceeds 8 MB')
  const value = JSON.parse(raw)
  if (value?.version === 1) return workbook(parseSheet(raw))
  if (
    !value ||
    value.version !== 2 ||
    Object.keys(value).some((key) => !['version', 'active', 'sheets'].includes(key)) ||
    !Array.isArray(value.sheets) ||
    !value.sheets.length ||
    value.sheets.length > MAX_SHEETS
  )
    throw validation('Unsupported spreadsheet or workbook format')
  const ids = new Set<string>(),
    names = new Set<string>()
  let count = 0,
    size = 0
  const sheets: Worksheet[] = value.sheets.map((entry: Worksheet) => {
    if (
      !entry ||
      Object.keys(entry).some((key) => !['id', 'name', 'sheet'].includes(key)) ||
      typeof entry.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(entry.id) ||
      typeof entry.name !== 'string' ||
      !validSheetName(entry.name) ||
      ids.has(entry.id) ||
      names.has(entry.name.toLowerCase())
    )
      throw validation('Invalid or duplicate worksheet')
    ids.add(entry.id)
    names.add(entry.name.toLowerCase())
    const sheet = parseSheet(JSON.stringify(entry.sheet))
    count += Object.keys(sheet.cells).length
    size += Object.values(sheet.cells).reduce((sum, cell) => sum + cell.length, 0)
    return { id: entry.id, name: entry.name, sheet }
  })
  if (!ids.has(value.active) || count > MAX_CELLS || size > 2_000_000) throw validation('Workbook capacity exceeded or active sheet is missing')
  return { version: 2, active: value.active, sheets }
}
export function serializeWorkbook(book: Workbook): string {
  // Keep the original single-sheet envelope until a workbook feature needs the newer format.
  if (
    book.sheets.length === 1 &&
    book.sheets[0].name === 'Sheet1' &&
    !book.sheets[0].sheet.formats &&
    !book.sheets[0].sheet.widths &&
    book.sheets[0].sheet.wrap === undefined &&
    !book.sheets[0].sheet.freeze
  )
    return JSON.stringify(book.sheets[0].sheet)
  return JSON.stringify(book)
}

type Metadata = Omit<Sheet, 'cells'>
interface Delta {
  id: string
  before: Patch
  after: Patch
  oldMeta: Metadata
  newMeta: Metadata
}
interface Change {
  deltas: Delta[]
  before: { id: string; name: string }[]
  after: { id: string; name: string }[]
  activeBefore: string
  activeAfter: string
  size: number
}
export class WorkbookHistory {
  readonly book: Workbook
  private undoStack: Change[] = []
  private redoStack: Change[] = []
  private size = 0
  private count = 0
  private contentSize = 0
  constructor(book: Workbook) {
    this.book = book
    this.measure()
  }
  private measure(): void {
    this.count = 0
    this.contentSize = 0
    for (const entry of this.book.sheets)
      for (const value of Object.values(entry.sheet.cells)) {
        this.count++
        this.contentSize += value.length
      }
  }
  get sheet(): Sheet {
    return this.book.sheets.find((entry) => entry.id === this.book.active)!.sheet
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
    let count = this.count,
      size = this.contentSize
    for (const [key, value] of Object.entries(patch)) {
      const point = pointOf(key)
      if (!point || address(point) !== key || point.row >= this.sheet.rows || point.column >= this.sheet.columns || value.length > MAX_INPUT)
        throw validation('Cell is outside the sheet or exceeds 4096 characters')
      const old = this.sheet.cells[key] ?? ''
      if (old === value) continue
      before[key] = old
      after[key] = value
      count += Number(value !== '') - Number(old !== '')
      size += value.length - old.length
    }
    if (count > MAX_CELLS || size > 2_000_000) throw validation('Workbook capacity exceeded')
    if (!Object.keys(after).length) return null
    const { cells, ...meta } = this.sheet
    const tabs = this.book.sheets.map(({ id, name }) => ({ id, name }))
    const change: Change = {
      deltas: [{ id: this.book.active, before, after, oldMeta: meta, newMeta: meta }],
      before: tabs,
      after: tabs,
      activeBefore: this.book.active,
      activeAfter: this.book.active,
      size: 0,
    }
    change.size =
      JSON.stringify({ before: change.before, after: change.after }).length +
      change.deltas.reduce(
        (size, delta) =>
          size +
          JSON.stringify(delta.before).length +
          JSON.stringify(delta.after).length +
          (delta.oldMeta === delta.newMeta ? 0 : JSON.stringify(delta.oldMeta).length + JSON.stringify(delta.newMeta).length),
        0,
      )
    for (const [key, value] of Object.entries(after)) {
      if (value) cells[key] = value
      else delete cells[key]
    }
    this.count = count
    this.contentSize = size
    this.push(change)
    return after
  }
  private push(change: Change): void {
    this.undoStack.push(change)
    this.redoStack = []
    this.size += change.size
    while (this.undoStack.length > 100 || (this.size > 4_000_000 && this.undoStack.length > 1)) this.size -= this.undoStack.shift()?.size ?? 0
  }
  replace(candidate: Workbook): boolean {
    const next = parseWorkbook(JSON.stringify(candidate))
    const before = this.book.sheets.map(({ id, name }) => ({ id, name })),
      after = next.sheets.map(({ id, name }) => ({ id, name }))
    const deltas: Delta[] = []
    for (const id of new Set([...before, ...after].map((entry) => entry.id))) {
      const old = this.book.sheets.find((entry) => entry.id === id)?.sheet ?? emptySheet()
      const value = next.sheets.find((entry) => entry.id === id)?.sheet ?? emptySheet()
      const { cells: a, ...oldMeta } = old,
        { cells: b, ...newMeta } = value
      const previous: Patch = {},
        following: Patch = {}
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
        if ((a[key] ?? '') !== (b[key] ?? '')) {
          previous[key] = a[key] ?? ''
          following[key] = b[key] ?? ''
        }
      if (Object.keys(previous).length || JSON.stringify(oldMeta) !== JSON.stringify(newMeta))
        deltas.push({ id, before: previous, after: following, oldMeta, newMeta })
    }
    if (!deltas.length && JSON.stringify(before) === JSON.stringify(after)) return false
    const change = { deltas, before, after, activeBefore: this.book.active, activeAfter: next.active, size: 0 }
    change.size =
      JSON.stringify({ before: change.before, after: change.after }).length +
      change.deltas.reduce(
        (size, delta) =>
          size +
          JSON.stringify(delta.before).length +
          JSON.stringify(delta.after).length +
          (delta.oldMeta === delta.newMeta ? 0 : JSON.stringify(delta.oldMeta).length + JSON.stringify(delta.newMeta).length),
        0,
      )
    this.write(change, true)
    this.push(change)
    return true
  }
  undo(): Patch | null {
    const change = this.undoStack.pop()
    if (!change) return null
    this.size -= change.size
    this.redoStack.push(change)
    this.write(change, false)
    return {}
  }
  redo(): Patch | null {
    const change = this.redoStack.pop()
    if (!change) return null
    this.size += change.size
    this.undoStack.push(change)
    this.write(change, true)
    return {}
  }
  private write(change: Change, forward: boolean): void {
    this.book.sheets = (forward ? change.after : change.before).map(({ id, name }) => {
      const old = this.book.sheets.find((entry) => entry.id === id)?.sheet ?? emptySheet()
      const delta = change.deltas.find((item) => item.id === id)
      if (!delta) return { id, name, sheet: old }
      const cells = { ...old.cells }
      for (const [key, value] of Object.entries(forward ? delta.after : delta.before)) {
        if (value) cells[key] = value
        else delete cells[key]
      }
      return { id, name, sheet: { ...(forward ? delta.newMeta : delta.oldMeta), cells } }
    })
    this.book.active = forward ? change.activeAfter : change.activeBefore
    this.measure()
  }
}
