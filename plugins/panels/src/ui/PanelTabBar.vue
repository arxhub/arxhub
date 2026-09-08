<script setup lang="ts">
import { IconButton, Strip } from '@arxhub/uikit/core'
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { usePanels } from '../use-panels'
import DraggableTab from './DraggableTab.vue'

const props = defineProps<{
  groupId: string
}>()

const store = usePanels()
const group = computed(() => store.groups.value[props.groupId])
const isActiveGroup = computed(() => store.activeGroupId.value === props.groupId)

const tabsEl = ref<HTMLElement | null>(null)
let cleanup: (() => void) | null = null

onMounted(() => {
  if (!tabsEl.value) return
  cleanup = dropTargetForElements({
    element: tabsEl.value,
    canDrop: ({ source }) => source.data.type === 'panel-tab',
    getData: () => ({ type: 'tab-bar', groupId: props.groupId }),
  })
})

onUnmounted(() => {
  cleanup?.()
})

function onTabClick(instanceId: string) {
  store.activateGroup(props.groupId)
  store.activatePanel(instanceId, props.groupId)
}

function onCloseTab(instanceId: string) {
  store.closePanel(instanceId, props.groupId)
}

function onSplit(direction: 'horizontal' | 'vertical') {
  const newGroupId = store.splitGroup(props.groupId, direction)
  const activeInstance = group.value?.instances.find((i) => i.instanceId === group.value?.activeInstanceId)
  if (activeInstance) {
    store.openPanel(activeInstance.definitionId, activeInstance.props, activeInstance.title, newGroupId)
  }
}
</script>

<template>
  <Strip class="panel-tab-bar" :class="{ 'is-active-group': isActiveGroup }" flush-actions>
    <div ref="tabsEl" class="tabs">
      <DraggableTab
        v-for="(instance, index) in group?.instances"
        :key="instance.instanceId"
        :instance-id="instance.instanceId"
        :group-id="groupId"
        :index="index"
        :title="instance.title"
        :is-active="isActiveGroup && instance.instanceId === group?.activeInstanceId"
        @click="onTabClick(instance.instanceId)"
        @close="onCloseTab(instance.instanceId)"
      />
    </div>
    <template #actions>
      <IconButton size="lg" icon="lu:columns-2" tooltip="Split right" @click="onSplit('horizontal')" />
      <IconButton size="lg" icon="lu:rows-2" tooltip="Split down" @click="onSplit('vertical')" />
    </template>
  </Strip>
</template>

<style scoped>
/* Geometry, surface and border come from the strip. Two deviations are this bar's own: tabs scroll
   sideways rather than pushing the split controls off the edge, and both of the strip's own insets are
   zeroed — its left padding exists to clear a title's text (Explorer's "Vault"), which this strip does
   not have, and its content-to-actions gap exists to separate a label from controls, not one row of
   tabs from another (the split icons read as more tabs, not a different zone). */
.panel-tab-bar {
  overflow: hidden;
}

/* Specificity has to beat the bare .strip rule these override — a single-class selector would tie
   with it and then depend on stylesheet insertion order between two components, which is not something
   to rely on (see .strip.flush-actions in Strip.vue for the same reasoning). */
.strip.panel-tab-bar {
  padding-left: 0;
  gap: 0;
}

/* :deep() because .strip-actions belongs to Strip's own template, not this one — a plain selector here
   only ever reaches PanelTabBar's own root (see the .strip.panel-tab-bar rule above), never a node
   nested inside a child component. Split-right and Split-down are two of a kind, not two different
   zones, so they get the same zero gap the tabs do below rather than Strip's base 4px. */
.panel-tab-bar :deep(.strip-actions) {
  gap: 0;
}

.tabs {
  display: flex;
  align-items: center;
  gap: 0;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
}

.tabs::-webkit-scrollbar {
  display: none;
}
</style>
