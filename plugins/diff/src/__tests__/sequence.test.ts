import { describe, expect, test } from 'vitest'
import { diffSequence, type SequenceOp } from '../sequence'

function lcsLength(a: readonly string[], b: readonly string[]): number {
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      table[i][j] = a[i - 1] === b[j - 1] ? table[i - 1][j - 1] + 1 : Math.max(table[i - 1][j], table[i][j - 1])
  return table[a.length][b.length]
}

// Replaying the script must rebuild both sides exactly — the property every consumer of the ops relies on.
function replay(a: readonly string[], b: readonly string[], ops: SequenceOp[]): { left: string[]; right: string[] } {
  const left: string[] = []
  const right: string[] = []
  for (const op of ops) {
    if (op.kind === 'equal') {
      expect(a[op.a]).toBe(b[op.b])
      left.push(a[op.a])
      right.push(b[op.b])
    } else if (op.kind === 'removed') left.push(a[op.a])
    else right.push(b[op.b])
  }
  return { left, right }
}

const cases: [string, string][] = [
  ['abcabba', 'cbabac'],
  ['', ''],
  ['', 'abc'],
  ['abc', ''],
  ['abc', 'abc'],
  ['x', 'y'],
  ['abcdef', 'azcdyf'],
  ['aaaa', 'aa'],
  ['kitten', 'sitting'],
  ['abxcd', 'abcd'],
  ['abcd', 'abxcd'],
]

describe('diffSequence', () => {
  test.each(cases)('is minimal and replayable: %s → %s', (x, y) => {
    const a = [...x]
    const b = [...y]
    const ops = diffSequence(a, b)
    expect(replay(a, b, ops)).toEqual({ left: a, right: b })
    expect(ops.filter((op) => op.kind === 'equal')).toHaveLength(lcsLength(a, b))
  })

  test('is minimal on random inputs', () => {
    let seed = 7
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    for (let round = 0; round < 200; round++) {
      const a = Array.from({ length: Math.floor(random() * 20) }, () => 'abc'[Math.floor(random() * 3)])
      const b = Array.from({ length: Math.floor(random() * 20) }, () => 'abc'[Math.floor(random() * 3)])
      const ops = diffSequence(a, b)
      expect(replay(a, b, ops)).toEqual({ left: a, right: b })
      expect(ops.filter((op) => op.kind === 'equal')).toHaveLength(lcsLength(a, b))
    }
  })

  test('orders a change run as every removal, then every addition', () => {
    const ops = diffSequence(['a', 'x', 'y', 'b'], ['a', 'p', 'q', 'b'])
    expect(ops.map((op) => op.kind)).toEqual(['equal', 'removed', 'removed', 'added', 'added', 'equal'])
  })

  test('keeps a shared prefix and suffix as equal without searching them', () => {
    const ops = diffSequence(['h', 'm', 't'], ['h', 'n', 't'])
    expect(ops).toEqual([
      { kind: 'equal', a: 0, b: 0 },
      { kind: 'removed', a: 1 },
      { kind: 'added', b: 1 },
      { kind: 'equal', a: 2, b: 2 },
    ])
  })

  test('honours a custom equality', () => {
    const ops = diffSequence(['A', 'b'], ['a', 'B'], (x, y) => x.toLowerCase() === y.toLowerCase())
    expect(ops.every((op) => op.kind === 'equal')).toBe(true)
  })

  test('a 5k-line rewrite finishes quickly in linear space', () => {
    const a = Array.from({ length: 5000 }, (_, i) => `left ${i}`)
    const b = Array.from({ length: 5000 }, (_, i) => `right ${i}`)
    const started = performance.now()
    const ops = diffSequence(a, b)
    expect(performance.now() - started).toBeLessThan(3000)
    expect(ops).toHaveLength(10000)
  })

  test('a 5k-line file with scattered edits finishes quickly', () => {
    const a = Array.from({ length: 5000 }, (_, i) => `line ${i}`)
    const b = a.map((line, i) => (i % 97 === 0 ? `${line} edited` : line))
    const started = performance.now()
    const ops = diffSequence(a, b)
    expect(performance.now() - started).toBeLessThan(1000)
    expect(ops.filter((op) => op.kind === 'equal')).toHaveLength(5000 - Math.ceil(5000 / 97))
  })
})
