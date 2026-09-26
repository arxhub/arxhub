import { describe, expect, test } from 'vitest'
import { alignBlocks, alignLines, type SideRow } from '../align'
import type { DiffBlock, DiffUnit } from '../model'
import { textDiff } from '../text-differ'

function block(id: string, change: DiffBlock['change'], extra: Partial<DiffBlock> = {}): DiffBlock {
  return { kind: 'block', id, change, role: 'paragraph', segments: [{ kind: 'equal', text: id }], ...extra }
}

function shape<T extends { id: string }>(rows: SideRow<T>[]): string[] {
  return rows.map((row) => `${row.left.kind === 'item' ? row.left.item.id : '_'}|${row.right.kind === 'item' ? row.right.item.id : '_'}`)
}

describe('alignBlocks', () => {
  test('a moved block appears twice: its ghost left at the old place, itself right at the new one', () => {
    const units: DiffUnit[] = [
      block('m', 'moved', { move: { direction: 'up', distance: 2 } }),
      block('a', 'equal'),
      block('b', 'changed'),
      block('e', 'changed', { move: { direction: 'down', distance: 1 } }),
      block('m-ghost', 'moved', { ghost: true }),
      block('n', 'added'),
      block('r', 'removed'),
    ]
    const rows = alignBlocks(units)
    expect(shape(rows)).toEqual(['_|m', 'a|a', 'b|b', '_|e', 'm-ghost|_', '_|n', 'r|_'])
    expect(rows.map((it) => it.changed)).toEqual([true, false, true, true, true, true, true])
  })
})

describe('alignLines', () => {
  test('zips a run the way GitHub does: pairs share a row, leftovers sit opposite blanks', () => {
    const model = textDiff('x\nr1\nr2\nr3\ny\nq', 'x\na1\ny\nq\nn1\nn2')
    expect(
      shape(alignLines(model.lines)).map((it) => it.replace(/l\d+/g, (id) => model.lines.find((l) => l.id === id)?.segments[0]?.text ?? id)),
    ).toEqual(['x|x', 'r1|a1', 'r2|_', 'r3|_', 'y|y', 'q|q', '_|n1', '_|n2'])
  })
})
