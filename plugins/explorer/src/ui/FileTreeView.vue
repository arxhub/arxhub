<script setup lang="ts">
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
    <div class="toolbar">
      <button class="tool-btn" title="New File" @click="newFile">＋ File</button>
      <button class="tool-btn" title="New Folder" @click="newFolder">＋ Folder</button>
    </div>
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

.toolbar {
  display: flex;
  gap: 4px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--gray-4);
  flex-shrink: 0;
}

.tool-btn {
  background: none;
  border: none;
  color: var(--gray-11);
  font-size: var(--font-size-xs);
  font-family: var(--font-sans);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.tool-btn:hover {
  background: var(--gray-4);
  color: var(--gray-12);
}

.file-tree {
  overflow-y: auto;
  flex: 1;
  padding: 4px 0;
}
</style>
