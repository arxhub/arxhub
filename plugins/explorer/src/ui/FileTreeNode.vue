<script setup lang="ts">
import { basename, dirname } from '@arxhub/path'
import { actionMenu, Icon } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed, nextTick, ref, watch } from 'vue'
import { ExplorerExtension, type TreeNode } from '../explorer-extension'
import { useFileActions } from './use-file-actions'

const props = withDefaults(defineProps<{ node: TreeNode; depth?: number }>(), { depth: 0 })

// Which kind of thing a row is, at a glance. Without this a folder and a note differ only by the
// presence of a chevron, which is 16px of empty space on every leaf row — you have to read the
// extension to know what you are looking at.
//
// TODO(06-explorer F-12): this mapping belongs in a swappable icon set, not in the tree. The pack
// layer already exists (`registerIconPack` in uikit); what is hardcoded here is the *matching* rule,
// so an icon for a new file type means editing this component. Extract it the way themes were —
// a registry a set registers into, chosen from Appearance — and add matching by exact filename and
// by folder name while doing it.
const PROSE = new Set(['md', 'markdown', 'txt', 'arx'])
const CODE = new Set(['ts', 'tsx', 'js', 'jsx', 'vue', 'json', 'css', 'html', 'sh', 'py', 'rs', 'go', 'toml', 'yml', 'yaml', 'sql'])
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif'])

const typeIcon = computed((): string => {
  if (props.node.entry.kind === 'dir') return props.node.expanded ? 'lu:folder-open' : 'lu:folder'
  const ext = basename(props.node.entry.pathname).split('.').pop()?.toLowerCase() ?? ''
  if (PROSE.has(ext)) return 'lu:file-text'
  if (CODE.has(ext)) return 'lu:file-code'
  if (IMAGE.has(ext)) return 'lu:file-image'
  return 'lu:file'
})

const arxhub = useArxHub()
const explorer = arxhub.extensions.get(ExplorerExtension)
const actions = useFileActions()

function onContextMenu(event: MouseEvent) {
  actionMenu.open(actions.getNodeActions(props.node), {
    x: event.clientX,
    y: event.clientY,
    title: basename(props.node.entry.pathname),
  })
}

// ── inline rename (shared state: only one node renames at a time) ───────────────
const renaming = computed(() => explorer.renamingPath.value === props.node.entry.pathname)
const renameValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

watch(renaming, async (active) => {
  if (!active) return
  renameValue.value = basename(props.node.entry.pathname)
  await nextTick()
  renameInput.value?.select()
})

function commitRename() {
  if (!renaming.value) return
  const newName = renameValue.value.trim()
  explorer.renamingPath.value = null
  if (newName && newName !== basename(props.node.entry.pathname)) {
    actions.runAction(explorer.renameEntry(props.node.entry.pathname, newName), `rename to ${newName}`)
  }
}

function cancelRename() {
  explorer.renamingPath.value = null
}

// ── click / expand ────────────────────────────────────────────────────────────
async function handleClick() {
  if (renaming.value) return
  // selectedPath always points to a directory so the toolbar knows where to create
  explorer.selectedPath.value = props.node.entry.kind === 'dir' ? props.node.entry.pathname : dirname(props.node.entry.pathname)
  if (props.node.entry.kind === 'dir') {
    if (props.node.expanded) {
      explorer.collapse(props.node)
    } else {
      await explorer.expand(props.node)
    }
  } else {
    actions.openFile(props.node, true)
  }
}

function handleDblClick() {
  if (renaming.value) return
  // Double-clicking a file promotes it to a permanent tab; folders are handled by the single click
  if (props.node.entry.kind === 'file') actions.openFile(props.node, false)
}

function handleEnter() {
  if (renaming.value) return
  if (props.node.entry.kind === 'file') actions.openFile(props.node, false)
  else handleClick()
}
</script>

<template>
  <div
    class="tree-node"
    :class="{ selected: explorer.selectedPath.value === node.entry.pathname }"
    :style="{ paddingLeft: `${depth * 16 + 8}px` }"
    :data-path="node.entry.pathname"
    role="treeitem"
    :aria-label="basename(node.entry.pathname)"
    :aria-level="depth + 1"
    :aria-selected="explorer.selectedPath.value === node.entry.pathname"
    :aria-expanded="node.entry.kind === 'dir' ? node.expanded : undefined"
    tabindex="0"
    @click="handleClick"
    @dblclick.prevent="handleDblClick"
    @contextmenu.prevent.stop="onContextMenu"
    @keydown.f2.prevent.stop="actions.startRename(node)"
    @keydown.enter.prevent="handleEnter"
  >
    <span class="chevron">
      <Icon v-if="node.entry.kind === 'dir'" :name="node.expanded ? 'lu:chevron-down' : 'lu:chevron-right'" :size="14" />
    </span>
    <span class="type-glyph">
      <Icon :name="typeIcon" :size="14" />
    </span>

    <input
      v-if="renaming"
      ref="renameInput"
      v-model="renameValue"
      class="rename-input"
      aria-label="New name"
      @keydown.enter.prevent.stop="commitRename"
      @keydown.escape.prevent.stop="cancelRename"
      @blur="commitRename"
      @click.stop
      @dblclick.stop
    />
    <span v-else class="name">{{ basename(node.entry.pathname) || node.entry.pathname }}</span>
  </div>

  <template v-if="node.expanded && node.children">
    <FileTreeNode
      v-for="child in node.children"
      :key="child.entry.pathname"
      :node="child"
      :depth="depth + 1"
    />
  </template>
</template>

<style scoped>
.tree-node {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  margin-right: 4px;
  padding-right: 8px;
  border-radius: var(--radius-xs);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
  font-size: var(--font-size-sm);
  color: var(--gray-12);
}

.tree-node:hover {
  background-color: var(--gray-4);
}

/* The selected row is the one place in the tree that spends the accent — a wash and accent text,
   so it stays legible against a plain hover fill on the row above it. */
.tree-node.selected {
  background-color: var(--accent-3);
  color: var(--accent-11);
  font-weight: var(--font-weight-medium);
}

.tree-node:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.chevron,
.type-glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--size-xs-half);
  flex-shrink: 0;
  color: var(--gray-10);
}

/* The glyph follows the row's own colour when selected, so a selected row reads as one object rather
   than as accent text next to a grey icon. */
.tree-node.selected .type-glyph,
.tree-node.selected .chevron {
  color: var(--accent-11);
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.rename-input {
  flex: 1;
  min-width: 0;
  height: 24px;
  background: var(--gray-1);
  border: 1px solid var(--accent-8);
  border-radius: var(--radius-xs);
  color: var(--gray-12);
  font-size: var(--font-size-sm);
  font-family: var(--font-sans);
  padding: 0 4px;
  outline: none;
}
</style>
