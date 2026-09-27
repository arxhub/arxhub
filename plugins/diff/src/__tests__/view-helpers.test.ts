import { describe, expect, test } from 'vitest'
import type { DiffBlock, DiffContainer, DiffSheetGrid } from '../model'
import { foldUnitOf, hiddenTargets, noteFor, segmentsFor, stopHere, stopTargets, visibleOn } from '../ui/block-view'
import { cellsByPosition, columnName, gridRows, nearestStep, positionKey } from '../ui/sheet-view'

function block(id: string, change: DiffBlock['change'], extra: Partial<DiffBlock> = {}): DiffBlock {
  return { kind: 'block', id, change, role: 'paragraph', segments: [{ kind: 'equal', text: id }], ...extra }
}

describe('block columns', () => {
  const moved = block('n3', 'moved', { stop: 0, move: { direction: 'up', distance: 3 }, note: 'перемещён выше на 3 блока' })
  const ghost = block('g5', 'moved', { ghost: true, move: { direction: 'up', distance: 3 }, note: 'был здесь · перемещён выше' })

  test('the stream hides ghosts; the left column shows the old document, the right the new one', () => {
    expect(visibleOn(ghost, null)).toBe(false)
    expect(visibleOn(moved, null)).toBe(true)
    expect(visibleOn(ghost, 'left')).toBe(true)
    expect(visibleOn(moved, 'left')).toBe(false)
    expect(visibleOn(moved, 'right')).toBe(true)
    expect(visibleOn(ghost, 'right')).toBe(false)
    expect(visibleOn(block('a', 'added'), 'left')).toBe(false)
    expect(visibleOn(block('r', 'removed'), 'right')).toBe(false)
  })

  test('a block moved and edited is drawn on the right only, and each column names the move its own way', () => {
    const both = block('n0', 'changed', { stop: 0, move: { direction: 'up', distance: 3 }, note: 'задача отмечена' })
    expect(visibleOn(both, 'left')).toBe(false)
    expect(visibleOn(both, 'right')).toBe(true)
    expect(noteFor(both, null)).toBe('moved up by 3 blocks · задача отмечена')
    expect(noteFor(both, 'right')).toBe('moved here · was 3 blocks below · задача отмечена')
  })

  test('a change is focusable once: on the right, except a removal', () => {
    const changed = block('c', 'changed', { stop: 1 })
    expect(stopHere(changed, 'left')).toBe(false)
    expect(stopHere(changed, 'right')).toBe(true)
    expect(stopHere(changed, null)).toBe(true)
    expect(stopHere(block('r', 'removed', { stop: 2 }), 'left')).toBe(true)
    expect(stopHere(ghost, 'left')).toBe(false)
  })

  test('each column reads as its own version', () => {
    const segments = [
      { kind: 'equal' as const, text: 'a ' },
      { kind: 'removed' as const, text: 'b' },
      { kind: 'added' as const, text: 'c' },
    ]
    expect(segmentsFor(segments, 'left').map((s) => s.text)).toEqual(['a ', 'b'])
    expect(segmentsFor(segments, 'right').map((s) => s.text)).toEqual(['a ', 'c'])
    expect(segmentsFor(segments, null)).toHaveLength(3)
  })

  test('the moved unit on the right says where it came from; its ghost keeps the differ note', () => {
    expect(noteFor(moved, 'right')).toBe('moved here · was 3 blocks below')
    expect(noteFor(moved, null)).toBe('перемещён выше на 3 блока')
    expect(noteFor(ghost, 'left')).toBe('был здесь · перемещён выше')
    expect(noteFor(block('c', 'changed', { note: 'задача отмечена' }), 'left')).toBeUndefined()
  })

  test('stop targets reach into containers and their heads, never ghosts', () => {
    const container: DiffContainer = {
      kind: 'container',
      id: 'n1',
      change: 'changed',
      label: 'Список',
      summary: '',
      head: block('n1/head', 'changed', { stop: 0 }),
      children: [block('n1/n0', 'equal'), block('n1/n1', 'added', { stop: 1 }), ghost],
    }
    expect(stopTargets(container)).toEqual(['n1/head', 'n1/n1'])
    expect(foldUnitOf([block('x', 'equal', { role: 'item' }), block('y', 'equal', { role: 'task' })])).toBe('items')
    expect(foldUnitOf([block('x', 'equal', { role: 'row' })])).toBe('rows')
    expect(foldUnitOf([block('x', 'equal')])).toBe('blocks')
  })

  test('hidden targets map every stop a fold hides to that fold', () => {
    const items = [block('a', 'equal'), block('b', 'equal', { stop: 0 }), block('c', 'changed', { stop: 1 })]
    const map = hiddenTargets(
      [
        { kind: 'fold', id: 's:0', start: 0, count: 2 },
        { kind: 'item', item: items[2], index: 2 },
      ],
      items,
      (unit) => stopTargets(unit),
    )
    expect([...map]).toEqual([['b', 's:0']])
  })
})

describe('sheet grid', () => {
  const grid: DiffSheetGrid = { rows: 12, columns: 3, cells: {}, changedRows: [3, 4, 9] }

  test('only changed rows keeps the header and the changed rows, folding each run between', () => {
    const rows = gridRows(grid, true, new Set(), 't')
    expect(rows).toEqual([
      { kind: 'row', row: 0 },
      { kind: 'gap', id: 't:1', first: 1, last: 2 },
      { kind: 'row', row: 3 },
      { kind: 'row', row: 4 },
      { kind: 'gap', id: 't:5', first: 5, last: 8 },
      { kind: 'row', row: 9 },
      { kind: 'gap', id: 't:10', first: 10, last: 11 },
    ])
  })

  test('an opened gap shows its rows; unchecked shows the whole used range with no cap', () => {
    expect(gridRows(grid, true, new Set(['t:5']), 't').filter((row) => row.kind === 'row')).toHaveLength(8)
    const big: DiffSheetGrid = { rows: 10000, columns: 256, cells: {}, changedRows: [9999] }
    expect(gridRows(big, false, new Set(), 't')).toHaveLength(10000)
  })

  test('cells are indexed by position whatever the address spelling', () => {
    const placed = cellsByPosition({ D4: { value: 'x' }, iv10000: { value: 'y' }, junk: { value: 'z' } })
    expect(placed.get(positionKey(3, 3))?.address).toBe('D4')
    expect(placed.get(positionKey(9999, 255))?.cell.value).toBe('y')
    expect(placed.size).toBe(2)
    expect([columnName(0), columnName(25), columnName(26), columnName(255)]).toEqual(['A', 'Z', 'AA', 'IV'])
  })

  test('a pinch settles on the nearest listed zoom', () => {
    const steps = [0.75, 0.9, 1, 1.25, 1.5]
    expect(nearestStep(1.1, steps)).toBe(1)
    expect(nearestStep(1.2, steps)).toBe(1.25)
    expect(nearestStep(0.1, steps)).toBe(0.75)
  })
})
