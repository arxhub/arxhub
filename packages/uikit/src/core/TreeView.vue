<script setup lang="ts" generic="T">
import { DragDropProvider } from '@dnd-kit/vue'
import { computed, ref, useId } from 'vue'
import { useShellFrame } from '../hooks/useShellFrame'
import { useTreeDragDrop } from '../hooks/useTreeDragDrop'
import { useTreeNavigation } from '../hooks/useTreeNavigation'
import Icon from './Icon.vue'
import Row from './Row.vue'
import TreeDragTarget from './TreeDragTarget.vue'
import type { TreeDragDropOptions, TreeViewNode } from './tree-view'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    nodes: readonly TreeViewNode<T>[]
    label: string
    selectedId?: string | null
    expandedIds?: readonly string[]
    dragDrop?: TreeDragDropOptions<T>
  }>(),
  { selectedId: null, expandedIds: () => [] },
)
const emit = defineEmits<{
  activate: [node: TreeViewNode<T>]
  toggle: [node: TreeViewNode<T>, expanded: boolean]
  nodeContextmenu: [node: TreeViewNode<T>, event: MouseEvent]
  nodeKeydown: [node: TreeViewNode<T>, event: KeyboardEvent]
  nodeDrop: [source: TreeViewNode<T>, target: TreeViewNode<T> | null]
}>()
const root = ref<HTMLElement | null>(null)
const prefix = useId()
const rowId = (id: string) => `${prefix}:node:${id}`
const iconSize = useShellFrame() === 'mobile' ? 16 : 14
const dnd = useTreeDragDrop({
  nodes: () => props.nodes,
  expandedIds: () => props.expandedIds,
  config: () => props.dragDrop,
  expand: (node) => emit('toggle', node, true),
  drop: (source, target) => emit('nodeDrop', source, target),
})

function activate(node: TreeViewNode<T>) {
  if (node.disabled) return
  emit('activate', node)
  if (node.branch ?? node.children != null) emit('toggle', node, !props.expandedIds.includes(node.id))
}

const { rows, focusedId, onKeydown } = useTreeNavigation({
  nodes: () => props.nodes,
  expandedIds: () => props.expandedIds,
  selectedId: () => props.selectedId,
  activate,
  toggle: (node, expanded) => emit('toggle', node, expanded),
  focus: (id) => {
    if (root.value?.getClientRects().length) document.getElementById(rowId(id))?.focus()
  },
  shouldRestoreFocus: (id) =>
    !!root.value?.getClientRects().length &&
    (document.activeElement === document.body || !!document.getElementById(rowId(id))?.contains(document.activeElement)),
})
// A flat list has no expander column; mixed branches/leaves align their icons within the tree.
const hasBranches = computed(() => rows.value.some((row) => row.branch))

function isControl(event: MouseEvent) {
  return event.target instanceof Element && !!event.target.closest('button, input, textarea, select, a, [contenteditable="true"]')
}

function click(node: TreeViewNode<T>, event: MouseEvent) {
  if (!dnd.suppressClick() && !isControl(event)) activate(node)
}

function contextmenu(node: TreeViewNode<T>, event: MouseEvent) {
  if (isControl(event)) return
  emit('nodeContextmenu', node, event)
}

function keydown(node: TreeViewNode<T>, event: KeyboardEvent) {
  emit('nodeKeydown', node, event)
  onKeydown(event)
}
</script>

<template>
  <DragDropProvider :sensors="dnd.sensors" :plugins="dnd.plugins"
    @before-drag-start="dnd.onBeforeDragStart" @drag-start="dnd.onDragStart"
    @drag-over="dnd.onDragOver" @drag-end="dnd.onDragEnd">
    <div ref="root" v-bind="$attrs" class="tree-view" role="tree" :aria-label="label">
      <TreeDragTarget v-for="row in rows" :key="row.node.id" :id="rowId(row.node.id)" :node-id="row.node.id"
        :draggable="dnd.canDrag(row.node)" :droppable="dnd.canDrop(row.node)" v-slot="{ setElement }">
        <Row
          :ref="setElement"
          :id="rowId(row.node.id)"
          class="tree-view-node"
          :class="{ 'drop-target': dnd.target.value?.id === row.node.id, 'drag-source': dnd.source.value?.id === row.node.id }"
          role="treeitem"
          :depth="row.depth"
          :selected="row.node.id === selectedId"
          :disabled="row.node.disabled"
          :aria-label="row.node.ariaLabel ?? row.node.label"
          :aria-description="row.node.description"
          :title="row.node.description"
          :aria-level="row.depth + 1"
          :aria-posinset="row.position"
          :aria-setsize="row.siblings"
          :aria-selected="row.node.id === selectedId"
          :aria-expanded="row.branch ? row.expanded : undefined"
          :aria-disabled="row.node.disabled || undefined"
          :tabindex="row.node.id === focusedId ? 0 : -1"
          @focus="focusedId = row.node.id"
          @click="click(row.node, $event)"
          @contextmenu="contextmenu(row.node, $event)"
          @keydown.self="keydown(row.node, $event)"
        >
          <span v-if="hasBranches" class="glyph" aria-hidden="true">
            <Icon v-if="row.branch" :name="row.expanded ? 'lu:chevron-down' : 'lu:chevron-right'" :size="iconSize" />
          </span>
          <span v-if="row.node.icon" class="glyph" aria-hidden="true"><Icon :name="row.node.icon" :size="iconSize" /></span>
          <span class="tree-view-label"><slot name="label" :node="row.node">{{ row.node.label }}</slot></span>
          <slot name="actions" :node="row.node" />
        </Row>
      </TreeDragTarget>
      <slot v-if="!rows.length" name="empty" />
      <TreeDragTarget v-if="dragDrop?.rootLabel" :id="`${prefix}:root`" :node-id="null"
        :draggable="false" :droppable="dnd.canDrop(null)" v-slot="{ setElement }">
        <div :ref="setElement" class="tree-root-drop" :class="{ 'drop-target': dnd.target.value === null }" role="presentation">
          <span v-if="dnd.canDrop(null)">{{ dragDrop.rootLabel }}</span>
        </div>
      </TreeDragTarget>
    </div>
  </DragDropProvider>
</template>

<style scoped>
.tree-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  font-family: var(--font-sans);
}

.tree-root-drop {
  flex: 1;
  min-height: var(--size-xl);
  padding: 8px;
  color: var(--gray-11);
  font-size: var(--font-size-sm);
}

.tree-view .drop-target {
  background: var(--gray-4);
  outline: 2px solid var(--gray-8);
  outline-offset: -2px;
}

.drag-source {
  background: var(--gray-3);
}

.row.tree-view-node {
  gap: 4px;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
}

.glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--size-xs-half);
  flex-shrink: 0;
  color: var(--gray-10);
}

.selected .glyph {
  color: var(--accent-11);
}

.disabled .glyph {
  color: var(--gray-9);
}

.tree-view-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
