import { illegalState } from '@arxhub/errors'

export type SequenceOp = { kind: 'equal'; a: number; b: number } | { kind: 'removed'; a: number } | { kind: 'added'; b: number }

// Myers' O((N+M)·D) diff in its linear-space form (the middle snake, divided and conquered). The table form
// would need O(N·M) memory, and a whole rewrite of a 5k-line file is exactly the input a history view gets.
// Output order inside a change run is fixed — every removal, then every addition — so a view can pair
// removed[i] with added[i] without reordering.
export function diffSequence<T>(a: readonly T[], b: readonly T[], equals: (x: T, y: T) => boolean = Object.is): SequenceOp[] {
  const raw: SequenceOp[] = []
  const same = (i: number, j: number): boolean => equals(a[i], b[j])

  const walk = (aLo: number, aHi: number, bLo: number, bHi: number): void => {
    while (aLo < aHi && bLo < bHi && same(aLo, bLo)) {
      raw.push({ kind: 'equal', a: aLo, b: bLo })
      aLo++
      bLo++
    }
    let tail = 0
    while (aHi - tail > aLo && bHi - tail > bLo && same(aHi - 1 - tail, bHi - 1 - tail)) tail++
    const aEnd = aHi - tail
    const bEnd = bHi - tail
    if (aLo === aEnd) {
      for (let j = bLo; j < bEnd; j++) raw.push({ kind: 'added', b: j })
    } else if (bLo === bEnd) {
      for (let i = aLo; i < aEnd; i++) raw.push({ kind: 'removed', a: i })
    } else {
      const [x, y, u, v] = middleSnake(aLo, aEnd, bLo, bEnd, same)
      walk(aLo, x, bLo, y)
      for (let i = 0; i < u - x; i++) raw.push({ kind: 'equal', a: x + i, b: y + i })
      walk(u, aEnd, v, bEnd)
    }
    for (let t = 0; t < tail; t++) raw.push({ kind: 'equal', a: aEnd + t, b: bEnd + t })
  }

  walk(0, a.length, 0, b.length)
  return removalsFirst(raw)
}

// The snake crossing the middle of the edit path, as absolute [x, y, u, v]: (x, y) where it starts, (u, v)
// where it ends. Both halves around it hold strictly fewer edits, which is what bounds the recursion.
function middleSnake(
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
  same: (i: number, j: number) => boolean,
): [number, number, number, number] {
  const n = aHi - aLo
  const m = bHi - bLo
  const delta = n - m
  const odd = (delta & 1) !== 0
  const max = Math.ceil((n + m) / 2)
  const offset = max + 1
  const forward = new Int32Array(2 * max + 3)
  const backward = new Int32Array(2 * max + 3)

  for (let d = 0; d <= max; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && forward[offset + k - 1] < forward[offset + k + 1]) ? forward[offset + k + 1] : forward[offset + k - 1] + 1
      let y = x - k
      const x0 = x
      const y0 = y
      while (x < n && y < m && same(aLo + x, bLo + y)) {
        x++
        y++
      }
      forward[offset + k] = x
      const c = delta - k
      if (odd && c >= -(d - 1) && c <= d - 1 && x + backward[offset + c] >= n) return [aLo + x0, bLo + y0, aLo + x, bLo + y]
    }
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && backward[offset + k - 1] < backward[offset + k + 1]) ? backward[offset + k + 1] : backward[offset + k - 1] + 1
      let y = x - k
      const x0 = x
      const y0 = y
      while (x < n && y < m && same(aHi - 1 - x, bHi - 1 - y)) {
        x++
        y++
      }
      backward[offset + k] = x
      const c = delta - k
      if (!odd && c >= -d && c <= d && x + forward[offset + c] >= n) return [aHi - x, bHi - y, aHi - x0, bHi - y0]
    }
  }
  throw illegalState('diffSequence: no middle snake found — the edit graph is inconsistent')
}

function removalsFirst(ops: SequenceOp[]): SequenceOp[] {
  const out: SequenceOp[] = []
  let removed: SequenceOp[] = []
  let added: SequenceOp[] = []
  const flush = (): void => {
    out.push(...removed, ...added)
    removed = []
    added = []
  }
  for (const op of ops) {
    if (op.kind === 'equal') {
      flush()
      out.push(op)
    } else if (op.kind === 'removed') removed.push(op)
    else added.push(op)
  }
  flush()
  return out
}
