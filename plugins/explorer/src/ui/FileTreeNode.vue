<script setup lang="ts">
import { basename, dirname, extname } from '@arxhub/path'
import { PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { ContextMenu, MenuItem, modals } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { nextTick, ref } from 'vue'
import { ExplorerExtension, type TreeNode } from '../explorer-extension'

const props = withDefaults(defineProps<{ node: TreeNode; depth?: number }>(), { depth: 0 })

const arxhub = useArxHub()
const explorer = arxhub.extensions.get(ExplorerExtension)
const { store } = arxhub.extensions.get(PanelStoreExtension)

function openFile(preview: boolean) {
  const path = props.node.entry.pathname
  const ext = extname(path)
  const panels = store.getPanelsForFile(ext)
  if (panels.length === 0) return

  // Already open somewhere → focus it. A permanent open also promotes an existing preview tab.
  for (const [groupId, group] of Object.entries(store.groups.value)) {
    const instance = group.instances.find((i) => i.props?.path === path)
    if (instance) {
      store.activateGroup(groupId)
      store.activatePanel(instance.instanceId, groupId)
      if (!preview && instance.preview) store.promotePanel(instance.instanceId, groupId)
      return
    }
  }

  store.openPanel(panels[0].id, { path }, basename(path), explorer.contentGroupId ?? undefined, preview)
}

// VSCode behavior: single-click previews (reusable italic tab), double-click opens permanently
function openPreview() {
  openFile(true)
}

function openPermanent() {
  openFile(false)
}

async function newFile() {
  const parent = props.node.entry.kind === 'dir' ? props.node.entry.pathname : dirname(props.node.entry.pathname)
  await explorer.createFile(parent, 'untitled.arx')
}

async function newFolder() {
  const parent = props.node.entry.kind === 'dir' ? props.node.entry.pathname : dirname(props.node.entry.pathname)
  await explorer.createDir(parent, 'new-folder')
}

function confirmDelete() {
  const name = basename(props.node.entry.pathname)
  modals.openConfirmModal({
    title: 'Delete',
    content: `Delete "${name}"? This action cannot be undone.`,
    labels: { confirm: 'Delete', cancel: 'Cancel' },
    confirmProps: { danger: true },
    onConfirm: () => explorer.deleteEntry(props.node.entry.pathname),
  })
}

// ── inline rename ─────────────────────────────────────────────────────────────
const renaming = ref(false)
const renameValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

async function startRename() {
  renameValue.value = basename(props.node.entry.pathname)
  renaming.value = true
  await nextTick()
  renameInput.value?.select()
}

async function commitRename() {
  if (!renaming.value) return
  renaming.value = false
  const newName = renameValue.value.trim()
  if (newName && newName !== basename(props.node.entry.pathname)) {
    await explorer.renameEntry(props.node.entry.pathname, newName)
  }
}

function cancelRename() {
  renaming.value = false
}

// ── click / expand ────────────────────────────────────────────────────────────
async function handleClick() {
  if (renaming.value) return
  // selectedPath always points to a directory so toolbar knows where to create
  explorer.selectedPath.value = props.node.entry.kind === 'dir' ? props.node.entry.pathname : dirname(props.node.entry.pathname)
  if (props.node.entry.kind === 'dir') {
    if (props.node.expanded) {
      explorer.collapse(props.node)
    } else {
      await explorer.expand(props.node)
    }
  } else {
    openPreview()
  }
}

function handleDblClick() {
  if (renaming.value) return
  // Double-clicking a file promotes it to a permanent tab; folders are handled by the single click
  if (props.node.entry.kind === 'file') openPermanent()
}

function handleEnter() {
  if (renaming.value) return
  if (props.node.entry.kind === 'file') openPermanent()
  else handleClick()
}
</script>

<template>
  <ContextMenu>
    <template #trigger>
      <div
        class="tree-node"
        :class="{ selected: explorer.selectedPath.value === node.entry.pathname }"
        :style="{ paddingLeft: `${depth * 16 + 8}px` }"
        tabindex="0"
        @click="handleClick"
        @dblclick.prevent="handleDblClick"
        @keydown.f2.prevent.stop="startRename"
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
    </template>

    <template v-if="node.entry.kind === 'file'">
      <MenuItem value="open" @select="openPermanent">Open</MenuItem>
      <MenuItem value="rename" @select="startRename">Rename</MenuItem>
      <MenuItem value="delete" variant="danger" @select="confirmDelete">Delete</MenuItem>
    </template>
    <template v-else>
      <MenuItem value="new-file" @select="newFile">New File</MenuItem>
      <MenuItem value="new-folder" @select="newFolder">New Folder</MenuItem>
      <MenuItem value="rename" @select="startRename">Rename</MenuItem>
      <MenuItem value="delete" variant="danger" @select="confirmDelete">Delete</MenuItem>
    </template>
  </ContextMenu>

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
