<script setup lang="ts">
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { calculateDropZone, type DropZone, type PanelGroupBodyDropData } from '../composables/drag-types'
import { usePanels } from '../use-panels'
import PanelTabBar from './PanelTabBar.vue'
import PanelView from './PanelView.vue'
import SplitDropOverlay from './SplitDropOverlay.vue'

const props = defineProps<{
  groupId: string
}>()

const store = usePanels()
const group = computed(() => store.groups.value[props.groupId])
const isActiveGroup = computed(() => store.activeGroupId.value === props.groupId)

const panelContentEl = ref<HTMLElement | null>(null)
const activeZone = ref<DropZone | null>(null)
let cleanup: (() => void) | null = null

onMounted(() => {
  if (!panelContentEl.value) return
  const el = panelContentEl.value
  cleanup = dropTargetForElements({
    element: el,
    canDrop: ({ source }) => {
      if (source.data.type !== 'panel-tab') return false
      if (source.data.groupId !== props.groupId) return true
      // Same group: only allow split zones if there are 2+ tabs
      return (store.groups.value[props.groupId]?.instances.length ?? 0) > 1
    },
    getData: ({ input, element }): PanelGroupBodyDropData => ({
      type: 'panel-group-body',
      groupId: props.groupId,
      zone: calculateDropZone(input, element),
    }),
    onDrag: ({ location, source }) => {
      const zone = calculateDropZone(location.current.input, el)
      // Center zone from same group would be a no-op — don't show overlay
      if (source.data.groupId === props.groupId && zone === 'center') {
        activeZone.value = null
        return
      }
      activeZone.value = zone
    },
    onDragLeave: () => { activeZone.value = null },
    onDrop: () => { activeZone.value = null },
  })
})

onUnmounted(() => { cleanup?.() })

function onClick() {
  store.activateGroup(props.groupId)
}
</script>

<template>
  <div
    class="panel-group-view"
    :class="{ 'is-active': isActiveGroup }"
    @click="onClick"
  >
    <PanelTabBar :group-id="groupId" />
    <div
      ref="panelContentEl"
      class="panel-content"
    >
      <PanelView
        v-for="instance in group?.instances"
        :key="instance.instanceId"
        :instance="instance"
        :is-active="instance.instanceId === group?.activeInstanceId"
      />
      <SplitDropOverlay :zone="activeZone" />
    </div>
  </div>
</template>

<style scoped>
.panel-group-view {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 1px solid transparent;
}

.panel-group-view.is-active {
  border-color: var(--accent-7);
}

.panel-content {
  flex: 1;
  position: relative;
  overflow: hidden;
}
</style>
