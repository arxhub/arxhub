<script setup lang="ts">
import { basename, dirname, posix } from '@arxhub/path'
import { NOTES_TYPE_ID } from '@arxhub/plugin-notes'
import { ShellExtension } from '@arxhub/plugin-shell'
import { actionMenu, Icon, type TreeDragDropOptions, TreeView, type TreeViewNode } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, onMounted, ref, watch } from 'vue'
import { ExplorerExtension, type TreeNode } from '../explorer-extension'
import FileRowActions from './FileRowActions.vue'
import FileTreeLabel from './FileTreeLabel.vue'
import { fileIcon } from './file-icon'
import { useFileActions } from './use-file-actions'
import VaultStrip from './VaultStrip.vue'

const arxhub = useArxHub()
const explorer = arxhub.extensions.get(ExplorerExtension)
const actions = useFileActions()

function mapNode(node: TreeNode): TreeViewNode<TreeNode> {
  return {
    id: node.entry.pathname,
    label: explorer.displayName(node).text,
    ariaLabel: basename(node.entry.pathname),
    description: node.pending ? 'On the server — opens on demand' : undefined,
    icon: explorer.iconFor(node) ?? fileIcon(node),
    branch: node.entry.kind === 'dir',
    children: node.children?.map(mapNode),
    data: node,
  }
}
const nodes = computed(() => explorer.tree.value.map(mapNode))
const expandedIds = computed(() => explorer.expandedPaths())
const moving = ref(false)
const dragDrop: TreeDragDropOptions<TreeNode> | undefined =
  useShellFrame() === 'desktop'
    ? {
        rootLabel: 'Move to vault root',
        canDrag: ({ data }) => !moving.value && !explorer.renamingPath.value && !data.pending,
        canDrop: ({ data: source }, target) => explorer.canMoveEntry(source.entry.pathname, target?.data.entry.pathname ?? explorer.root),
      }
    : undefined

function move(source: TreeViewNode<TreeNode>, target: TreeViewNode<TreeNode> | null) {
  const folder = target?.id ?? explorer.root
  moving.value = true
  actions.runAction(
    (async () => {
      try {
        await explorer.moveEntry(source.id, posix.join(folder, posix.basename(source.id)))
        explorer.selectedPath.value = folder
      } finally {
        moving.value = false
      }
    })(),
    `move ${source.ariaLabel ?? source.label}`,
  )
}

function activate({ data: node }: TreeViewNode<TreeNode>) {
  if (explorer.renamingPath.value === node.entry.pathname) return
  explorer.selectedPath.value = node.entry.kind === 'dir' ? node.entry.pathname : dirname(node.entry.pathname)
  if (node.entry.kind === 'file') actions.openFile(node)
}

function toggle({ data: node }: TreeViewNode<TreeNode>, expanded: boolean) {
  if (explorer.renamingPath.value === node.entry.pathname) return
  if (expanded) actions.runAction(explorer.expand(node), 'expand the folder')
  else explorer.collapse(node)
}

function contextmenu({ data: node }: TreeViewNode<TreeNode>, event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  actionMenu.open(actions.getNodeActions(node), { x: event.clientX, y: event.clientY, title: basename(node.entry.pathname) })
}

function keydown({ data: node }: TreeViewNode<TreeNode>, event: KeyboardEvent) {
  if (event.key !== 'F2') return
  event.preventDefault()
  event.stopPropagation()
  actions.startRename(node)
}

const storage = arxhub.extensions.get(ShellExtension).workspaceStorage
const saved = storage.navOf(NOTES_TYPE_ID)
const expanded = Array.isArray(saved) ? saved.filter((path): path is string => typeof path === 'string') : []
let restored = false
onMounted(() => {
  actions.runAction(
    (async () => {
      try {
        await explorer.loadRoot()
        await explorer.restoreExpanded(expanded)
      } finally {
        restored = true
      }
    })(),
    'load the files',
  )
})
watch(
  () => explorer.expandedPaths(),
  (paths) => {
    if (restored) storage.setNav(NOTES_TYPE_ID, paths)
  },
  { deep: true },
)

function onRootContextMenu(event: MouseEvent) {
  actionMenu.open(actions.getRootActions(), { x: event.clientX, y: event.clientY })
}
</script>

<template>
  <div class="file-tree-wrap">
    <VaultStrip />

    <TreeView
      class="file-tree"
      :nodes="nodes"
      label="Files"
      :selected-id="explorer.selectedPath.value"
      :expanded-ids="expandedIds"
      :drag-drop="dragDrop"
      @node-drop="move"
      @activate="activate"
      @toggle="toggle"
      @node-contextmenu="contextmenu"
      @node-keydown="keydown"
      @contextmenu.prevent="onRootContextMenu"
    >
      <template #label="{ node }"><FileTreeLabel :node="node.data" /></template>
      <template #actions="{ node }">
        <Icon v-if="node.data.propertiesCardPath" name="lu:tags" :size="14" aria-label="Has properties" class="properties-glyph" />
        <FileRowActions v-if="explorer.renamingPath.value !== node.id" :title="node.ariaLabel ?? node.label" :items="() => actions.getNodeActions(node.data)" />
      </template>
    </TreeView>
  </div>
</template>

<style scoped>
.file-tree-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.properties-glyph {
  flex-shrink: 0;
  color: var(--gray-10);
}
</style>
