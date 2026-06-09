<script setup lang="ts">
import { basename, dirname } from '@arxhub/path'
import { actionMenu } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed, nextTick, ref, watch } from 'vue'
import { ExplorerExtension, type TreeNode } from '../explorer-extension'
import { useFileActions } from './use-file-actions'

const props = withDefaults(defineProps<{ node: TreeNode; depth?: number }>(), { depth: 0 })

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

async function commitRename() {
  if (!renaming.value) return
  const newName = renameValue.value.trim()
  explorer.renamingPath.value = null
  if (newName && newName !== basename(props.node.entry.pathname)) {
    await explorer.renameEntry(props.node.entry.pathname, newName)
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
    tabindex="0"
    @click="handleClick"
    @dblclick.prevent="handleDblClick"
    @contextmenu.prevent.stop="onContextMenu"
    @keydown.f2.prevent.stop="actions.startRename(node)"
    @keydown.enter.prevent="handleEnter"
  >
    <span class="chevron">
      <template v-if="node.entry.kind === 'dir'">{{ node.expanded ? '▾' : '▸' }}</template>
    </span>

    <input
      v-if="renaming"
      ref="renameInput"
      v-model="renameValue"
      class="rename-input"
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
  padding-top: 2px;
  padding-bottom: 2px;
  padding-right: 8px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
  font-size: 13px;
}

.tree-node:hover {
  background-color: var(--gray-4);
}

.tree-node.selected {
  background-color: var(--gray-5);
}

.tree-node:focus-visible {
  outline: 1px solid var(--accent-9);
  outline-offset: -1px;
}

.chevron {
  width: 12px;
  flex-shrink: 0;
  font-size: 10px;
  color: var(--gray-9);
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.rename-input {
  flex: 1;
  min-width: 0;
  background: var(--gray-2);
  border: 1px solid var(--accent-9);
  border-radius: 2px;
  color: var(--gray-12);
  font-size: 13px;
  font-family: var(--font-sans);
  padding: 0 4px;
  outline: none;
}
</style>
