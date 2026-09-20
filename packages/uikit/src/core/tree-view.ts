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
