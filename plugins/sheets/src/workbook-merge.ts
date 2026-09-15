import type { CellFormat } from './format'
import { address, columnName, emptySheet, MAX_INPUT, MAX_ROWS, type Sheet } from './model'
import { MAX_SHEETS, type Workbook, type Worksheet } from './workbook'

export const CONFLICTS_SHEET_NAME = 'Conflicts'
const MAX_SHEET_NAME = 31

export interface WorkbookMergeResult {
  merged: Workbook
  conflicts: number
}

interface ConflictRow {
  sheet: string
  cell: string
  local: string
  remote: string
}

// Key order in a cells record is an accident of who wrote the file last, so structural equality has to
// look past it — JSON.stringify alone would call two identical sheets different.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b)

// The one rule every field below is merged by: a side that changed a value wins over one that did not,
// both changing it the same way is agreement, both changing it differently is a conflict — and in a
// conflict the local value stands, because this device's file is the one being written and its owner is
// the one who will read the log. With no base every value reads as "changed", so two sides holding
// different values conflict and one side holding a value the other lacks is a plain union.
function threeWay<T>(base: T | undefined, local: T | undefined, remote: T | undefined): { value: T | undefined; conflict: boolean } {
  if (same(local, remote)) return { value: local, conflict: false }
  if (same(local, base)) return { value: remote, conflict: false }
  if (same(remote, base)) return { value: local, conflict: false }
  return { value: local, conflict: true }
}

function keysOf(...records: (Record<string, unknown> | undefined)[]): string[] {
  const keys = new Set<string>()
  for (const record of records) for (const key of Object.keys(record ?? {})) keys.add(key)
  return [...keys].sort()
}

const describeFormat = (format: CellFormat | undefined) => (format ? `${format.kind} ${format.decimals} ${format.currency}` : '')

function mergeSheet(name: string, base: Sheet | null, local: Sheet, remote: Sheet, log: ConflictRow[]): { sheet: Sheet; conflicts: number } {
  let conflicts = 0
  // The larger extent on either axis: a cell either side holds is then inside the merged sheet whatever
  // the other side did to its size, which is what keeps the result a valid sheet.
  const sheet: Sheet = { version: 1, rows: Math.max(local.rows, remote.rows), columns: Math.max(local.columns, remote.columns), cells: {} }

  for (const key of keysOf(base?.cells, local.cells, remote.cells)) {
    const { value, conflict } = threeWay(base?.cells[key] ?? '', local.cells[key] ?? '', remote.cells[key] ?? '')
    if (value) sheet.cells[key] = value
    if (conflict) {
      conflicts++
      log.push({ sheet: name, cell: key, local: local.cells[key] ?? '', remote: remote.cells[key] ?? '' })
    }
  }

  const formats: Record<string, CellFormat> = {}
  for (const key of keysOf(base?.formats, local.formats, remote.formats)) {
    const { value, conflict } = threeWay(base?.formats?.[key], local.formats?.[key], remote.formats?.[key])
    if (value) formats[key] = value
    if (conflict) {
      conflicts++
      log.push({
        sheet: name,
        cell: `${key} (format)`,
        local: describeFormat(local.formats?.[key]),
        remote: describeFormat(remote.formats?.[key]),
      })
    }
  }
  if (Object.keys(formats).length) sheet.formats = formats

  const widths: Record<string, number> = {}
  for (const key of keysOf(base?.widths, local.widths, remote.widths)) {
    const { value, conflict } = threeWay(base?.widths?.[key], local.widths?.[key], remote.widths?.[key])
    if (value !== undefined) widths[key] = value
    if (conflict) {
      conflicts++
      log.push({
        sheet: name,
        cell: `${columnName(Number(key))} (width)`,
        local: String(local.widths?.[key] ?? ''),
        remote: String(remote.widths?.[key] ?? ''),
      })
    }
  }
  if (Object.keys(widths).length) sheet.widths = widths

  // View settings are not content: a disagreement here is settled for the local side and not counted.
  const wrap = threeWay(base?.wrap, local.wrap, remote.wrap).value
  if (wrap !== undefined) sheet.wrap = wrap
  const freeze = threeWay(base?.freeze, local.freeze, remote.freeze).value
  if (freeze) sheet.freeze = { ...freeze }

  return { sheet, conflicts }
}

// A cell holds input, and input that starts with `=` is a formula: the log must show what the other
// side wrote, not evaluate it against the wrong sheet — so it is quoted the way a person keeps text as
// text (a leading apostrophe, which the formula reader strips). A value that already starts with one
// gets a second, for the same reason.
function asText(value: string): string {
  const text = value.startsWith('=') || value.startsWith("'") ? `'${value}` : value
  return text.slice(0, MAX_INPUT)
}

function lastUsedRow(sheet: Sheet): number {
  let last = -1
  for (const key of Object.keys(sheet.cells)) {
    const row = Number(/\d+$/.exec(key)?.[0] ?? 0) - 1
    if (row > last) last = row
  }
  return last
}

function appendLog(sheet: Sheet, rows: ConflictRow[], header: boolean): void {
  let row = lastUsedRow(sheet) + 1
  const lines = header
    ? [['Sheet', 'Cell', 'Local', 'Remote'], ...rows.map((it) => [it.sheet, it.cell, it.local, it.remote])]
    : rows.map((it) => [it.sheet, it.cell, it.local, it.remote])
  for (const line of lines) {
    line.forEach((value, column) => {
      const text = asText(value)
      if (text) sheet.cells[address({ row, column })] = text
    })
    row++
  }
  // Grown, never shrunk, and only as far as the format allows — a log that would not fit leaves the
  // sheet invalid, which the registration's own round-trip check turns into a decline.
  sheet.rows = Math.max(sheet.rows, Math.min(MAX_ROWS, row))
  sheet.columns = Math.max(sheet.columns, 4)
}

function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name.toLowerCase())) return name
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`
    const candidate = `${name.slice(0, MAX_SHEET_NAME - suffix.length).trimEnd()}${suffix}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

function uniqueId(stem: string, sheets: readonly Worksheet[]): string {
  const ids = new Set(sheets.map((entry) => entry.id))
  if (!ids.has(stem)) return stem
  for (let n = 2; ; n++) if (!ids.has(`${stem}-${n}`)) return `${stem}-${n}`
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

// Worksheets are matched by id; a sheet present on one side only is kept when it is new or was edited
// since the base, and dropped when the other side deleted it untouched. Within a sheet every keyed value
// (cell, format, width) is merged by `threeWay`; a conflict keeps the local value in place and adds a
// row to a `Conflicts` worksheet — created, or appended to when one exists — so nothing the other device
// wrote is lost, and `conflicts` counts those rows. A workbook already at MAX_SHEETS has no room for that
// worksheet; the rows then go below the active sheet's last row instead, headed the same way, because
// a log the person cannot find is no better than none.
export function mergeWorkbooks(base: Workbook | null, local: Workbook, remote: Workbook): WorkbookMergeResult {
  const baseById = new Map((base?.sheets ?? []).map((entry) => [entry.id, entry] as const))
  const localById = new Map(local.sheets.map((entry) => [entry.id, entry] as const))
  const remoteById = new Map(remote.sheets.map((entry) => [entry.id, entry] as const))

  const log: ConflictRow[] = []
  let conflicts = 0
  const sheets: Worksheet[] = []
  const order = [
    ...local.sheets.map((entry) => entry.id),
    ...remote.sheets.filter((entry) => !localById.has(entry.id)).map((entry) => entry.id),
  ]

  for (const id of order) {
    const b = baseById.get(id) ?? null
    const l = localById.get(id) ?? null
    const r = remoteById.get(id) ?? null
    if (l && r) {
      const name = threeWay(b?.name, l.name, r.name).value ?? l.name
      const result = mergeSheet(name, b?.sheet ?? null, l.sheet, r.sheet, log)
      conflicts += result.conflicts
      sheets.push({ id, name, sheet: result.sheet })
      continue
    }
    const survivor = l ?? r
    if (!survivor) continue
    if (b && same(b, survivor)) continue
    sheets.push(clone(survivor))
  }

  // Two sheets may legitimately arrive with one name (renamed here, added there); the format refuses
  // that, and the local side keeps its name since its file is the one being written.
  const taken = new Set<string>()
  for (const entry of sheets) {
    entry.name = uniqueName(entry.name, taken)
    taken.add(entry.name.toLowerCase())
  }

  const has = (id: string) => sheets.some((entry) => entry.id === id)
  const active = has(local.active) ? local.active : has(remote.active) ? remote.active : sheets[0].id

  if (log.length) {
    const existing = sheets.find((entry) => entry.name.toLowerCase() === CONFLICTS_SHEET_NAME.toLowerCase())
    if (existing) appendLog(existing.sheet, log, Object.keys(existing.sheet.cells).length === 0)
    else if (sheets.length < MAX_SHEETS) {
      const sheet = emptySheet()
      appendLog(sheet, log, true)
      sheets.push({ id: uniqueId('conflicts', sheets), name: CONFLICTS_SHEET_NAME, sheet })
    } else {
      const target = sheets.find((entry) => entry.id === active) ?? sheets[0]
      appendLog(target.sheet, log, true)
    }
  }

  return { merged: { version: 2, active, sheets }, conflicts }
}
