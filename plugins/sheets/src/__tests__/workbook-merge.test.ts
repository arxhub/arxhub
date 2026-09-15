import { describe, expect, test } from 'vitest'
import { defaultFormat } from '../format'
import { emptySheet, type Sheet } from '../model'
import { MAX_SHEETS, parseWorkbook, serializeWorkbook, type Workbook, type Worksheet, workbook } from '../workbook'
import { CONFLICTS_SHEET_NAME, mergeWorkbooks } from '../workbook-merge'

const sheet = (cells: Record<string, string>, extra: Partial<Omit<Sheet, 'version' | 'cells'>> = {}): Sheet => ({
  ...emptySheet(),
  cells,
  ...extra,
})
const ws = (id: string, name: string, cells: Record<string, string>, extra?: Partial<Omit<Sheet, 'version' | 'cells'>>): Worksheet => ({
  id,
  name,
  sheet: sheet(cells, extra),
})
const book = (sheets: Worksheet[], active = sheets[0]?.id ?? 'sheet1'): Workbook => ({ version: 2, active, sheets })
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

// Everything the merge writes must be a workbook the editor opens — asserted on every result below.
function roundTrips(merged: Workbook): Workbook {
  const reparsed = parseWorkbook(serializeWorkbook(merged))
  expect(reparsed).toEqual(merged)
  return reparsed
}
const conflictsSheet = (merged: Workbook) => merged.sheets.find((entry) => entry.name === CONFLICTS_SHEET_NAME)

describe('mergeWorkbooks — cells', () => {
  test('nothing changed anywhere is the same workbook', () => {
    const base = book([ws('a', 'Data', { A1: '1', B2: '=A1*2' })])
    const { merged, conflicts } = mergeWorkbooks(base, clone(base), clone(base))
    expect(conflicts).toBe(0)
    expect(roundTrips(merged)).toEqual(base)
  })

  test('the side that changed a cell wins over the side that did not', () => {
    const base = book([ws('a', 'Data', { A1: '1', B1: '2' })])
    const local = book([ws('a', 'Data', { A1: '10', B1: '2' })])
    const remote = book([ws('a', 'Data', { A1: '1', B1: '20' })])
    const { merged, conflicts } = mergeWorkbooks(base, local, remote)
    expect(conflicts).toBe(0)
    expect(roundTrips(merged).sheets[0].sheet.cells).toEqual({ A1: '10', B1: '20' })
  })

  test('both sides changing a cell to the same value is not a conflict', () => {
    const base = book([ws('a', 'Data', { A1: '1' })])
    const both = book([ws('a', 'Data', { A1: '7' })])
    const { merged, conflicts } = mergeWorkbooks(base, clone(both), clone(both))
    expect(conflicts).toBe(0)
    expect(roundTrips(merged).sheets[0].sheet.cells).toEqual({ A1: '7' })
  })

  test('a cell deleted on one side and untouched on the other is deleted', () => {
    const base = book([ws('a', 'Data', { A1: '1', B1: '2' })])
    const local = book([ws('a', 'Data', { B1: '2' })])
    const { merged, conflicts } = mergeWorkbooks(base, local, clone(base))
    expect(conflicts).toBe(0)
    expect(roundTrips(merged).sheets[0].sheet.cells).toEqual({ B1: '2' })
  })

  test('a cell changed differently on both sides keeps the local value and records the remote one in a Conflicts worksheet', () => {
    const base = book([ws('a', 'Data', { A1: '1', B1: 'same' })])
    const local = book([ws('a', 'Data', { A1: 'local', B1: 'same' })])
    const remote = book([ws('a', 'Data', { A1: 'remote', B1: 'same' })])
    const { merged, conflicts } = mergeWorkbooks(base, local, remote)
    expect(conflicts).toBe(1)
    const result = roundTrips(merged)
    expect(result.sheets[0].sheet.cells).toEqual({ A1: 'local', B1: 'same' })
    const log = conflictsSheet(result)
    expect(log).toBeDefined()
    expect(log?.sheet.cells).toEqual({
      A1: 'Sheet',
      B1: 'Cell',
      C1: 'Local',
      D1: 'Remote',
      A2: 'Data',
      B2: 'A1',
      C2: 'local',
      D2: 'remote',
    })
    // The active sheet is still the one the person was on, not the log.
    expect(result.active).toBe('a')
  })

  test('a cell deleted on one side and changed on the other is a conflict; the local state stays and the row shows it empty', () => {
    const base = book([ws('a', 'Data', { A1: '1' })])
    const local = book([ws('a', 'Data', {})])
    const remote = book([ws('a', 'Data', { A1: 'remote' })])
    const { merged, conflicts } = mergeWorkbooks(base, local, remote)
    expect(conflicts).toBe(1)
    const result = roundTrips(merged)
    expect(result.sheets[0].sheet.cells).toEqual({})
    expect(conflictsSheet(result)?.sheet.cells).toMatchObject({ A2: 'Data', B2: 'A1', D2: 'remote' })
    expect(conflictsSheet(result)?.sheet.cells.C2).toBeUndefined()
  })

  test('a conflicting formula is logged as text, so the log shows the formula and does not evaluate it', () => {
    const base = book([ws('a', 'Data', { A1: '1' })])
    const local = book([ws('a', 'Data', { A1: '=SUM(B1:B9)' })])
    const remote = book([ws('a', 'Data', { A1: "'quoted" })])
    const { merged } = mergeWorkbooks(base, local, remote)
    expect(conflictsSheet(roundTrips(merged))?.sheet.cells).toMatchObject({ C2: "'=SUM(B1:B9)", D2: "''quoted" })
  })

  test('an existing Conflicts worksheet is appended to below its last row, without a second header', () => {
    const existing = ws('log', CONFLICTS_SHEET_NAME, {
      A1: 'Sheet',
      B1: 'Cell',
      C1: 'Local',
      D1: 'Remote',
      A2: 'Data',
      B2: 'Z9',
      C2: 'x',
      D2: 'y',
    })
    const base = book([ws('a', 'Data', { A1: '1' }), existing])
    const local = book([ws('a', 'Data', { A1: 'L' }), clone(existing)])
    const remote = book([ws('a', 'Data', { A1: 'R' }), clone(existing)])
    const { merged, conflicts } = mergeWorkbooks(base, local, remote)
    expect(conflicts).toBe(1)
    const result = roundTrips(merged)
    expect(result.sheets).toHaveLength(2)
    expect(conflictsSheet(result)?.sheet.cells).toEqual({ ...existing.sheet.cells, A3: 'Data', B3: 'A1', C3: 'L', D3: 'R' })
  })

  test('at the worksheet cap the rows go below the active sheet’s last row instead of into a new worksheet', () => {
    const sheets = Array.from({ length: MAX_SHEETS }, (_, i) => ws(`s${i}`, `Sheet ${i}`, { A1: `${i}` }))
    sheets[0].sheet.cells = { A1: '1', C3: 'last' }
    const base = book(sheets, 's0')
    const local = clone(base)
    local.sheets[0].sheet.cells.A1 = 'L'
    const remote = clone(base)
    remote.sheets[0].sheet.cells.A1 = 'R'
    const { merged, conflicts } = mergeWorkbooks(base, local, remote)
    expect(conflicts).toBe(1)
    const result = roundTrips(merged)
    expect(result.sheets).toHaveLength(MAX_SHEETS)
    expect(conflictsSheet(result)).toBeUndefined()
    expect(result.sheets[0].sheet.cells).toEqual({
      A1: 'L',
      C3: 'last',
      A4: 'Sheet',
      B4: 'Cell',
      C4: 'Local',
      D4: 'Remote',
      A5: 'Sheet 0',
      B5: 'A1',
      C5: 'L',
      D5: 'R',
    })
  })
})

describe('mergeWorkbooks — formats, widths, dimensions, view', () => {
  test('formats and widths merge per key, and a conflict keeps the local one, counts, and is logged', () => {
    const percent = { ...defaultFormat, kind: 'percent' as const }
    const number = { ...defaultFormat, kind: 'number' as const, decimals: 2 }
    const base = book([ws('a', 'Data', { A1: '1' }, { formats: { A1: defaultFormat }, widths: { 0: 96 } })])
    const local = book([ws('a', 'Data', { A1: '1' }, { formats: { A1: percent, B1: number }, widths: { 0: 112, 1: 160 } })])
    const remote = book([ws('a', 'Data', { A1: '1' }, { formats: { A1: number }, widths: { 0: 128, 1: 160 } })])
    const { merged, conflicts } = mergeWorkbooks(base, local, remote)
    expect(conflicts).toBe(2)
    const result = roundTrips(merged)
    expect(result.sheets[0].sheet.formats).toEqual({ A1: percent, B1: number })
    expect(result.sheets[0].sheet.widths).toEqual({ 0: 112, 1: 160 })
    expect(conflictsSheet(result)?.sheet.cells).toMatchObject({ B2: 'A1 (format)', B3: 'A (width)', C3: '112', D3: '128' })
  })

  test('rows and columns take the larger value', () => {
    const base = book([ws('a', 'Data', {})])
    const local = book([ws('a', 'Data', {}, { rows: 2000 })])
    const remote = book([ws('a', 'Data', {}, { columns: 40 })])
    const { merged } = mergeWorkbooks(base, local, remote)
    expect(roundTrips(merged).sheets[0].sheet).toMatchObject({ rows: 2000, columns: 40 })
  })

  test('wrap and freeze follow the side that changed them, and local wins when both did', () => {
    const base = book([ws('a', 'Data', {}, { wrap: false, freeze: { rows: 0, columns: 0 } })])
    const local = book([ws('a', 'Data', {}, { wrap: false, freeze: { rows: 1, columns: 0 } })])
    const remote = book([ws('a', 'Data', {}, { wrap: true, freeze: { rows: 2, columns: 1 } })])
    const { merged, conflicts } = mergeWorkbooks(base, local, remote)
    expect(conflicts).toBe(0)
    expect(roundTrips(merged).sheets[0].sheet).toMatchObject({ wrap: true, freeze: { rows: 1, columns: 0 } })
  })

  test('a sheet with no formats, widths, wrap or freeze does not gain empty ones', () => {
    const base = book([ws('a', 'Data', { A1: '1' })])
    const { merged } = mergeWorkbooks(base, clone(base), clone(base))
    expect(Object.keys(merged.sheets[0].sheet).sort()).toEqual(['cells', 'columns', 'rows', 'version'])
  })
})

describe('mergeWorkbooks — worksheets', () => {
  test('a worksheet added on one side is kept, and both sides adding different ones keeps both, local first', () => {
    const base = book([ws('a', 'Data', {})])
    const local = book([ws('a', 'Data', {}), ws('l', 'Local', { A1: 'l' })])
    const remote = book([ws('r', 'Remote', { A1: 'r' }), ws('a', 'Data', {})])
    const { merged, conflicts } = mergeWorkbooks(base, local, remote)
    expect(conflicts).toBe(0)
    expect(roundTrips(merged).sheets.map((entry) => entry.id)).toEqual(['a', 'l', 'r'])
  })

  test('a worksheet deleted on one side and untouched on the other is deleted', () => {
    const base = book([ws('a', 'Data', { A1: '1' }), ws('b', 'Old', { A1: 'x' })])
    const local = book([ws('a', 'Data', { A1: '1' })])
    const { merged } = mergeWorkbooks(base, local, clone(base))
    expect(roundTrips(merged).sheets.map((entry) => entry.id)).toEqual(['a'])
    const other = mergeWorkbooks(base, clone(base), local)
    expect(roundTrips(other.merged).sheets.map((entry) => entry.id)).toEqual(['a'])
  })

  test('a worksheet deleted on one side and edited on the other keeps the edited one', () => {
    const base = book([ws('a', 'Data', { A1: '1' }), ws('b', 'Kept', { A1: 'x' })])
    const local = book([ws('a', 'Data', { A1: '1' })])
    const remote = book([ws('a', 'Data', { A1: '1' }), ws('b', 'Kept', { A1: 'edited' })])
    const { merged } = mergeWorkbooks(base, local, remote)
    const result = roundTrips(merged)
    expect(result.sheets.map((entry) => entry.id)).toEqual(['a', 'b'])
    expect(result.sheets[1].sheet.cells).toEqual({ A1: 'edited' })
  })

  test('a rename follows the side that renamed, and a clash with another worksheet’s name is suffixed', () => {
    const base = book([ws('a', 'Data', {})])
    const local = book([ws('a', 'Budget', {})])
    const remote = book([ws('a', 'Data', {}), ws('r', 'Budget', {})])
    const { merged } = mergeWorkbooks(base, local, remote)
    expect(roundTrips(merged).sheets.map((entry) => entry.name)).toEqual(['Budget', 'Budget (2)'])
  })

  test('the active worksheet is the local one when it survives, the remote one otherwise', () => {
    const base = book([ws('a', 'Data', {}), ws('b', 'Other', {})], 'a')
    const local = book([ws('a', 'Data', {}), ws('b', 'Other', {})], 'b')
    const remote = book([ws('a', 'Data', {}), ws('b', 'Other', {})], 'a')
    expect(mergeWorkbooks(base, local, remote).merged.active).toBe('b')

    const localDeletedActive = book([ws('a', 'Data', {})], 'a')
    const remoteOnB = book([ws('a', 'Data', {}), ws('b', 'Other', {})], 'b')
    expect(mergeWorkbooks(base, localDeletedActive, remoteOnB).merged.active).toBe('a')
    const remoteDeletedItsActive = book([ws('b', 'Other', {})], 'b')
    const localOnA = book([ws('a', 'Data', { A1: 'x' }), ws('b', 'Other', {})], 'a')
    // Local's active sheet is gone on the remote side but edited locally, so it survives and stays active.
    expect(mergeWorkbooks(base, localOnA, remoteDeletedItsActive).merged.active).toBe('a')
  })
})

describe('mergeWorkbooks — no common ancestor', () => {
  test('is a union per key, with a conflict wherever both sides hold a different value', () => {
    const local = book([ws('a', 'Data', { A1: 'l', B1: 'both' })])
    const remote = book([ws('a', 'Data', { A2: 'r', B1: 'other' })])
    const { merged, conflicts } = mergeWorkbooks(null, local, remote)
    expect(conflicts).toBe(1)
    const result = roundTrips(merged)
    expect(result.sheets[0].sheet.cells).toEqual({ A1: 'l', A2: 'r', B1: 'both' })
    expect(conflictsSheet(result)?.sheet.cells).toMatchObject({ B2: 'B1', C2: 'both', D2: 'other' })
  })
})

describe('mergeWorkbooks — envelope', () => {
  test('a v1 single-sheet file in, merged cleanly, is a v1 single-sheet file out', () => {
    const base = parseWorkbook(JSON.stringify({ ...emptySheet(), cells: { A1: '1', B1: '2' } }))
    const local = parseWorkbook(JSON.stringify({ ...emptySheet(), cells: { A1: '10', B1: '2' } }))
    const remote = parseWorkbook(JSON.stringify({ ...emptySheet(), cells: { A1: '1', B1: '20' } }))
    const { merged, conflicts } = mergeWorkbooks(base, local, remote)
    expect(conflicts).toBe(0)
    expect(roundTrips(merged)).toEqual(workbook(sheet({ A1: '10', B1: '20' })))
    expect(JSON.parse(serializeWorkbook(merged))).toEqual({ ...emptySheet(), cells: { A1: '10', B1: '20' } })
  })

  test('a v1 file whose merge needed a Conflicts worksheet comes out as a v2 workbook', () => {
    const base = parseWorkbook(JSON.stringify({ ...emptySheet(), cells: { A1: '1' } }))
    const local = parseWorkbook(JSON.stringify({ ...emptySheet(), cells: { A1: 'L' } }))
    const remote = parseWorkbook(JSON.stringify({ ...emptySheet(), cells: { A1: 'R' } }))
    const { merged, conflicts } = mergeWorkbooks(base, local, remote)
    expect(conflicts).toBe(1)
    const serialized = JSON.parse(serializeWorkbook(merged))
    expect(serialized.version).toBe(2)
    expect(serialized.sheets.map((entry: Worksheet) => entry.name)).toEqual(['Sheet1', CONFLICTS_SHEET_NAME])
    roundTrips(merged)
  })
})
