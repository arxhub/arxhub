import { computed, nextTick, type Ref, watchEffect } from 'vue'
import type { ExplorerExtension, TreeNode } from '../explorer-extension'

// One row of the flattened, currently-visible tree — what the arrow keys move over. Flat because a
// depth-first walk that only recurses into an EXPANDED directory is exactly what "visible" means; the
// nesting itself is the depth each row already renders its own indent from.
interface FlatRow {
  node: TreeNode
  parentPath: string | null
}

function flatten(nodes: TreeNode[], parentPath: string | null, out: FlatRow[]): void {
  for (const node of nodes) {
    out.push({ node, parentPath })
    if (node.entry.kind === 'dir' && node.expanded && node.children) {
      flatten(node.children, node.entry.pathname, out)
    }
  }
}

// A DOM id built from the path rather than a CSS attribute selector: a vault path can carry characters
// (quotes, backslashes) that would need escaping to use in `querySelector`, and `getElementById` matches
// the literal attribute value with no parsing involved at all.
export function treeRowId(path: string): string {
  return `arxhub-tree-row:${path}`
}

function focusRow(path: string): void {
  document.getElementById(treeRowId(path))?.focus()
}

// The standard ARIA treeview keyboard model (WAI-ARIA APG "Tree View Pattern"), driven off one flat
// list rather than duplicated in every recursive FileTreeNode: Up/Down move across visible rows, Right
// opens a closed folder or steps into an already-open one, Left closes an open folder or steps out to
// its parent, Home/End jump to the ends. Real DOM focus moves (not aria-activedescendant), which is
// what the roving tabindex on each row pairs with — the tree is one Tab stop from outside either way.
export function useTreeNavigation(tree: Ref<TreeNode[]>, explorer: ExplorerExtension) {
  const flat = computed((): FlatRow[] => {
    const out: FlatRow[] = []
    flatten(tree.value, null, out)
    return out
  })

  // Keeps the roving tabindex pointing at a row that still exists: the first load, a delete/rename that
  // drops the focused path, or an ancestor collapsing out from under it all leave `focusedPath` stale.
  // Falls back to the selection, then to the first visible row.
  watchEffect(() => {
    const rows = flat.value
    if (rows.length === 0) {
      explorer.focusedPath.value = null
      return
    }
    const current = explorer.focusedPath.value
    if (current != null && rows.some((row) => row.node.entry.pathname === current)) return

    const selected = explorer.selectedPath.value
    const fallback = selected != null && rows.some((row) => row.node.entry.pathname === selected) ? selected : rows[0].node.entry.pathname
    // Only chase focus back onto the tree when a path that was actually valid before just vanished (a
    // delete, or an ancestor collapsing under a focused descendant) — never on first load, where
    // `current` is still null and <body> being the active element is just the page's default, not a
    // focus loss to repair.
    const recovering = current != null
    explorer.focusedPath.value = fallback
    if (recovering && document.activeElement === document.body) void nextTick(() => focusRow(fallback))
  })

  function indexOfFocused(rows: FlatRow[]): number {
    const path = explorer.focusedPath.value
    return path == null ? -1 : rows.findIndex((row) => row.node.entry.pathname === path)
  }

  function onKeydown(event: KeyboardEvent): void {
    // The rename box is a real <input> inside the row — arrow keys there move the caret, not the
    // tree's focus, and must fall through untouched.
    if ((event.target as HTMLElement | null)?.tagName === 'INPUT') return

    const rows = flat.value
    const index = indexOfFocused(rows)
    if (index < 0) return

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusRow(rows[Math.min(index + 1, rows.length - 1)].node.entry.pathname)
        return
      case 'ArrowUp':
        event.preventDefault()
        focusRow(rows[Math.max(index - 1, 0)].node.entry.pathname)
        return
      case 'ArrowRight': {
        event.preventDefault()
        const row = rows[index]
        if (row.node.entry.kind !== 'dir') return
        if (!row.node.expanded) {
          void explorer.expand(row.node)
          return
        }
        const child = rows[index + 1]
        if (child?.parentPath === row.node.entry.pathname) focusRow(child.node.entry.pathname)
        return
      }
      case 'ArrowLeft': {
        event.preventDefault()
        const row = rows[index]
        if (row.node.entry.kind === 'dir' && row.node.expanded) {
          explorer.collapse(row.node)
          return
        }
        if (row.parentPath != null) focusRow(row.parentPath)
        return
      }
      case 'Home':
        event.preventDefault()
        focusRow(rows[0].node.entry.pathname)
        return
      case 'End':
        event.preventDefault()
        focusRow(rows[rows.length - 1].node.entry.pathname)
    }
  }

  return { onKeydown }
}
