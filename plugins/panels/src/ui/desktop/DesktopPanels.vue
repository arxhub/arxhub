<script setup lang="ts">
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { computed, onMounted, onUnmounted } from 'vue'
import { type DropZone, isPanelTabDragData } from '../../composables/drag-types'
import type { PanelStore } from '../../types'
import LayoutRenderer from '../LayoutRenderer.vue'

const props = defineProps<{ store: PanelStore }>()

const layout = computed(() => props.store.layout.value)

let cleanup: (() => void) | null = null

// Tiling is a pointer affordance, so the monitor belongs to the frame that has a pointer — on a phone
// there is no tab strip to drag a document out of, and nothing here is loaded at all.
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
        props.store.movePanel(instanceId, fromGroupId, destGroupId, insertIndex)
      } else if (dest.data.type === 'tab-bar') {
        const destGroupId = dest.data.groupId as string
        const destGroup = props.store.groups.value[destGroupId]
        props.store.movePanel(instanceId, fromGroupId, destGroupId, destGroup?.instances.length ?? 0)
      } else if (dest.data.type === 'panel-group-body') {
        const destGroupId = dest.data.groupId as string
        const zone = (dest.data.zone as DropZone) ?? 'center'
        props.store.movePanelToZone(instanceId, fromGroupId, destGroupId, zone)
      }
    },
  })
})

onUnmounted(() => {
  cleanup?.()
})
</script>

<template>
  <LayoutRenderer v-if="layout" :node="layout" />
  <div v-else class="panels-empty">
    <p>No panels open</p>
  </div>
</template>

<style scoped>
.panels-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--gray-10);
  font-size: 13px;
}
</style>
