import { expect, test } from 'vitest'
import { branchesOnly, draftPosition, type TreeViewNode, type TreeViewRow } from '../core/tree-view'

const node = (id: string, extra: Partial<TreeViewNode<string>> = {}): TreeViewNode<string> => ({ id, label: id, data: id, ...extra })
const row = (id: string, depth: number): TreeViewRow<string> => ({
  node: node(id),
  parentId: null,
  depth,
  branch: true,
  expanded: true,
  position: 1,
  siblings: 1,
})

test('a picker keeps branches at every depth, lazy ones included, and drops every leaf', () => {
  const nodes = [
    node('docs', { children: [node('docs/a.md'), node('docs/work', { children: [node('docs/work/b.md')] })] }),
    node('lazy', { branch: true }),
    node('readme.md'),
  ]
  const picked = branchesOnly(nodes)
  expect(picked.map((n) => n.id)).toEqual(['docs', 'lazy'])
  expect(picked[0].children?.map((n) => n.id)).toEqual(['docs/work'])
  expect(picked[0].children?.[0].children).toEqual([])
  expect(nodes[0].children).toHaveLength(2)
})

test('a leaf flagged as not a branch stays out even when it carries children', () => {
  expect(branchesOnly([node('odd', { branch: false, children: [node('odd/x')] })])).toEqual([])
})

test('a draft goes straight under its parent, one level deeper, ahead of the parent children', () => {
  const rows = [row('root', 0), row('root/a', 1), row('root/b', 1)]
  expect(draftPosition(rows, 'root')).toEqual({ index: 1, depth: 1 })
  expect(draftPosition(rows, 'root/b')).toEqual({ index: 3, depth: 2 })
})

test('a root draft opens the list, and a draft under a hidden parent has no place', () => {
  expect(draftPosition([row('a', 0)], null)).toEqual({ index: 0, depth: 0 })
  expect(draftPosition([], null)).toEqual({ index: 0, depth: 0 })
  expect(draftPosition([row('a', 0)], 'a/hidden')).toBeNull()
})
