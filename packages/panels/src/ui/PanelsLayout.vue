<script setup lang="ts">
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { computed, onMounted, onUnmounted } from 'vue'
import { isPanelTabDragData } from '../composables/drag-types'
import { usePanels } from '../use-panels'
import LayoutRenderer from './LayoutRenderer.vue'

const store = usePanels()
const layout = computed(() => store.layout.value)

let cleanup: (() => void) | null = null

onMounted(() => {
  cleanup = monitorForElements({
    canMonitor: ({ source }) => source.data.type === 'panel-tab',
    onDrop: ({ source, location }) => {
      if (!isPanelTabDragData(source.data)) return

      // pdnd orders dropTargets innermost-first. Expected priority:
      // 1. panel-tab  — specific tab edge, provides insertion index
      // 2. tab-bar    — empty bar area, appends to end of group
      // 3. panel-group-body — panel content area, appends to end of group
      const dest = location.current.dropTargets[0]
      if (!dest) return

      const { instanceId, groupId: fromGroupId } = source.data

      if (dest.data.type === 'panel-tab') {
        if (!isPanelTabDragData(dest.data)) return
        const { groupId: destGroupId, index: destIndex } = dest.data
        const edge = extractClosestEdge(dest.data)
        const insertIndex = edge === 'left' ? destIndex : destIndex + 1
        store.movePanel(instanceId, fromGroupId, destGroupId, insertIndex)
      } else if (dest.data.type === 'tab-bar' || dest.data.type === 'panel-group-body') {
        const destGroupId = dest.data.groupId as string
        const destGroup = store.groups.value[destGroupId]
        store.movePanel(instanceId, fromGroupId, destGroupId, destGroup?.instances.length ?? 0)
      }
    },
  })
})

onUnmounted(() => {
  cleanup?.()
})
</script>

<template>
  <div class="panels-layout">
    <LayoutRenderer v-if="layout" :node="layout" />
    <div v-else class="panels-empty">
      <p>No panels open</p>
    </div>
  </div>
</template>

<style scoped>
.panels-layout {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.panels-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--gray-8);
  font-size: var(--font-size-sm);
}
</style>
