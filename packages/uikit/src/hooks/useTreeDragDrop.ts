import { Accessibility, defaultPreset, Feedback, PointerActivationConstraints, PointerSensor } from '@dnd-kit/dom'
import type { BeforeDragStartEvent, DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/vue'
import { computed, type MaybeRefOrGetter, onScopeDispose, shallowRef, toValue, watch } from 'vue'
import type { TreeDragDropOptions, TreeViewNode } from '../core/tree-view'

export interface UseTreeDragDropOptions<T> {
  nodes: MaybeRefOrGetter<readonly TreeViewNode<T>[]>
  expandedIds: MaybeRefOrGetter<readonly string[]>
  config: MaybeRefOrGetter<TreeDragDropOptions<T> | undefined>
  expand: (node: TreeViewNode<T>) => void
  drop: (source: TreeViewNode<T>, target: TreeViewNode<T> | null) => void
}

/** Provider event handlers and tree policy, usable without TreeView's rendering. */
export function useTreeDragDrop<T>(options: UseTreeDragDropOptions<T>) {
  const source = shallowRef<TreeViewNode<T> | null>(null)
  const target = shallowRef<TreeViewNode<T> | null | undefined>(undefined)
  const nodes = computed(() => {
    const result = new Map<string, { node: TreeViewNode<T>; parent: string | null }>()
    function visit(items: readonly TreeViewNode<T>[], parent: string | null) {
      for (const node of items) {
        result.set(node.id, { node, parent })
        if (node.children) visit(node.children, node.id)
      }
    }
    visit(toValue(options.nodes), null)
    return result
  })
  let expandTimer: ReturnType<typeof setTimeout> | undefined
  let suppressClickUntil = 0
  const clearTimer = () => clearTimeout(expandTimer)
  onScopeDispose(clearTimer)

  function canDrag(node: TreeViewNode<T>) {
    const config = toValue(options.config)
    return !!config && !node.disabled && (config.canDrag?.(node) ?? true)
  }

  function accepts(from: TreeViewNode<T>, to: TreeViewNode<T> | null) {
    const config = toValue(options.config)
    if (!config || !canDrag(from)) return false
    if (to == null) {
      if (!config.rootLabel) return false
    } else {
      if (to.disabled || !(to.branch ?? to.children != null)) return false
      let ancestor: string | null | undefined = to.id
      while (ancestor != null) {
        if (ancestor === from.id) return false
        ancestor = nodes.value.get(ancestor)?.parent
      }
    }
    if (nodes.value.get(from.id)?.parent === (to?.id ?? null)) return false
    return config.canDrop?.(from, to) ?? true
  }

  const canDrop = (node: TreeViewNode<T> | null) => !!source.value && accepts(source.value, node)
  const sensors = [
    PointerSensor.configure({
      activationConstraints: (event) =>
        event.pointerType === 'touch'
          ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 8 })]
          : [new PointerActivationConstraints.Distance({ value: 8 })],
      preventActivation: (event) =>
        event.target instanceof Element && !!event.target.closest('button, input, textarea, select, a, [contenteditable="true"]'),
    }),
  ]
  // Keep scrolling/cursor/selection plugins; the default accessibility instructions claim Space
  // starts a drag, but this tree retains Space for navigation and uses pointer dragging only.
  const plugins = [
    ...defaultPreset.plugins.filter((plugin) => plugin !== Feedback && plugin !== Accessibility),
    Feedback.configure({ feedback: 'clone', dropAnimation: null }),
  ]

  function onBeforeDragStart(event: BeforeDragStartEvent) {
    const node = nodes.value.get(event.operation.source?.data.nodeId)?.node
    if (!node || !canDrag(node)) event.preventDefault()
  }

  function onDragStart(event: DragStartEvent) {
    source.value = nodes.value.get(event.operation.source?.data.nodeId)?.node ?? null
  }

  function onDragOver(event: DragOverEvent) {
    clearTimer()
    const hit = event.operation.target
    const node = !hit ? undefined : hit.data.nodeId === null ? null : nodes.value.get(hit.data.nodeId)?.node
    target.value = node !== undefined && canDrop(node) ? node : undefined
    if (target.value && !toValue(options.expandedIds).includes(target.value.id)) {
      const id = target.value.id
      expandTimer = setTimeout(() => {
        const current = nodes.value.get(id)?.node
        if (current && target.value?.id === id && canDrop(current)) options.expand(current)
      }, 600)
    }
  }

  function onDragEnd(event: DragEndEvent) {
    clearTimer()
    // A pointer release must not also open the item or toggle the destination folder.
    suppressClickUntil = Date.now() + 100
    const from = source.value && nodes.value.get(source.value.id)?.node
    const hit = event.operation.target
    const to = !hit ? undefined : hit.data.nodeId === null ? null : nodes.value.get(hit.data.nodeId)?.node
    source.value = null
    target.value = undefined
    if (!event.canceled && from && to !== undefined && accepts(from, to)) options.drop(from, to)
  }

  watch(
    () => toValue(options.config),
    () => {
      if (!toValue(options.config)) clearTimer()
    },
  )
  return {
    source,
    target,
    canDrag,
    canDrop,
    sensors,
    plugins,
    onBeforeDragStart,
    onDragStart,
    onDragOver,
    onDragEnd,
    suppressClick: () => source.value != null || Date.now() < suppressClickUntil,
  }
}
