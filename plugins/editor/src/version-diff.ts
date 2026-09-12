import { validation } from '@arxhub/errors'
import type { Node } from 'prosemirror-model'
import type { EditorState, Transaction } from 'prosemirror-state'

export interface BlockDifference {
  key: string
  kind: 'added' | 'removed' | 'changed' | 'moved'
  before: Node | null
  after: Node | null
  oldIndex: number
  index: number
}

function comparable(node: Node): string {
  return JSON.stringify(node.toJSON(), (key, value) => (key === 'arxId' ? undefined : value))
}

export function versionDifferences(current: Node, previous: Node): BlockDifference[] {
  const used = new Set<number>()
  const matches = previous.children.map((before, oldIndex) => {
    const id = before.attrs.arxId
    let index = id
      ? current.children.findIndex((after) => after.attrs.arxId === id)
      : current.children.findIndex((after, i) => !used.has(i) && comparable(after) === comparable(before))
    if (index < 0 && !id && current.maybeChild(oldIndex) && !used.has(oldIndex)) index = oldIndex
    if (index >= 0) used.add(index)
    return { before, oldIndex, index, after: index >= 0 ? current.child(index) : null }
  })
  // An insertion shifts every ordinal. Only blocks outside the preserved relative order have moved.
  const tails: number[] = []
  const parent = new Map<number, number>()
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].index < 0) continue
    let low = 0
    let high = tails.length
    while (low < high) {
      const mid = (low + high) >> 1
      if (matches[tails[mid]].index < matches[i].index) low = mid + 1
      else high = mid
    }
    if (low) parent.set(i, tails[low - 1])
    tails[low] = i
  }
  const ordered = new Set<number>()
  let cursor: number | undefined = tails.at(-1)
  while (cursor !== undefined) {
    ordered.add(cursor)
    cursor = parent.get(cursor)
  }
  const result: BlockDifference[] = []
  for (const match of matches) {
    const { before, after, oldIndex, index } = match
    const kind = !after ? 'removed' : comparable(before) !== comparable(after) ? 'changed' : !ordered.has(oldIndex) ? 'moved' : null
    if (kind) result.push({ ...match, key: `before:${before.attrs.arxId || oldIndex}`, kind })
  }
  current.children.forEach((after, index) => {
    if (!used.has(index)) result.push({ key: `after:${after.attrs.arxId || index}`, kind: 'added', before: null, after, oldIndex: -1, index })
  })
  return result
}

export function restoreVersionBlock(state: EditorState, previous: Node, key: string): Transaction {
  const change = versionDifferences(state.doc, previous).find((item) => item.key === key)
  if (!change) throw validation('This block changed since the comparison. Refresh the version preview.')
  const position = (index: number) => state.doc.children.slice(0, index).reduce((pos, node) => pos + node.nodeSize, 0)
  const tr = state.tr
  if (change.after && change.kind !== 'moved') {
    const from = position(change.index)
    if (change.before) {
      const restored = change.before.type.create(
        { ...change.before.attrs, arxId: change.before.attrs.arxId || change.after.attrs.arxId },
        change.before.content,
        change.before.marks,
      )
      return tr.replaceWith(from, from + change.after.nodeSize, restored)
    }
    return tr.delete(from, from + change.after.nodeSize)
  }
  if (!change.before) throw validation('The saved version has no block to restore.')
  let target = state.doc.content.size
  for (const next of previous.children.slice(change.oldIndex + 1)) {
    const index = state.doc.children.findIndex((node) =>
      next.attrs.arxId ? node.attrs.arxId === next.attrs.arxId : comparable(node) === comparable(next),
    )
    if (index >= 0) {
      target = position(index)
      break
    }
  }
  if (change.after) {
    const from = position(change.index)
    tr.delete(from, from + change.after.nodeSize)
  }
  return tr.insert(tr.mapping.map(target), change.before)
}
