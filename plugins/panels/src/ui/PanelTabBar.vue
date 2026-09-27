<script setup lang="ts">
// biome-ignore lint/style/useImportType: ScrollArea is also rendered in the template
import { IconButton, ScrollArea, Strip } from '@arxhub/uikit/core'
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { t } from '../i18n/messages'
import { panelTitle } from '../panel-title'
import { usePanels } from '../use-panels'
import DraggableTab from './DraggableTab.vue'
import { PanelChromeRegistryKey } from './panel-targets'

const props = defineProps<{
  groupId: string
}>()

const chrome = inject(PanelChromeRegistryKey, null)
const actionsEl = ref<HTMLElement | null>(null)
watchEffect((cleanup) => {
  const el = actionsEl.value
  const id = props.groupId
  if (el) chrome?.actions.set(id, el)
  cleanup(() => {
    if (chrome?.actions.get(id) === el) chrome.actions.delete(id)
  })
})
const store = usePanels()
const group = computed(() => store.groups.value[props.groupId])
const isActiveGroup = computed(() => store.activeGroupId.value === props.groupId)

const tabsArea = ref<InstanceType<typeof ScrollArea> | null>(null)
let cleanup: (() => void) | null = null

onMounted(() => {
  const viewport = tabsArea.value?.viewport
  if (!viewport) return
  cleanup = dropTargetForElements({
    element: viewport,
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
    tabsArea.value?.viewport
      ?.querySelector<HTMLElement>('[aria-selected="true"], [aria-pressed="true"], .active')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  },
)
</script>

<template>
  <Strip class="panel-tab-bar" :class="{ 'is-active-group': isActiveGroup }" flush>
    <ScrollArea ref="tabsArea" axis="x" passive class="tabs" content-class="tabs-row">
      <DraggableTab
        v-for="(instance, index) in group?.instances"
        :key="instance.instanceId"
        :instance-id="instance.instanceId"
        :group-id="groupId"
        :index="index"
        :title="panelTitle(store, instance)"
        :chrome="chrome?.states.get(instance.instanceId)?.value"
        :is-active="isActiveGroup && instance.instanceId === group?.activeInstanceId"
        @click="onTabClick(instance.instanceId)"
        @close="onCloseTab(instance.instanceId)"
      />
    </ScrollArea>
    <template #actions>
      <span v-if="group?.activeInstanceId && chrome?.states.get(group.activeInstanceId)?.value.mode" class="panel-mode">{{ chrome.states.get(group.activeInstanceId)?.value.mode }}</span>
      <div ref="actionsEl" class="panel-actions" />
      <IconButton size="lg" icon="lu:columns-2" :tooltip="t('split.right')" :disabled="(group?.instances.length ?? 0) < 2" @click="onSplit('horizontal')" />
      <IconButton size="lg" icon="lu:rows-2" :tooltip="t('split.down')" :disabled="(group?.instances.length ?? 0) < 2" @click="onSplit('vertical')" />
    </template>
  </Strip>
</template>

<style scoped>
.panel-tab-bar {
  overflow: hidden;
}

.panel-actions { display: flex; align-items: center; }
.panel-mode { font-size: var(--font-size-xs); color: var(--gray-11); white-space: nowrap; padding-inline: 8px; }

.tabs {
  flex: 1;
}

.tabs :deep(.tabs-row) {
  display: flex;
  align-items: center;
  gap: 0;
}
</style>
