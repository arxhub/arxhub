import type {
  DiffCellChange,
  DiffCellGroup,
  DiffCounts,
  DiffGridCell,
  DiffSheetModel,
  DiffSheetTab,
  DiffStop,
  SheetStatus,
} from '@arxhub/plugin-diff'
import { pointOf } from './model'
import { parseWorkbook, type Workbook, type Worksheet } from './workbook'

type CellMap = Readonly<Record<string, string>>

interface Located {
  address: string
  row: number
  column: number
}

// A parse failure propagates on purpose: the registry logs it and hands the file to the text differ.
export function diffWorkbookSources(left: string, right: string): DiffSheetModel {
  return diffWorkbooks(parseWorkbook(left), parseWorkbook(right))
}

// Stops are cell VALUES only: a reader reviewing a change asks what the numbers became, and a restyle drawn as a
// changed cell would bury the edits among tint. A restyle is still a change of the file, so it is said in words
// (a tab's note, the model's note) and never lets the view call the versions identical.
export function diffWorkbooks(left: Workbook, right: Workbook): DiffSheetModel {
  const tabs = orderedPairs(left, right).map(([before, after]) => diffSheet(before, after))
  const counts = tabs.reduce<DiffCounts>(
    (sum, tab) => ({
      added: sum.added + tab.counts.added,
      removed: sum.removed + tab.counts.removed,
      changed: sum.changed + tab.counts.changed,
    }),
    { added: 0, removed: 0, changed: 0 },
  )
  const initialTab = tabs.find((tab) => tab.stops.length > 0)?.id ?? right.active
  const notes: string[] = []
  const survivors = (book: Workbook, other: Workbook) =>
    book.sheets.filter((sheet) => other.sheets.some((it) => it.id === sheet.id)).map((sheet) => sheet.id)
  if (survivors(left, right).join('\n') !== survivors(right, left).join('\n')) notes.push('изменён порядок листов')
  if (left.active !== right.active) notes.push('изменён активный лист')
  const model: DiffSheetModel = {
    format: 'sheets',
    tabs,
    initialTab,
    counts,
    identical: notes.length === 0 && tabs.every((tab) => tab.status === 'equal'),
  }
  if (notes.length) model.note = notes.join(' · ')
  return model
}

// After-side order; a removed sheet goes where it stood: before the next left sheet that survives.
function orderedPairs(left: Workbook, right: Workbook): [Worksheet | undefined, Worksheet | undefined][] {
  const leftById = new Map(left.sheets.map((sheet) => [sheet.id, sheet]))
  const rightIds = new Set(right.sheets.map((sheet) => sheet.id))
  const pairs: [Worksheet | undefined, Worksheet | undefined][] = right.sheets.map((sheet) => [leftById.get(sheet.id), sheet])
  let pending: Worksheet[] = []
  const flush = (at: number) => {
    if (!pending.length) return
    pairs.splice(at, 0, ...pending.map((sheet): [Worksheet, undefined] => [sheet, undefined]))
    pending = []
  }
  for (const sheet of left.sheets) {
    if (!rightIds.has(sheet.id)) {
      pending.push(sheet)
      continue
    }
    flush(pairs.findIndex(([, after]) => after?.id === sheet.id))
  }
  flush(pairs.length)
  return pairs
}

function diffSheet(before: Worksheet | undefined, after: Worksheet | undefined): DiffSheetTab {
  const sheet = (after ?? before) as Worksheet
  const id = sheet.id
  const beforeCells: CellMap = before?.sheet.cells ?? {}
  const afterCells: CellMap = after?.sheet.cells ?? {}

  const located: Located[] = []
  for (const key of new Set([...Object.keys(beforeCells), ...Object.keys(afterCells)])) {
    const point = pointOf(key)
    if (point) located.push({ address: key, row: point.row, column: point.column })
  }
  located.sort((a, b) => a.row - b.row || a.column - b.column)

  const headers = new Map<number, string>()
  for (const cell of located) {
    if (cell.row !== 0) continue
    const text = nonEmpty(afterCells[cell.address]) ?? nonEmpty(beforeCells[cell.address])
    if (text != null) headers.set(cell.column, text)
  }

  let rows = 0
  let columns = 0
  const cells: Record<string, DiffGridCell> = {}
  const changes: DiffCellChange[] = []
  const stops: DiffStop[] = []
  for (const cell of located) {
    rows = Math.max(rows, cell.row + 1)
    columns = Math.max(columns, cell.column + 1)
    const was = beforeCells[cell.address]
    const now = afterCells[cell.address]
    const change = cellChange(was, now)
    if (!change) {
      if (now != null && now !== '') cells[cell.address] = { value: now }
      continue
    }
    const stop = stops.length
    stops.push({ index: stop, target: `${id}!${cell.address}`, change, tabId: id })
    cells[cell.address] =
      change === 'removed'
        ? { value: was ?? '', change, stop }
        : change === 'added'
          ? { value: now ?? '', change, stop }
          : { value: now ?? '', change, before: was ?? '', stop }
    changes.push({
      address: cell.address,
      row: cell.row,
      column: cell.column,
      change,
      ...(was != null && was !== '' ? { before: was } : {}),
      ...(now != null && now !== '' ? { after: now } : {}),
      caption: cell.row === 0 ? null : (headers.get(cell.column) ?? null),
      stop,
    })
  }

  // `located` and `changes` are both row-major, so each row's context and group come out of one pass apiece —
  // a filter per changed row is quadratic on an added sheet at the cell cap.
  const contexts = rowContexts(located, afterCells, beforeCells)
  const groups: DiffCellGroup[] = []
  for (const change of changes) {
    const last = groups.at(-1)
    if (last?.row === change.row) last.cells.push(change)
    else groups.push({ row: change.row, context: contexts.get(change.row) ?? '', cells: [change] })
  }
  const changedRows = groups.map((group) => group.row)

  const counts: DiffCounts = { added: 0, removed: 0, changed: 0 }
  for (const stop of stops) counts[stop.change === 'moved' ? 'changed' : stop.change] += 1

  const renamed = before != null && after != null && before.name !== after.name
  const styled = before != null && after != null ? layoutChanges(before, after) : []
  const status: SheetStatus = !before ? 'added' : !after ? 'removed' : stops.length || styled.length ? 'changed' : renamed ? 'renamed' : 'equal'

  return {
    id,
    name: sheet.name,
    ...(renamed ? { previousName: before.name } : {}),
    status,
    filled: { before: filledCount(beforeCells), after: filledCount(afterCells) },
    grid: { rows, columns, cells, changedRows },
    groups,
    stops,
    counts,
    ...(styled.length ? { note: `изменено оформление: ${styled.join(', ')}` } : {}),
  }
}

function layoutChanges(before: Worksheet, after: Worksheet): string[] {
  const a = before.sheet
  const b = after.sheet
  const differs = (x: unknown, y: unknown) => JSON.stringify(x ?? null) !== JSON.stringify(y ?? null)
  const out: string[] = []
  if (differs(a.formats, b.formats)) out.push('форматы ячеек')
  if (differs(a.widths, b.widths)) out.push('ширина столбцов')
  if (differs(a.wrap, b.wrap)) out.push('перенос текста')
  if (differs(a.freeze, b.freeze)) out.push('закрепление')
  if (a.rows !== b.rows || a.columns !== b.columns) out.push('размер листа')
  return out
}

// An empty string and an absent key are the same cell to a reader: both draw nothing.
function cellChange(was: string | undefined, now: string | undefined): 'added' | 'removed' | 'changed' | null {
  const a = nonEmpty(was)
  const b = nonEmpty(now)
  if (a === b) return null
  if (a == null) return 'added'
  if (b == null) return 'removed'
  return 'changed'
}

// The first two filled values of every row, for the row headers of the list view.
function rowContexts(located: readonly Located[], afterCells: CellMap, beforeCells: CellMap): Map<number, string> {
  const values = new Map<number, string[]>()
  for (const cell of located) {
    const row = values.get(cell.row) ?? []
    if (row.length === 2) continue
    const text = nonEmpty(afterCells[cell.address]) ?? nonEmpty(beforeCells[cell.address])
    if (text != null) row.push(text)
    values.set(cell.row, row)
  }
  return new Map([...values].map(([row, texts]) => [row, texts.join(' · ')]))
}

function nonEmpty(value: string | undefined): string | null {
  return value == null || value === '' ? null : value
}

function filledCount(cells: CellMap): number {
  let count = 0
  for (const value of Object.values(cells)) if (value !== '') count += 1
  return count
}
