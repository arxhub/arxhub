<script setup lang="ts">
import { NOTES_TYPE_ID } from '@arxhub/plugin-notes'
import { ShellExtension } from '@arxhub/plugin-shell'
import { actionMenu, Strip } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { onMounted, watch } from 'vue'
import { ExplorerExtension } from '../explorer-extension'
import FileTreeNode from './FileTreeNode.vue'
import { useFileActions } from './use-file-actions'
import { useTreeNavigation } from './use-tree-navigation'
import VaultStripActions from './VaultStripActions.vue'

const arxhub = useArxHub()
const explorer = arxhub.extensions.get(ExplorerExtension)
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

function onRootContextMenu(event: MouseEvent) {
  actionMenu.open(actions.getRootActions(), { x: event.clientX, y: event.clientY })
}
</script>

<template>
  <div class="file-tree-wrap">
    <!-- "Vault" is the one VFS root there is today — a stand-in for a name that becomes per-root once
         more than one can be connected at once (see ExplorerExtension for the rest of that note). -->
    <Strip title="Vault" flush-actions>
      <template #actions>
        <VaultStripActions />
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
