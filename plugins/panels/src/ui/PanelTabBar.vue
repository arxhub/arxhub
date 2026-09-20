<script setup lang="ts">
import { IconButton, Strip } from '@arxhub/uikit/core'
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
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
  store.requestClosePanel(instanceId, props.groupId)
}

function onSplit(direction: 'horizontal' | 'vertical') {
  if ((group.value?.instances.length ?? 0) < 2) return
  const activeInstance = group.value?.instances.find((i) => i.instanceId === group.value?.activeInstanceId)
  if (activeInstance) {
    const newGroupId = store.splitGroup(props.groupId, direction)
    store.movePanel(activeInstance.instanceId, props.groupId, newGroupId, 0)
  }
}
watch(
  () => group.value?.activeInstanceId,
  async () => {
    await nextTick()
    tabsEl.value
      ?.querySelector<HTMLElement>('[aria-selected="true"], [aria-pressed="true"], .active')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  },
)
</script>

<template>
  <Strip class="panel-tab-bar" :class="{ 'is-active-group': isActiveGroup }" flush>
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
      <IconButton size="lg" icon="lu:columns-2" tooltip="Split right" :disabled="(group?.instances.length ?? 0) < 2" @click="onSplit('horizontal')" />
      <IconButton size="lg" icon="lu:rows-2" tooltip="Split down" :disabled="(group?.instances.length ?? 0) < 2" @click="onSplit('vertical')" />
    </template>
  </Strip>
</template>

<style scoped>
.panel-tab-bar {
  overflow: hidden;
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
