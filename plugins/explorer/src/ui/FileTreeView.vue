<script setup lang="ts">
import { Button, Toolbar } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { onMounted } from 'vue'
import { ExplorerExtension } from '../explorer-extension'
import FileTreeNode from './FileTreeNode.vue'

const arxhub = useArxHub()
const explorer = arxhub.extensions.get(ExplorerExtension)

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
    <div class="file-tree">
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
