<script setup lang="ts">
import { basename, extname } from '@arxhub/path'
import { useArxHub } from '@arxhub/uikit/hooks'
import { PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { ExplorerExtension, type TreeNode } from '../explorer-extension'

const props = withDefaults(
  defineProps<{ node: TreeNode; depth?: number }>(),
  { depth: 0 },
)

const arxhub = useArxHub()
const explorer = arxhub.extensions.get(ExplorerExtension)
const { store } = arxhub.extensions.get(PanelStoreExtension)

async function handleClick() {
  if (props.node.entry.kind === 'dir') {
    if (props.node.expanded) {
      explorer.collapse(props.node)
    } else {
      await explorer.expand(props.node)
    }
  } else {
    const ext = extname(props.node.entry.pathname)
    const panels = store.getPanelsForFile(ext)
    if (panels.length > 0) {
      store.openPanel(
        panels[0].id,
        { path: props.node.entry.pathname },
        basename(props.node.entry.pathname),
        explorer.contentGroupId ?? undefined,
      )
    }
  }
}
</script>

<template>
  <div
    class="tree-node"
    :style="{ paddingLeft: `${depth * 16 + 8}px` }"
    @click="handleClick"
  >
    <span class="chevron">
      <template v-if="node.entry.kind === 'dir'">{{ node.expanded ? '▾' : '▸' }}</template>
    </span>
    <span class="name">{{ basename(node.entry.pathname) || node.entry.pathname }}</span>
  </div>
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
</style>
