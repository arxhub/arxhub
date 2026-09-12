<script setup lang="ts">
import { NOTES_TYPE_ID } from '@arxhub/plugin-notes/ui'
import { ShellExtension, useNavHost } from '@arxhub/plugin-shell/ui'
import { actionMenu, IconButton, Strip } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { onMounted, watch } from 'vue'
import { ExplorerExtension } from '../explorer-extension'
import FileTreeNode from './FileTreeNode.vue'
import { useFileActions } from './use-file-actions'
import { useTreeNavigation } from './use-tree-navigation'

const arxhub = useArxHub()
const explorer = arxhub.extensions.get(ExplorerExtension)
// The frame's own control over this navigation: collapse the column on the desktop, put the panel away
// on the phone. It is contributed into this strip rather than drawn in a head of the frame's own above
// it — two bands for one role is what that would be. Absent wherever the tree is not a frame's
// navigation, and then there is simply no button.
const navHost = useNavHost()
const actions = useFileActions()
const { onKeydown } = useTreeNavigation(explorer.tree, explorer)

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

// Right-click on empty tree space → root actions (New File / New Folder).
function onRootContextMenu(event: MouseEvent) {
  actionMenu.open(actions.getRootActions(), { x: event.clientX, y: event.clientY })
}

// Through runAction, like the context menu: these buttons awaited the write with nothing to catch it, so
// a refused create was an unhandled rejection in the console and a button that appeared to do nothing.
function newFile() {
  const parent = explorer.selectedPath.value ?? explorer.root
  actions.runAction(actions.createFile(parent), 'create the file')
}

function newFolder() {
  const parent = explorer.selectedPath.value ?? explorer.root
  actions.runAction(explorer.createDir(parent, 'new-folder'), 'create the folder')
}
</script>

<template>
  <div class="file-tree-wrap">
    <!-- "Vault" is the one VFS root there is today — a stand-in for a name that becomes per-root once
         more than one can be connected at once (see ExplorerExtension for the rest of that note). -->
    <Strip title="Vault" flush-actions>
      <template #actions>
        <IconButton size="lg" icon="lu:folder-plus" tooltip="New folder" @click="newFolder" />
        <IconButton size="lg" icon="lu:file-plus" tooltip="New file" @click="newFile" />
        <IconButton size="lg" icon="lu:refresh-cw" tooltip="Refresh" @click="actions.runAction(explorer.loadRoot(), 'refresh the files')" />
        <IconButton size="lg" icon="lu:chevrons-down-up" tooltip="Collapse tree" @click="explorer.collapseAll()" />
        <IconButton
          v-if="navHost != null"
          size="lg"
          :icon="navHost.icon"
          data-testid="nav-toggle"
          :tooltip="navHost.label"
          @click="navHost.dismiss()"
        />
      </template>
    </Strip>

    <div class="file-tree" role="tree" aria-label="Files" @contextmenu.prevent="onRootContextMenu" @keydown="onKeydown">
      <FileTreeNode
        v-for="node in explorer.tree.value"
        :key="node.entry.pathname"
        :node="node"
      />
    </div>
  </div>
</template>

<style scoped>
.file-tree-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.file-tree {
  overflow-y: auto;
  flex: 1;
}
</style>
