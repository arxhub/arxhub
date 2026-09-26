import { describe, expect, test } from 'vitest'
import type { DiffSheetModel, DiffSheetTab } from '../model'
import { countsOf, pluralRu, stopsOf } from '../stops'
import { textDiff } from '../text-differ'

function tab(id: string, changed: number): DiffSheetTab {
  const stops = Array.from({ length: changed }, (_, index) => ({ index, target: `${id}!A${index + 1}`, change: 'changed' as const, tabId: id }))
  return {
    id,
    name: id,
    status: changed > 0 ? 'changed' : 'equal',
    filled: { before: 1, after: 1 },
    grid: { rows: 1, columns: 1, cells: {}, changedRows: [] },
    groups: [],
    stops,
    counts: { added: 0, removed: 0, changed },
  }
}

const workbook: DiffSheetModel = {
  format: 'sheets',
  tabs: [tab('one', 0), tab('two', 2)],
  initialTab: 'two',
  counts: { added: 0, removed: 0, changed: 2 },
  identical: false,
}

describe('stopsOf / countsOf', () => {
  test('a workbook navigates the named tab, or its initial one', () => {
    expect(stopsOf(workbook)).toHaveLength(2)
    expect(stopsOf(workbook, 'one')).toHaveLength(0)
    expect(countsOf(workbook, 'two')).toEqual({ added: 0, removed: 0, changed: 2 })
    expect(stopsOf(workbook, 'missing')).toHaveLength(0)
  })

  test('any other model has one list for the whole file', () => {
    const model = textDiff('a', 'b')
    expect(stopsOf(model, 'ignored')).toBe(model.stops)
    expect(countsOf(model)).toBe(model.counts)
  })
})

describe('pluralRu', () => {
  test.each([
    [1, 'правка'],
    [2, 'правки'],
    [4, 'правки'],
    [5, 'правок'],
    [11, 'правок'],
    [14, 'правок'],
    [21, 'правка'],
    [22, 'правки'],
    [111, 'правок'],
    [0, 'правок'],
  ])('%i → %s', (n, word) => {
    expect(pluralRu(n, 'правка', 'правки', 'правок')).toBe(word)
  })
})
