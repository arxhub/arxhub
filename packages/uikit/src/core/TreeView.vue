<script setup lang="ts" generic="T">
import { DragDropProvider } from '@dnd-kit/vue'
import { computed, ref, useId, watch } from 'vue'
import { useShellFrame } from '../hooks/useShellFrame'
import { useTreeDragDrop } from '../hooks/useTreeDragDrop'
import { useTreeNavigation } from '../hooks/useTreeNavigation'
import Icon from './Icon.vue'
import IconButton from './IconButton.vue'
import InlineNameInput from './InlineNameInput.vue'
import Row from './Row.vue'
import ScrollArea from './ScrollArea.vue'
import TreeDragTarget from './TreeDragTarget.vue'
import {
  branchesOnly,
  draftPosition,
  type TreeDragDropOptions,
  type TreeViewDraft,
  type TreeViewMode,
  type TreeViewNode,
  type TreeViewRow,
} from './tree-view'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    nodes: readonly TreeViewNode<T>[]
    label: string
    selectedId?: string | null
    expandedIds?: readonly string[]
    dragDrop?: TreeDragDropOptions<T>
    // `pick` shows branches only and marks the selected one with a trailing check — choosing where
    // something goes rather than what to open.
    mode?: TreeViewMode
    draft?: TreeViewDraft | null
    // The same trailing check without pick mode's branches-only filter: a list of choices shown in a sheet
    // (the phone's settings sections) marks its choice the way every other such sheet does.
    markSelected?: boolean
  }>(),
  { selectedId: null, expandedIds: () => [], mode: 'navigate', draft: null, markSelected: false },
)
const emit = defineEmits<{
  activate: [node: TreeViewNode<T>]
  toggle: [node: TreeViewNode<T>, expanded: boolean]
  nodeContextmenu: [node: TreeViewNode<T>, event: MouseEvent]
  nodeKeydown: [node: TreeViewNode<T>, event: KeyboardEvent]
  nodeDrop: [source: TreeViewNode<T>, target: TreeViewNode<T> | null]
  draftCommit: [name: string, parentId: string | null]
  draftCancel: []
}>()
const root = ref<HTMLElement | null>(null)
const prefix = useId()
const rowId = (id: string) => `${prefix}:node:${id}`
const iconSize = useShellFrame() === 'mobile' ? 16 : 14
const picking = computed(() => props.mode === 'pick')
const visibleNodes = computed(() => (picking.value ? branchesOnly(props.nodes) : props.nodes))
const dnd = useTreeDragDrop({
  nodes: () => visibleNodes.value,
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
  nodes: () => visibleNodes.value,
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

const draftName = ref('')
type NameField = { commit: () => void; cancel: () => void; reset: () => void }
const draftInput = ref<NameField | null>(null)
// A function ref: the draft row sits inside the rows' v-for, where a string ref collects an array.
function setDraftInput(el: unknown) {
  draftInput.value = el != null && typeof el === 'object' && 'commit' in el && 'reset' in el ? (el as NameField) : null
}
const draftAt = computed(() => (props.draft ? draftPosition(rows.value, props.draft.parentId) : null))
type Entry = { key: string; row: TreeViewRow<T> | null }
const entries = computed<Entry[]>(() => {
  const list: Entry[] = rows.value.map((row) => ({ key: row.node.id, row }))
  // Keyed by its parent so a draft moved elsewhere mounts a fresh field, which focuses itself.
  if (draftAt.value) list.splice(draftAt.value.index, 0, { key: `${prefix}:draft:${props.draft?.parentId ?? ''}`, row: null })
  return list
})
watch(
  () => props.draft,
  (draft) => {
    draftName.value = draft?.value ?? ''
    // A draft the consumer re-issued in place (a clash, a failed create) gets a live, focused field again.
    if (draft) draftInput.value?.reset()
  },
  { immediate: true },
)

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

function commitDraft(name: string) {
  if (props.draft) emit('draftCommit', name, props.draft.parentId)
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
    <ScrollArea v-bind="$attrs" class="tree-view-area" content-class="tree-view-content">
      <div ref="root" class="tree-view" role="tree" :aria-label="label">
        <template v-for="entry in entries" :key="entry.key">
          <Row v-if="!entry.row && draft && draftAt" class="tree-view-node tree-view-draft"
            role="treeitem" :depth="draftAt.depth" :aria-level="draftAt.depth + 1" :aria-label="draft.label" plain>
            <span v-if="hasBranches" class="glyph" aria-hidden="true" />
            <span v-if="draft.icon" class="glyph" aria-hidden="true"><Icon :name="draft.icon" :size="iconSize" /></span>
            <InlineNameInput :ref="setDraftInput" v-model="draftName" :label="draft.label" :placeholder="draft.placeholder"
              @commit="commitDraft" @cancel="emit('draftCancel')" />
            <IconButton size="row" icon="lu:check" :aria-label="draft.confirmLabel ?? 'Create'" :disabled="!draftName.trim()"
              @click.stop="draftInput?.commit()" />
            <IconButton size="row" icon="lu:x" :aria-label="draft.cancelLabel ?? 'Cancel'" @click.stop="draftInput?.cancel()" />
          </Row>
          <TreeDragTarget v-else-if="entry.row" :id="rowId(entry.row.node.id)" :node-id="entry.row.node.id"
            :draggable="dnd.canDrag(entry.row.node)" :droppable="dnd.canDrop(entry.row.node)" v-slot="{ setElement }">
            <Row
              :ref="setElement"
              :id="rowId(entry.row.node.id)"
              class="tree-view-node"
              :class="{ 'drop-target': dnd.target.value?.id === entry.row.node.id, 'drag-source': dnd.source.value?.id === entry.row.node.id }"
              role="treeitem"
              :depth="entry.row.depth"
              :selected="entry.row.node.id === selectedId"
              :disabled="entry.row.node.disabled"
              :aria-label="entry.row.node.ariaLabel ?? entry.row.node.label"
              :aria-description="entry.row.node.description"
              :title="entry.row.node.description"
              :aria-level="entry.row.depth + 1"
              :aria-posinset="entry.row.position"
              :aria-setsize="entry.row.siblings"
              :aria-selected="entry.row.node.id === selectedId"
              :aria-expanded="entry.row.branch ? entry.row.expanded : undefined"
              :aria-disabled="entry.row.node.disabled || undefined"
              :tabindex="entry.row.node.id === focusedId ? 0 : -1"
              @focus="focusedId = entry.row.node.id"
              @click="click(entry.row.node, $event)"
              @contextmenu="contextmenu(entry.row.node, $event)"
              @keydown.self="keydown(entry.row.node, $event)"
            >
              <span v-if="hasBranches" class="glyph" aria-hidden="true">
                <Icon v-if="entry.row.branch" :name="entry.row.expanded ? 'lu:chevron-down' : 'lu:chevron-right'" :size="iconSize" />
              </span>
              <span v-if="entry.row.node.icon" class="glyph" aria-hidden="true"><Icon :name="entry.row.node.icon" :size="iconSize" /></span>
              <span class="tree-view-label" :class="{ lined: entry.row.node.detail }"
                ><slot name="label" :node="entry.row.node">{{ entry.row.node.label }}</slot
                ><span v-if="entry.row.node.detail" class="tree-view-detail">{{ entry.row.node.detail }}</span></span
              >
              <slot name="actions" :node="entry.row.node" />
              <span v-if="(picking || markSelected) && entry.row.node.id === selectedId" class="glyph pick-mark" aria-hidden="true">
                <Icon name="lu:check" :size="iconSize" />
              </span>
            </Row>
          </TreeDragTarget>
        </template>
        <slot v-if="!rows.length && !draft" name="empty" />
        <TreeDragTarget v-if="dragDrop?.rootLabel" :id="`${prefix}:root`" :node-id="null"
          :draggable="false" :droppable="dnd.canDrop(null)" v-slot="{ setElement }">
          <div :ref="setElement" class="tree-root-drop" :class="{ 'drop-target': dnd.target.value === null }" role="presentation">
            <span v-if="dnd.canDrop(null)">{{ dragDrop.rootLabel }}</span>
          </div>
        </TreeDragTarget>
      </div>
    </ScrollArea>
  </DragDropProvider>
</template>

<style scoped>
.tree-view-area {
  flex: 1;
}

/* The content is at least the viewport's height; the tree fills it so the root drop zone below the
   last row still reaches the bottom of the box. */
.tree-view-area :deep(.tree-view-content) {
  display: flex;
  flex-direction: column;
}

.tree-view {
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
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

.row.tree-view-node.touch {
  gap: 12px;
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

.tree-view-label.lined {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tree-view-detail {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--gray-11);
  font-size: var(--font-size-xs);
}

.selected .tree-view-detail {
  color: var(--accent-11);
}

.selected .glyph {
  color: var(--accent-11);
}

.disabled .glyph {
  color: var(--gray-9);
}

.row.tree-view-draft {
  cursor: default;
}

/* The draft's two buttons fill the touch row edge to edge, like the mock's; the row's own right inset
   would only eat into their hit area. */
.row.tree-view-draft.touch {
  padding-right: 0;
}

.tree-view-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
