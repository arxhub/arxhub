import { describe, expect, test } from 'vitest'
import { mergePendingNodes, reconcilePending, type TreeNode } from '../explorer-extension'

function fileNode(pathname: string): TreeNode {
  return { entry: { kind: 'file', pathname }, children: null, expanded: false }
}

function dirNode(pathname: string, children: TreeNode[] = []): TreeNode {
  return { entry: { kind: 'dir', pathname }, children, expanded: true }
}

describe('reconcilePending', () => {
  test('a phantom appears on the next pending value, same as mergePendingNodes on its own', () => {
    const merged = reconcilePending([], '/', new Set(['a.md']))

    expect(merged).toEqual([{ entry: { kind: 'file', pathname: 'a.md' }, children: null, expanded: false, pending: true }])
  })

  test('a phantom disappears once its path leaves the pending set', () => {
    const withPhantom = mergePendingNodes([], '/', new Set(['a.md']))

    expect(reconcilePending(withPhantom, '/', new Set())).toEqual([])
  })

  test('a phantom directory disappears once every path under it has left the set', () => {
    const withPhantoms = mergePendingNodes([], '/', new Set(['notes/a.md', 'notes/b.md']))
    expect(withPhantoms).toHaveLength(1)

    // One of the two leaves — the directory survives, minus the one file.
    const oneLeft = reconcilePending(withPhantoms, '/', new Set(['notes/b.md']))
    expect(oneLeft).toHaveLength(1)
    expect(oneLeft[0].children).toEqual([{ entry: { kind: 'file', pathname: 'notes/b.md' }, children: null, expanded: false, pending: true }])

    // Both leave — nothing is left to hold the directory up.
    expect(reconcilePending(withPhantoms, '/', new Set())).toEqual([])
  })

  test('a real node with nothing pending under it is never touched — same reference back', () => {
    const file = fileNode('a.md')
    const sub = dirNode('sub', [fileNode('sub/x.md')])
    const nodes = [file, sub]

    const reconciled = reconcilePending(nodes, '/', new Set())

    expect(reconciled[0]).toBe(file)
    expect(reconciled[1]).toBe(sub)
    expect(reconciled[1].children?.[0]).toBe(sub.children?.[0])
  })

  test('an unexpanded real directory (children still null) is left exactly as it is', () => {
    const lazy: TreeNode = { entry: { kind: 'dir', pathname: 'sub' }, children: null, expanded: false }

    const reconciled = reconcilePending([lazy], '/', new Set(['sub/hidden.md']))

    // Nothing to reconcile inside a directory that was never listed — merging it happens at expand().
    expect(reconciled[0]).toBe(lazy)
  })

  test('a real directory that IS expanded reconciles its own children, and picks up a new phantom too', () => {
    const sub = dirNode('sub', [fileNode('sub/real.md')])

    const reconciled = reconcilePending([sub], '/', new Set(['sub/new-pending.md']))

    expect(reconciled).toHaveLength(1)
    const reconciledSub = reconciled[0]
    expect(reconciledSub).not.toBe(sub) // its children changed, so it is a new node…
    expect(reconciledSub.children?.[0]).toBe(sub.children?.[0]) // …but the untouched real file is the same one
    expect(reconciledSub.children?.[1]).toEqual({
      entry: { kind: 'file', pathname: 'sub/new-pending.md' },
      children: null,
      expanded: false,
      pending: true,
    })
  })

  test('materializing one pending file leaves a sibling pending file alone', () => {
    const withBoth = mergePendingNodes([], '/', new Set(['a.md', 'b.md']))

    const afterOneResolves = reconcilePending(withBoth, '/', new Set(['b.md']))

    expect(afterOneResolves).toEqual([{ entry: { kind: 'file', pathname: 'b.md' }, children: null, expanded: false, pending: true }])
  })
})
