export interface TreeViewNode<T = unknown> {
  id: string
  label: string
  data: T
  icon?: string
  ariaLabel?: string
  description?: string
  disabled?: boolean
  /** A lazy or empty branch can have no children yet. */
  branch?: boolean
  children?: readonly TreeViewNode<T>[]
}

export interface TreeViewRow<T = unknown> {
  node: TreeViewNode<T>
  parentId: string | null
  depth: number
  branch: boolean
  expanded: boolean
  position: number
  siblings: number
}

export interface TreeDragDropOptions<T = unknown> {
  /** Null is the tree root, represented by the free space below the rows. */
  rootLabel?: string
  canDrag?: (node: TreeViewNode<T>) => boolean
  canDrop?: (source: TreeViewNode<T>, target: TreeViewNode<T> | null) => boolean
}

/** What a tree offers to do with its rows: move through them, or pick one branch (a destination folder). */
export type TreeViewMode = 'navigate' | 'pick'

/** A child being named in place, before it exists: a row with a name field and confirm / cancel. */
export interface TreeViewDraft {
  /** Null drafts a child of the root, above the first row. */
  parentId: string | null
  /** Accessible name of the field, e.g. "Folder name". */
  label: string
  icon?: string
  placeholder?: string
  value?: string
  confirmLabel?: string
  cancelLabel?: string
}

/** A picker offers only branches: a leaf is never a place something can go. */
export function branchesOnly<T>(nodes: readonly TreeViewNode<T>[]): TreeViewNode<T>[] {
  return nodes
    .filter((node) => node.branch ?? node.children != null)
    .map((node) => (node.children ? { ...node, children: branchesOnly(node.children) } : node))
}

/**
 * Where a draft row goes among the visible rows: straight under its parent, ahead of the parent's
 * existing children, one level deeper. A parent that is not on screen has nowhere to show it — revealing
 * the parent is the caller's decision, not the tree's.
 */
export function draftPosition<T>(rows: readonly TreeViewRow<T>[], parentId: string | null): { index: number; depth: number } | null {
  if (parentId == null) return { index: 0, depth: 0 }
  const index = rows.findIndex((row) => row.node.id === parentId)
  return index < 0 ? null : { index: index + 1, depth: rows[index].depth + 1 }
}
