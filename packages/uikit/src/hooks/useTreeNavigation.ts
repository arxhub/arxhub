import { computed, type MaybeRefOrGetter, nextTick, ref, toValue, watch } from 'vue'
import type { TreeViewNode, TreeViewRow } from '../core/tree-view'

export interface TreeNavigationOptions<T> {
  nodes: MaybeRefOrGetter<readonly TreeViewNode<T>[]>
  expandedIds: MaybeRefOrGetter<readonly string[]>
  selectedId?: MaybeRefOrGetter<string | null | undefined>
  focus: (id: string) => void
  /** Only restore DOM focus when this tree lost it, never steal it from another control. */
  shouldRestoreFocus?: (previousId: string) => boolean
  toggle: (node: TreeViewNode<T>, expanded: boolean) => void
  activate: (node: TreeViewNode<T>) => void
}

export function useTreeNavigation<T>(options: TreeNavigationOptions<T>) {
  const focusedId = ref<string | null>(null)
  const rows = computed(() => {
    const expanded = new Set(toValue(options.expandedIds))
    const result: TreeViewRow<T>[] = []
    function visit(nodes: readonly TreeViewNode<T>[], parentId: string | null, depth: number) {
      nodes.forEach((node, index) => {
        const branch = node.branch ?? node.children != null
        const open = branch && expanded.has(node.id)
        result.push({ node, parentId, depth, branch, expanded: open, position: index + 1, siblings: nodes.length })
        if (open && node.children) visit(node.children, node.id, depth + 1)
      })
    }
    visit(toValue(options.nodes), null, 0)
    return result
  })
  const enabled = computed(() => rows.value.filter((row) => !row.node.disabled))

  watch(
    [rows, () => toValue(options.selectedId)],
    ([current], previous) => {
      const available = current.filter((row) => !row.node.disabled)
      if (available.some((row) => row.node.id === focusedId.value)) return
      const oldId = focusedId.value
      const before = previous?.[0] ?? []
      let parentId = before.find((row) => row.node.id === oldId)?.parentId
      while (parentId != null && !available.some((row) => row.node.id === parentId)) {
        parentId = before.find((row) => row.node.id === parentId)?.parentId
      }
      const fallback =
        available.find((row) => row.node.id === parentId) ??
        available.find((row) => row.node.id === toValue(options.selectedId)) ??
        available[0]
      focusedId.value = fallback?.node.id ?? null
      if (oldId != null && fallback && options.shouldRestoreFocus?.(oldId)) {
        void nextTick(() => {
          if (options.shouldRestoreFocus?.(oldId)) options.focus(fallback.node.id)
        })
      }
    },
    { immediate: true },
  )

  function focus(id: string) {
    focusedId.value = id
    options.focus(id)
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
    const visible = enabled.value
    const index = visible.findIndex((row) => row.node.id === focusedId.value)
    const row = visible[index]
    if (!row) return
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focus(visible[Math.min(index + 1, visible.length - 1)].node.id)
        break
      case 'ArrowUp':
        event.preventDefault()
        focus(visible[Math.max(index - 1, 0)].node.id)
        break
      case 'ArrowRight':
        event.preventDefault()
        if (!row.branch) break
        if (!row.expanded) options.toggle(row.node, true)
        else if (visible[index + 1]?.parentId === row.node.id) focus(visible[index + 1].node.id)
        break
      case 'ArrowLeft':
        event.preventDefault()
        if (row.expanded) options.toggle(row.node, false)
        else if (row.parentId != null && visible.some((item) => item.node.id === row.parentId)) focus(row.parentId)
        break
      case 'Home':
      case 'End':
        event.preventDefault()
        focus(visible[event.key === 'Home' ? 0 : visible.length - 1].node.id)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        options.activate(row.node)
        break
    }
  }

  return { rows, focusedId, onKeydown }
}
