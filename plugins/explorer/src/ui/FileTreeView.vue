<script setup lang="ts">
import { onMounted } from 'vue'
import { useArxHub } from '@arxhub/uikit/hooks'
import { ExplorerExtension } from '../explorer-extension'
import FileTreeNode from './FileTreeNode.vue'

const arxhub = useArxHub()
const explorer = arxhub.extensions.get(ExplorerExtension)

onMounted(() => {
  explorer.loadRoot()
})
</script>

<template>
  <div class="file-tree">
    <FileTreeNode
      v-for="node in explorer.tree.value"
      :key="node.entry.pathname"
      :node="node"
    />
  </div>
</template>

<style scoped>
.file-tree {
  overflow-y: auto;
  height: 100%;
  padding: 4px 0;
}
</style>
