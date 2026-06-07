<script setup lang="ts">
import { IconButton } from '@arxhub/uikit/core'
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

function onPromoteTab(instanceId: string) {
  store.promotePanel(instanceId, props.groupId)
}

function onCloseTab(instanceId: string) {
  store.closePanel(instanceId, props.groupId)
}

function onSplit(direction: 'horizontal' | 'vertical') {
  const newGroupId = store.splitGroup(props.groupId, direction)
  const activeInstance = group.value?.instances.find((i) => i.instanceId === group.value?.activeInstanceId)
  if (activeInstance) {
    store.openPanel(activeInstance.definitionId, activeInstance.props, activeInstance.title, newGroupId, activeInstance.preview)
  }
}
</script>

<template>
  <div class="panel-tab-bar" :class="{ 'is-active-group': isActiveGroup }">
    <div ref="tabsEl" class="tabs">
      <DraggableTab
        v-for="(instance, index) in group?.instances"
        :key="instance.instanceId"
        :instance-id="instance.instanceId"
        :group-id="groupId"
        :index="index"
        :title="instance.title"
        :is-active="instance.instanceId === group?.activeInstanceId"
        :is-preview="!!instance.preview"
        @click="onTabClick(instance.instanceId)"
        @promote="onPromoteTab(instance.instanceId)"
        @close="onCloseTab(instance.instanceId)"
      />
    </div>
    <div class="actions">
      <IconButton icon="lu:columns-2" title="Split right" @click="onSplit('horizontal')" />
      <IconButton icon="lu:rows-2" title="Split down" @click="onSplit('vertical')" />
    </div>
  </div>
</template>

<style scoped>
.panel-tab-bar {
  display: flex;
  align-items: center;
  height: 36px;
  background-color: var(--gray-2);
  border-bottom: 1px solid var(--gray-4);
  flex-shrink: 0;
  overflow: hidden;
}

.tabs {
  display: flex;
  align-items: center;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
}

.tabs::-webkit-scrollbar {
  display: none;
}

.actions {
  display: flex;
  align-items: center;
  padding: 0 4px;
  gap: 2px;
  flex-shrink: 0;
}
</style>
