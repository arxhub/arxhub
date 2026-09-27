import type { DiffSheetModel, DiffSheetTab } from '@arxhub/plugin-diff'
import { describe, expect, test } from 'vitest'
import { emptySheet } from '../model'
import { serializeWorkbook, type Workbook, type Worksheet } from '../workbook'
import { diffWorkbookSources, diffWorkbooks } from '../workbook-differ'

const ws = (id: string, name: string, cells: Record<string, string>): Worksheet => ({ id, name, sheet: { ...emptySheet(), cells } })
const book = (sheets: Worksheet[], active = sheets[0]?.id ?? 'sheet1'): Workbook => ({ version: 2, active, sheets })
const tab = (model: DiffSheetModel, id: string): DiffSheetTab => {
  const found = model.tabs.find((entry) => entry.id === id)
  if (!found) throw new TypeError(`no tab ${id}`)
  return found
}

function expectStopInvariant(model: DiffSheetModel): void {
  const total = { added: 0, removed: 0, changed: 0 }
  for (const entry of model.tabs) {
    expect(entry.counts.added + entry.counts.removed + entry.counts.changed).toBe(entry.stops.length)
    entry.stops.forEach((stop, index) => {
      expect(stop.index).toBe(index)
      expect(stop.tabId).toBe(entry.id)
      const address = stop.target.slice(entry.id.length + 1)
      expect(stop.target).toBe(`${entry.id}!${address}`)
      expect(entry.grid.cells[address]?.stop).toBe(index)
      expect(entry.grid.cells[address]?.change).toBe(stop.change)
    })
    const listed = entry.groups.flatMap((group) => group.cells.map((cell) => cell.stop))
    expect(listed).toEqual(entry.stops.map((stop) => stop.index))
    total.added += entry.counts.added
    total.removed += entry.counts.removed
    total.changed += entry.counts.changed
  }
  expect(model.counts).toEqual(total)
}

describe('diffWorkbooks', () => {
  test('every sheet is a tab with its own counts, row-major stops', () => {
    const left = book([ws('a', 'Data', { A1: 'x', B2: '1', A3: 'gone' }), ws('b', 'Other', { A1: 'same' })])
    const right = book([ws('a', 'Data', { A1: 'x', B2: '2', C2: 'new' }), ws('b', 'Other', { A1: 'same' })])
    const model = diffWorkbooks(left, right)
    expect(model.tabs.map((entry) => entry.id)).toEqual(['a', 'b'])
    const data = tab(model, 'a')
    expect(data.status).toBe('changed')
    expect(data.counts).toEqual({ added: 1, removed: 1, changed: 1 })
    expect(data.stops.map((stop) => [stop.target, stop.change])).toEqual([
      ['a!B2', 'changed'],
      ['a!C2', 'added'],
      ['a!A3', 'removed'],
    ])
    expect(data.grid.cells.B2).toEqual({ value: '2', change: 'changed', before: '1', stop: 0 })
    expect(data.grid.cells.A3).toEqual({ value: 'gone', change: 'removed', stop: 2 })
    expect(data.grid.cells.A1).toEqual({ value: 'x' })
    expect(data.grid.changedRows).toEqual([1, 2])
    expect(tab(model, 'b').status).toBe('equal')
    expect(model.identical).toBe(false)
    expectStopInvariant(model)
  })

  test('an empty string and a missing cell are the same cell', () => {
    const model = diffWorkbooks(book([ws('a', 'S', { A1: '' })]), book([ws('a', 'S', {})]))
    expect(model.identical).toBe(true)
    expect(tab(model, 'a').stops).toEqual([])
  })

  test('an added sheet lists every filled cell as added, a removed one as removed', () => {
    const left = book([ws('a', 'Keep', { A1: '1' }), ws('old', 'Old', { A1: 'o1', B1: 'o2' })])
    const right = book([ws('a', 'Keep', { A1: '1' }), ws('new', 'New', { A1: 'n1', A2: 'n2', B2: '' })])
    const model = diffWorkbooks(left, right)
    const added = tab(model, 'new')
    expect(added.status).toBe('added')
    expect(added.filled).toEqual({ before: 0, after: 2 })
    expect(added.stops.map((stop) => stop.change)).toEqual(['added', 'added'])
    const removed = tab(model, 'old')
    expect(removed.status).toBe('removed')
    expect(removed.name).toBe('Old')
    expect(removed.filled).toEqual({ before: 2, after: 0 })
    expect(removed.grid.cells.B1).toEqual({ value: 'o2', change: 'removed', stop: 1 })
    expectStopInvariant(model)
  })

  test('a removed sheet stands before the next left sheet that survives', () => {
    const left = book([ws('a', 'A', {}), ws('gone1', 'G1', {}), ws('gone2', 'G2', {}), ws('c', 'C', {}), ws('tail', 'T', {})])
    const right = book([ws('c', 'C', {}), ws('a', 'A', {}), ws('fresh', 'F', {})])
    const model = diffWorkbooks(left, right)
    expect(model.tabs.map((entry) => entry.id)).toEqual(['gone1', 'gone2', 'c', 'a', 'fresh', 'tail'])
  })

  test('a rename alone is renamed; a rename with edits is changed and keeps the old name', () => {
    const only = diffWorkbooks(book([ws('a', 'Old', { A1: '1' })]), book([ws('a', 'New', { A1: '1' })]))
    expect(tab(only, 'a')).toMatchObject({ status: 'renamed', name: 'New', previousName: 'Old' })
    expect(tab(only, 'a').stops).toEqual([])
    expect(only.identical).toBe(false)

    const both = diffWorkbooks(book([ws('a', 'Old', { A1: '1' })]), book([ws('a', 'New', { A1: '2' })]))
    expect(tab(both, 'a')).toMatchObject({ status: 'changed', previousName: 'Old' })
    expect(tab(both, 'a').counts.changed).toBe(1)
  })

  test('the used range spans both sides with no cap below the sheet limits', () => {
    const left = book([ws('a', 'S', { IV10000: 'far' })])
    const right = book([ws('a', 'S', { A1: 'x' })])
    const data = tab(diffWorkbooks(left, right), 'a')
    expect(data.grid.rows).toBe(10_000)
    expect(data.grid.columns).toBe(256)
    const far = data.groups.find((group) => group.row === 9999)?.cells[0]
    expect(far).toMatchObject({ address: 'IV10000', row: 9999, column: 255, change: 'removed', before: 'far' })
  })

  test('list groups by row, with row context and the header of each column as caption', () => {
    const left = book([ws('a', 'S', { A1: 'Name', B1: 'Price', A2: 'Tea', B2: '10', C2: 'x', D2: 'y' })])
    const right = book([ws('a', 'S', { A1: 'Name', B1: 'Cost', A2: 'Tea', B2: '12', C2: 'z', D2: 'y' })])
    const data = tab(diffWorkbooks(left, right), 'a')
    expect(data.groups.map((group) => group.row)).toEqual([0, 1])
    expect(data.groups[0]).toMatchObject({ context: 'Name · Cost' })
    expect(data.groups[0].cells[0]).toMatchObject({ address: 'B1', caption: null, before: 'Price', after: 'Cost' })
    expect(data.groups[1].context).toBe('Tea · 12')
    expect(data.groups[1].cells.map((cell) => [cell.address, cell.caption])).toEqual([
      ['B2', 'Cost'],
      ['C2', null],
    ])
  })

  test('initialTab is the first tab with changes, else the active sheet of the after side', () => {
    const changed = diffWorkbooks(book([ws('a', 'A', {}), ws('b', 'B', { A1: '1' })]), book([ws('a', 'A', {}), ws('b', 'B', { A1: '2' })]))
    expect(changed.initialTab).toBe('b')
    const renamed = diffWorkbooks(book([ws('a', 'A', {}), ws('b', 'B', {})], 'a'), book([ws('a', 'A2', {}), ws('b', 'B', {})], 'b'))
    expect(renamed.initialTab).toBe('b')
  })

  test('identical workbooks read as identical', () => {
    const same = book([ws('a', 'A', { A1: '1', C3: '=A1' }), ws('b', 'B', {})])
    const model = diffWorkbookSources(serializeWorkbook(same), serializeWorkbook(same))
    expect(model.identical).toBe(true)
    expect(model.counts).toEqual({ added: 0, removed: 0, changed: 0 })
    expect(model.tabs.every((entry) => entry.status === 'equal' && entry.groups.length === 0)).toBe(true)
  })

  test('a restyle with the same values is a change said in words, not a stop', () => {
    const plain = ws('a', 'S', { A1: '1' })
    const wide: Worksheet = { ...plain, sheet: { ...plain.sheet, widths: { A: 200 } } }
    const model = diffWorkbooks(book([plain]), book([wide]))
    expect(model.identical).toBe(false)
    expect(tab(model, 'a').status).toBe('changed')
    expect(tab(model, 'a').note).toBe('formatting changed: column widths')
    expect(tab(model, 'a').stops).toEqual([])
    expectStopInvariant(model)
  })

  test('a reorder of the sheets is a change of the workbook', () => {
    const a = ws('a', 'A', {})
    const b = ws('b', 'B', {})
    const model = diffWorkbooks(book([a, b], 'a'), book([b, a], 'a'))
    expect(model.identical).toBe(false)
    expect(model.note).toBe('sheet order changed')
  })

  test('groups one row at a time, with the first two values of the row as context', () => {
    const model = diffWorkbooks(
      book([ws('a', 'S', { A2: 'k', B2: 'old', C2: 'z' })]),
      book([ws('a', 'S', { A2: 'k', B2: 'new', C2: 'z', A3: 'n' })]),
    )
    expect(tab(model, 'a').groups.map((group) => [group.row, group.context, group.cells.map((cell) => cell.address)])).toEqual([
      [1, 'k · new', ['B2']],
      [2, 'n', ['A3']],
    ])
    expectStopInvariant(model)
  })

  test('an unparsable side throws so the registry can decline to text', () => {
    expect(() => diffWorkbookSources('not json', serializeWorkbook(book([ws('a', 'A', {})])))).toThrow()
  })
})
