<script setup lang="ts">
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { computed, inject, onBeforeUnmount, onMounted, onUnmounted, ref } from 'vue'
import { calculateDropZone, type DropZone, type PanelGroupBodyDropData } from '../composables/drag-types'
import { usePanels } from '../use-panels'
import PanelTabBar from './PanelTabBar.vue'
import PanelView from './PanelView.vue'
import { PanelTargetsKey } from './panel-targets'
import SplitDropOverlay from './SplitDropOverlay.vue'

const props = defineProps<{
  groupId: string
}>()

const targets = inject(PanelTargetsKey, null)
const store = usePanels()
const group = computed(() => store.groups.value[props.groupId])

const panelContentEl = ref<HTMLElement | null>(null)
const activeZone = ref<DropZone | null>(null)
let lastZone: DropZone = 'center'
let cleanup: (() => void) | null = null

onMounted(() => {
  if (!panelContentEl.value) return
  const el = panelContentEl.value
  targets?.set(props.groupId, el)
  cleanup = dropTargetForElements({
    element: el,
    canDrop: ({ source }) => {
      if (source.data.type !== 'panel-tab') return false
      if (source.data.groupId !== props.groupId) return true
      // Same group: only allow split zones if there are 2+ tabs
      return (store.groups.value[props.groupId]?.instances.length ?? 0) > 1
    },
    getData: (): PanelGroupBodyDropData => ({
      type: 'panel-group-body',
      groupId: props.groupId,
      // Read the zone last recorded by onDrag so the overlay and committed data are always in sync
      zone: lastZone,
    }),
    onDrag: ({ location, source }) => {
      const zone = calculateDropZone(location.current.input, el)
      lastZone = zone
      // Center zone from same group would be a no-op — don't show overlay
      if (source.data.groupId === props.groupId && zone === 'center') {
        activeZone.value = null
        return
      }
      activeZone.value = zone
    },
    onDragLeave: () => {
      activeZone.value = null
    },
    onDrop: () => {
      activeZone.value = null
    },
  })
})

onUnmounted(() => {
  cleanup?.()
})

onBeforeUnmount(() => {
  if (targets?.get(props.groupId) === panelContentEl.value) targets?.delete(props.groupId)
})

function onClick() {
  store.activateGroup(props.groupId)
}
</script>

<template>
  <div
    class="panel-group-view"
    @click="onClick"
  >
    <PanelTabBar :group-id="groupId" />
    <div
      ref="panelContentEl"
      class="panel-content"
    >
      <template v-if="targets == null">
      <PanelView
        v-for="instance in group?.instances"
        :key="instance.instanceId"
        :instance="instance"
        :group-id="groupId"
        :is-active="instance.instanceId === group?.activeInstanceId"
      />
      </template>
      <SplitDropOverlay :zone="activeZone" />
    </div>
  </div>
</template>

<style scoped>
/* The tab bar starts at the frame's top edge, level with navigation. A top border would push it down
   a pixel; split panes already have a resize handle separating them. */
.panel-group-view {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 1px solid var(--gray-6);
  border-top: 0;
}

.panel-content {
  flex: 1;
  position: relative;
  overflow: hidden;
}
</style>
