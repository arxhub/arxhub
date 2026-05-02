<script setup lang="ts">
import { Columns2, Rows2, X } from 'lucide-vue-next'
import { computed } from 'vue'
import { usePanels } from '../use-panels'

const props = defineProps<{
  groupId: string
}>()

const store = usePanels()
const group = computed(() => store.groups.value[props.groupId])
const isActiveGroup = computed(() => store.activeGroupId.value === props.groupId)

function onTabClick(instanceId: string) {
  store.activateGroup(props.groupId)
  store.activatePanel(instanceId, props.groupId)
}

function onCloseTab(instanceId: string) {
  store.closePanel(instanceId, props.groupId)
}

function onSplit(direction: 'horizontal' | 'vertical') {
  const newGroupId = store.splitGroup(props.groupId, direction)
  const activeInstance = group.value?.instances.find(
    (i) => i.instanceId === group.value?.activeInstanceId,
  )
  if (activeInstance) {
    store.openPanel(activeInstance.definitionId, activeInstance.props, activeInstance.title, newGroupId)
  }
}
</script>

<template>
  <div class="panel-tab-bar" :class="{ 'is-active-group': isActiveGroup }">
    <div class="tabs">
      <button
        v-for="instance in group?.instances"
        :key="instance.instanceId"
        class="tab"
        :class="{ active: instance.instanceId === group?.activeInstanceId }"
        @click="onTabClick(instance.instanceId)"
      >
        <span class="tab-title">{{ instance.title }}</span>
        <span class="tab-close" role="button" @click.stop="onCloseTab(instance.instanceId)">
          <X :size="12" />
        </span>
      </button>
    </div>
    <div class="actions">
      <button class="action-btn" aria-label="Split right" title="Split right" @click="onSplit('horizontal')">
        <Columns2 :size="14" />
      </button>
      <button class="action-btn" aria-label="Split down" title="Split down" @click="onSplit('vertical')">
        <Rows2 :size="14" />
      </button>
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

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 36px;
  background: transparent;
  border: none;
  border-right: 1px solid var(--gray-4);
  color: var(--gray-10);
  font-size: var(--font-size-sm);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.tab:hover {
  background-color: var(--gray-3);
  color: var(--gray-12);
}

.tab.active {
  background-color: var(--gray-1);
  color: var(--gray-12);
  border-bottom: 2px solid var(--accent-9);
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: inherit;
  cursor: pointer;
  padding: 0;
  opacity: 0.5;
}

.tab-close:hover {
  background-color: var(--gray-5);
  opacity: 1;
}

.actions {
  display: flex;
  align-items: center;
  padding: 0 4px;
  gap: 2px;
  flex-shrink: 0;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--gray-9);
  cursor: pointer;
}

.action-btn:hover {
  background-color: var(--gray-4);
  color: var(--gray-12);
}
</style>
