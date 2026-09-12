<script setup lang="ts">
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { computed, onMounted, onUnmounted, provide, shallowReactive, useId } from 'vue'
import { type DropZone, isPanelTabDragData } from '../../composables/drag-types'
import type { PanelStore } from '../../types'
import LayoutRenderer from '../LayoutRenderer.vue'
import PanelView from '../PanelView.vue'
import { PanelTargetsKey } from '../panel-targets'

const props = withDefaults(
  defineProps<{
    store: PanelStore
    mode?: 'tiled' | 'single'
  }>(),
  { mode: 'tiled' },
)

const targets = shallowReactive(new Map<string, HTMLElement>())
const parkingId = `panels-parking-${useId()}`
provide(PanelTargetsKey, targets)

const layout = computed(() => props.store.layout.value)

// One page at a time: no strip, no splits, and the rail is what switches. Every instance stays mounted
// and only the active one shows — a page keeps its state while it is off screen, which is what a staged
// settings draft depends on.
const pages = computed(() =>
  Object.entries(props.store.groups.value).flatMap(([groupId, group]) =>
    group.instances.map((instance) => ({
      groupId,
      instance,
      active: group.activeInstanceId === instance.instanceId && groupId === props.store.activeGroupId.value,
    })),
  ),
)

const current = computed(() => pages.value.find((page) => page.active) ?? pages.value[0])

let cleanup: (() => void) | null = null

// Tiling is a pointer affordance, so the monitor belongs to the frame that has a pointer — and to the
// mode that has a tab strip to drag a document out of in the first place.
onMounted(() => {
  if (props.mode === 'single') return
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
  <template v-if="mode === 'single'">
    <PanelView
      v-for="page in pages"
      :key="page.instance.instanceId"
      :instance="page.instance"
      :group-id="page.groupId"
      :is-active="page.instance.instanceId === current?.instance.instanceId"
    />
    <div v-if="!current" class="panels-empty">
      <p>Nothing open</p>
    </div>
  </template>
  <template v-else>
    <div :id="parkingId" hidden />
    <LayoutRenderer v-if="layout" :node="layout" />
    <Teleport v-for="page in pages" :key="page.instance.instanceId" :to="targets.get(page.groupId) ?? `#${parkingId}`" defer>
      <PanelView
        :instance="page.instance"
        :group-id="page.groupId"
        :is-active="page.instance.instanceId === store.groups.value[page.groupId]?.activeInstanceId"
      />
    </Teleport>
    <div v-if="!layout" class="panels-empty">
      <p>No panels open</p>
    </div>
  </template>
</template>

<style scoped>
.panels-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--gray-10);
  font-size: var(--font-size-sm);
}
</style>
