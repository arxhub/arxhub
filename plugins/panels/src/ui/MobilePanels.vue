<script setup lang="ts">
import { BottomSheet, Icon } from '@arxhub/uikit/core'
import { computed, ref } from 'vue'
import type { PanelStore } from '../types'
import PanelView from './PanelView.vue'

const props = defineProps<{ store: PanelStore }>()

const tabsOpen = ref(false)

// A narrow screen shows one document at a time. The layout tree built on a wide screen is left
// untouched — every open instance is still there, so widening the window restores the arrangement.
const openTabs = computed(() =>
  Object.entries(props.store.groups.value).flatMap(([groupId, group]) =>
    group.instances.map((instance) => ({
      groupId,
      instance,
      active: group.activeInstanceId === instance.instanceId && groupId === props.store.activeGroupId.value,
    })),
  ),
)

const current = computed(() => openTabs.value.find((tab) => tab.active) ?? openTabs.value[0])

function select(groupId: string, instanceId: string): void {
  props.store.activateGroup(groupId)
  props.store.activatePanel(instanceId, groupId)
  tabsOpen.value = false
}

function close(groupId: string, instanceId: string): void {
  props.store.closePanel(instanceId, groupId)
}
</script>

<template>
  <div class="mobile-panels">
    <div v-if="current" class="mobile-panel-bar">
      <button type="button" class="tabs-button" :aria-label="`Open documents (${openTabs.length})`" @click="tabsOpen = true">
        <Icon name="lu:files" :size="16" />
        <span class="tab-title">{{ current.instance.title }}</span>
        <span class="tab-count">{{ openTabs.length }}</span>
      </button>
      <button
        type="button"
        class="close-button"
        aria-label="Close document"
        @click="close(current.groupId, current.instance.instanceId)"
      >
        <Icon name="lu:x" :size="16" />
      </button>
    </div>

    <div class="mobile-panel-body">
      <template v-for="tab in openTabs" :key="tab.instance.instanceId">
        <PanelView
          v-if="tab.instance.instanceId === current?.instance.instanceId"
          :instance="tab.instance"
          :group-id="tab.groupId"
          :is-active="true"
        />
      </template>
      <div v-if="!current" class="mobile-panels-empty">
        <p>No documents open</p>
      </div>
    </div>

    <!-- Every open document is reachable, not only the ones that would fit in a tab strip. -->
    <BottomSheet :open="tabsOpen" title="Open documents" label="Open documents" @close="tabsOpen = false">
      <div class="tab-list" role="menu">
        <button
          v-for="tab in openTabs"
          :key="tab.instance.instanceId"
          type="button"
          class="tab-entry"
          :class="{ active: tab.active }"
          role="menuitem"
          @click="select(tab.groupId, tab.instance.instanceId)"
        >
          {{ tab.instance.title }}
        </button>
      </div>
    </BottomSheet>
  </div>
</template>

<style scoped>
.mobile-panels {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.mobile-panel-bar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.25rem;
  border-bottom: 1px solid var(--gray-6);
  background: var(--gray-2);
  flex-shrink: 0;
}

.tabs-button {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: var(--size-sm);
  padding: 0 0.5rem;
  border: none;
  background: transparent;
  color: var(--gray-12);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
}

.tab-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-count {
  padding: 0 0.375rem;
  border-radius: var(--radius-full);
  background: var(--gray-4);
  color: var(--gray-11);
  font-size: var(--font-size-xs);
}

.close-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--size-sm);
  height: var(--size-sm);
  border: none;
  background: transparent;
  color: var(--gray-11);
  cursor: pointer;
}

.mobile-panel-body {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.mobile-panels-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--gray-9);
}

.tab-list {
  display: flex;
  flex-direction: column;
  padding: 0 0.5rem;
}

.tab-entry {
  min-height: var(--size-md);
  padding: 0 0.75rem;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--gray-12);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
}

.tab-entry.active {
  background: var(--gray-4);
}
</style>
