<script setup lang="ts">
import type { LayoutNode } from '../types'
import { usePanels } from '../use-panels'
import PanelGroupView from './PanelGroupView.vue'
import ResizeHandle from './ResizeHandle.vue'

defineOptions({ name: 'LayoutRenderer' })

const props = defineProps<{
  node: LayoutNode
}>()

const store = usePanels()

function sizeStyle(ratio: number, direction: 'horizontal' | 'vertical') {
  return direction === 'horizontal' ? { width: `${ratio * 100}%`, height: '100%' } : { width: '100%', height: `${ratio * 100}%` }
}

function onResize(ratio: number) {
  if (props.node.type !== 'split') return
  store.setRatio(props.node.splitId, ratio)
}
</script>

<template>
  <PanelGroupView v-if="node.type === 'leaf'" :key="node.groupId" :group-id="node.groupId" />
  <div v-else class="split-container" :class="node.direction">
    <div class="split-pane" :style="sizeStyle(node.ratio, node.direction)">
      <LayoutRenderer :node="node.first" />
    </div>
    <ResizeHandle :direction="node.direction" @resize="onResize" />
    <div class="split-pane" :style="sizeStyle(1 - node.ratio, node.direction)">
      <LayoutRenderer :node="node.second" />
    </div>
  </div>
</template>

<style scoped>
.split-container {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.split-container.horizontal {
  flex-direction: row;
}

.split-container.vertical {
  flex-direction: column;
}

.split-pane {
  overflow: hidden;
  min-width: 0;
  min-height: 0;
}
</style>
