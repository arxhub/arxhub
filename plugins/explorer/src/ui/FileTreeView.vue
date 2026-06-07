<script setup lang="ts">
import { Button, ContextMenu, MenuItem, Toolbar } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { onMounted, provide, ref } from 'vue'
import { ExplorerExtension, type TreeNode } from '../explorer-extension'
import FileTreeNode from './FileTreeNode.vue'
import { SetContextTargetKey, useFileActions } from './use-file-actions'

const arxhub = useArxHub()
const explorer = arxhub.extensions.get(ExplorerExtension)
const actions = useFileActions()

// A single shared context menu for the whole tree — the right-clicked row registers itself here.
const contextTarget = ref<TreeNode | null>(null)
provide(SetContextTargetKey, (node: TreeNode) => {
  contextTarget.value = node
})

function clearContextTarget() {
  contextTarget.value = null
}

onMounted(() => {
  explorer.loadRoot()
})

async function newFile() {
  const parent = explorer.selectedPath.value ?? explorer.root
  await explorer.createFile(parent, 'untitled.arx')
}

async function newFolder() {
  const parent = explorer.selectedPath.value ?? explorer.root
  await explorer.createDir(parent, 'new-folder')
}
</script>

<template>
  <div class="file-tree-wrap">
    <Toolbar :gap="4">
      <Button variant="icon" size="sm" title="New File" @click="newFile">＋ File</Button>
      <Button variant="icon" size="sm" title="New Folder" @click="newFolder">＋ Folder</Button>
    </Toolbar>

    <ContextMenu>
      <template #trigger>
        <!-- capture resets the target first; a row's bubble-phase handler then sets it -->
        <div class="file-tree" @contextmenu.capture="clearContextTarget">
          <FileTreeNode
            v-for="node in explorer.tree.value"
            :key="node.entry.pathname"
            :node="node"
          />
        </div>
      </template>

      <template v-if="contextTarget?.entry.kind === 'file'">
        <MenuItem value="open" @select="contextTarget && actions.openFile(contextTarget, false)">Open</MenuItem>
        <MenuItem value="rename" @select="contextTarget && actions.startRename(contextTarget)">Rename</MenuItem>
        <MenuItem value="delete" variant="danger" @select="contextTarget && actions.confirmDelete(contextTarget)">Delete</MenuItem>
      </template>
      <template v-else-if="contextTarget?.entry.kind === 'dir'">
        <MenuItem value="new-file" @select="contextTarget && actions.newFile(contextTarget)">New File</MenuItem>
        <MenuItem value="new-folder" @select="contextTarget && actions.newFolder(contextTarget)">New Folder</MenuItem>
        <MenuItem value="rename" @select="contextTarget && actions.startRename(contextTarget)">Rename</MenuItem>
        <MenuItem value="delete" variant="danger" @select="contextTarget && actions.confirmDelete(contextTarget)">Delete</MenuItem>
      </template>
      <template v-else>
        <MenuItem value="new-file" @select="newFile">New File</MenuItem>
        <MenuItem value="new-folder" @select="newFolder">New Folder</MenuItem>
      </template>
    </ContextMenu>
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
  padding: 4px 0;
}
</style>
