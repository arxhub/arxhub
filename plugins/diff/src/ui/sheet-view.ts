import type { DiffGridCell, DiffSheetGrid } from '../model'

export type GridRow = { kind: 'row'; row: number } | { kind: 'gap'; id: string; first: number; last: number }

// Which rows the grid draws. With "only changed rows" on, row 0 (the header a reader reads columns by) and every
// changed row stay; each run between them is one gap row the reader can open. Off, the whole used range — there
// is no cap, because a cap is exactly the cell a reader was looking for falling off the end.
export function gridRows(grid: DiffSheetGrid, onlyChanged: boolean, expanded: ReadonlySet<string>, scope: string): GridRow[] {
  const rows: GridRow[] = []
  if (!onlyChanged) {
    for (let row = 0; row < grid.rows; row++) rows.push({ kind: 'row', row })
    return rows
  }
  const keep = new Set<number>(grid.changedRows)
  keep.add(0)
  let row = 0
  while (row < grid.rows) {
    if (keep.has(row)) {
      rows.push({ kind: 'row', row })
      row++
      continue
    }
    const first = row
    while (row < grid.rows && !keep.has(row)) row++
    const id = `${scope}:${first}`
    if (expanded.has(id)) for (let open = first; open < row; open++) rows.push({ kind: 'row', row: open })
    else rows.push({ kind: 'gap', id, first, last: row - 1 })
  }
  return rows
}

export function columnName(column: number): string {
  let name = ''
  for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}

export interface PlacedCell {
  address: string
  cell: DiffGridCell
}

// The model keys cells by address as the workbook wrote them; the grid walks rows and columns, so it indexes
// them by position once instead of guessing each address's spelling.
export function cellsByPosition(cells: Readonly<Record<string, DiffGridCell>>): Map<string, PlacedCell> {
  const placed = new Map<string, PlacedCell>()
  for (const [address, cell] of Object.entries(cells)) {
    const match = /^\$?([A-Z]{1,3})\$?([1-9]\d*)$/i.exec(address)
    if (match == null) continue
    let column = 0
    for (const char of match[1].toUpperCase()) column = column * 26 + char.charCodeAt(0) - 64
    placed.set(positionKey(Number(match[2]) - 1, column - 1), { address, cell })
  }
  return placed
}

export function positionKey(row: number, column: number): string {
  return `${row}:${column}`
}

export function nearestStep(value: number, steps: readonly number[]): number {
  let best = steps[0]
  for (const step of steps) if (Math.abs(step - value) < Math.abs(best - value)) best = step
  return best
}
