<script setup lang="ts">
import { actionMenu, Button, Toolbar } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { onMounted } from 'vue'
import { ExplorerExtension } from '../explorer-extension'
import FileTreeNode from './FileTreeNode.vue'
import { useFileActions } from './use-file-actions'

const arxhub = useArxHub()
const explorer = arxhub.extensions.get(ExplorerExtension)
const actions = useFileActions()

onMounted(() => {
  explorer.loadRoot()
})

// Right-click on empty tree space → root actions (New File / New Folder).
function onRootContextMenu(event: MouseEvent) {
  actionMenu.open(actions.getRootActions(), { x: event.clientX, y: event.clientY })
}

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
      <Button variant="secondary" size="sm" title="New File" @click="newFile">＋ File</Button>
      <Button variant="secondary" size="sm" title="New Folder" @click="newFolder">＋ Folder</Button>
    </Toolbar>

    <div class="file-tree" @contextmenu.prevent="onRootContextMenu">
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
  padding: 4px 0;
}
</style>
