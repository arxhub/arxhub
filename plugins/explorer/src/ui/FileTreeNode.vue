<script setup lang="ts">
import { basename, dirname, extname } from '@arxhub/path'
import { PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { useArxHub } from '@arxhub/uikit/hooks'
import { nextTick, ref } from 'vue'
import { ExplorerExtension, type TreeNode } from '../explorer-extension'

const props = withDefaults(defineProps<{ node: TreeNode; depth?: number }>(), { depth: 0 })

const arxhub = useArxHub()
const explorer = arxhub.extensions.get(ExplorerExtension)
const { store } = arxhub.extensions.get(PanelStoreExtension)

// ── context menu ──────────────────────────────────────────────────────────────
const menuVisible = ref(false)
const menuX = ref(0)
const menuY = ref(0)

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  menuX.value = e.clientX
  menuY.value = e.clientY
  menuVisible.value = true
  window.addEventListener('click', closeMenu, { once: true })
}

function closeMenu() {
  menuVisible.value = false
}

function openFile(preview: boolean) {
  closeMenu()
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
  closeMenu()
  const parent = props.node.entry.kind === 'dir' ? props.node.entry.pathname : dirname(props.node.entry.pathname)
  await explorer.createFile(parent, 'untitled.arx')
}

async function newFolder() {
  closeMenu()
  const parent = props.node.entry.kind === 'dir' ? props.node.entry.pathname : dirname(props.node.entry.pathname)
  await explorer.createDir(parent, 'new-folder')
}

async function deleteEntry() {
  closeMenu()
  await explorer.deleteEntry(props.node.entry.pathname)
}

// ── inline rename ─────────────────────────────────────────────────────────────
const renaming = ref(false)
const renameValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

async function startRename() {
  closeMenu()
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
  <div
    class="tree-node"
    :class="{ selected: explorer.selectedPath.value === node.entry.pathname }"
    :style="{ paddingLeft: `${depth * 16 + 8}px` }"
    tabindex="0"
    @click="handleClick"
    @dblclick.prevent="handleDblClick"
    @contextmenu="onContextMenu"
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

  <template v-if="node.expanded && node.children">
    <FileTreeNode
      v-for="child in node.children"
      :key="child.entry.pathname"
      :node="child"
      :depth="depth + 1"
    />
  </template>

  <!-- context menu -->
  <Teleport to="body">
    <div
      v-if="menuVisible"
      class="ctx-menu"
      :style="{ top: `${menuY}px`, left: `${menuX}px` }"
      @click.stop
    >
      <template v-if="node.entry.kind === 'file'">
        <button class="ctx-item" @click="openPermanent">Open</button>
        <button class="ctx-item" @click="startRename">Rename</button>
        <button class="ctx-item ctx-item--danger" @click="deleteEntry">Delete</button>
      </template>
      <template v-else>
        <button class="ctx-item" @click="newFile">New File</button>
        <button class="ctx-item" @click="newFolder">New Folder</button>
        <button class="ctx-item" @click="startRename">Rename</button>
        <button class="ctx-item ctx-item--danger" @click="deleteEntry">Delete</button>
      </template>
    </div>
  </Teleport>
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

.ctx-menu {
  position: fixed;
  z-index: 9999;
  background: var(--gray-2);
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  padding: 4px 0;
  min-width: 120px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.ctx-item {
  display: block;
  width: 100%;
  padding: 5px 12px;
  text-align: left;
  background: none;
  border: none;
  color: var(--gray-12);
  font-size: var(--font-size-xs);
  font-family: var(--font-sans);
  cursor: pointer;
}

.ctx-item:hover {
  background: var(--gray-4);
}

.ctx-item--danger {
  color: var(--red-9);
}

.ctx-item--danger:hover {
  background: var(--red-a3);
}
</style>
