import { describe, expect, test } from 'vitest'
import { type FoldEntry, foldRuns } from '../fold'

// '=' unchanged, '*' changed — one character per item, so a case reads as the list it folds.
function fold(pattern: string, context: number, expanded: string[] = []): string {
  const entries = foldRuns([...pattern], (it) => it === '*', { context, expanded: new Set(expanded), scope: 's' })
  return entries.map((it: FoldEntry<string>) => (it.kind === 'item' ? it.item : `[${it.count}]`)).join('')
}

describe('foldRuns', () => {
  test('keeps two items of context on each side of a change', () => {
    expect(fold('==========*==========', 2)).toBe('[8]==*==[8]')
  })

  test('keeps three lines of context', () => {
    expect(fold('==========*', 3)).toBe('[7]===*')
  })

  test('context 0 folds every unchanged run', () => {
    expect(fold('===*===*===', 0)).toBe('[3]*[3]*[3]')
  })

  test('a run between two changes keeps context on both ends', () => {
    expect(fold('*==========*', 2)).toBe('*==[6]==*')
  })

  test('a run too short to fold is shown whole', () => {
    expect(fold('*=====*', 2)).toBe('*=====*')
    expect(fold('*======*', 3)).toBe('*======*')
  })

  test('a fold never hides a single item', () => {
    expect(fold('===*', 2)).toBe('===*')
  })

  test('fold ids name the scope and the first hidden index', () => {
    const entries = foldRuns([...'*=========='], (it) => it === '*', { context: 2, expanded: new Set(), scope: 'tab1' })
    expect(entries.find((it) => it.kind === 'fold')).toEqual({ kind: 'fold', id: 'tab1:3', start: 3, count: 8 })
  })

  test('an expanded fold shows its items', () => {
    expect(fold('*==========', 2, ['s:3'])).toBe('*==========')
    expect(fold('*==========', 2, ['s:9'])).toBe('*==[8]')
  })

  test('input with no change is returned whole', () => {
    expect(fold('==========', 2)).toBe('==========')
  })

  test('item entries carry their index', () => {
    const entries = foldRuns(['a', 'b'], (it) => it === 'b', { context: 1, expanded: new Set(), scope: 's' })
    expect(entries).toEqual([
      { kind: 'item', item: 'a', index: 0 },
      { kind: 'item', item: 'b', index: 1 },
    ])
  })
})
