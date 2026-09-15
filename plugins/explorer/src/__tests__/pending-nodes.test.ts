import { describe, expect, test } from 'vitest'
import { mergePendingNodes, type TreeNode } from '../explorer-extension'

function fileNode(pathname: string): TreeNode {
  return { entry: { kind: 'file', pathname }, children: null, expanded: false }
}

function dirNode(pathname: string, children: TreeNode[] = []): TreeNode {
  return { entry: { kind: 'dir', pathname }, children, expanded: true }
}

describe('mergePendingNodes', () => {
  test('a pending path outside dirPath is not this directory’s concern', () => {
    expect(mergePendingNodes([], 'notes', new Set(['other/a.md']))).toEqual([])
  })

  test('a direct child pending path becomes a phantom file node', () => {
    const merged = mergePendingNodes([], '/', new Set(['a.md']))

    expect(merged).toEqual([{ entry: { kind: 'file', pathname: 'a.md' }, children: null, expanded: false, pending: true }])
  })

  test('a nested pending path grows the intermediate directories it needs, as needed', () => {
    const merged = mergePendingNodes([], '/', new Set(['notes/deep/a.md']))

    expect(merged).toHaveLength(1)
    const notes = merged[0]
    expect(notes.entry).toEqual({ kind: 'dir', pathname: 'notes' })
    expect(notes.pending).toBe(true)

    expect(notes.children).toHaveLength(1)
    const deep = notes.children?.[0]
    expect(deep?.entry).toEqual({ kind: 'dir', pathname: 'notes/deep' })
    expect(deep?.pending).toBe(true)

    expect(deep?.children).toEqual([{ entry: { kind: 'file', pathname: 'notes/deep/a.md' }, children: null, expanded: false, pending: true }])
  })

  test('two pending files sharing a directory get ONE phantom directory, not two', () => {
    const merged = mergePendingNodes([], '/', new Set(['notes/a.md', 'notes/b.md']))

    expect(merged).toHaveLength(1)
    expect(merged[0].children).toHaveLength(2)
    expect(merged[0].children?.map((c) => c.entry.pathname).sort()).toEqual(['notes/a.md', 'notes/b.md'])
  })

  test('disk wins: a name already on this level is left exactly as reconciled, no phantom added', () => {
    const real = dirNode('notes')
    const merged = mergePendingNodes([real], '/', new Set(['notes/a.md']))

    // The real node is untouched — same reference, children unchanged — and nothing extra was pushed
    // for the name it already owns.
    expect(merged).toEqual([real])
    expect(merged[0]).toBe(real)
  })

  test('a real file of the same name also wins, even though it is not a directory', () => {
    const real = fileNode('report.arx')
    const merged = mergePendingNodes([real], '/', new Set(['report.arx']))

    expect(merged).toEqual([real])
  })

  test('with no pending paths under this directory, the real list comes back unchanged', () => {
    const real = [fileNode('a.md'), dirNode('sub')]
    expect(mergePendingNodes(real, '/', new Set())).toBe(real)
    expect(mergePendingNodes(real, 'sub', new Set(['elsewhere/x.md']))).toBe(real)
  })

  test('scoping to a subdirectory only pulls in pending paths under it, relative to it', () => {
    const merged = mergePendingNodes([], 'notes/sub', new Set(['notes/sub/a.md', 'notes/other/b.md']))

    expect(merged).toEqual([{ entry: { kind: 'file', pathname: 'notes/sub/a.md' }, children: null, expanded: false, pending: true }])
  })
})
