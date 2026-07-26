<script setup lang="ts">
import { BottomSheet, Icon } from '@arxhub/uikit/core'
import { computed } from 'vue'
import type { PanelStore } from '../../types'
import PanelView from '../PanelView.vue'
import { notesSheetOpen } from './notes-tab'

const props = defineProps<{ store: PanelStore }>()

// A narrow screen shows one document at a time. The layout tree built on a wide screen is left
// untouched — every open instance is still there, so the same vault opened on a desktop still has the
// arrangement it was given.
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

// File panels carry the path they were opened with; a settings page or the welcome panel does not.
function pathOf(instance: { props?: Record<string, unknown> }): string | null {
  const path = instance.props?.path
  return typeof path === 'string' ? path : null
}

function select(groupId: string, instanceId: string): void {
  props.store.activateGroup(groupId)
  props.store.activatePanel(instanceId, groupId)
  notesSheetOpen.value = false
}
</script>

<template>
  <div class="mobile-panels">
    <div class="panel-body">
      <template v-for="tab in openTabs" :key="tab.instance.instanceId">
        <PanelView
          v-if="tab.instance.instanceId === current?.instance.instanceId"
          :instance="tab.instance"
          :group-id="tab.groupId"
          :is-active="true"
        />
      </template>
      <div v-if="!current" class="panels-empty">
        <p>No documents open</p>
      </div>
    </div>

    <!-- What a top app bar would have said, in the third of the screen a thumb reaches: which file
         this is, where it came from, and the one control that closes it. -->
    <div v-if="current" class="context-strip">
      <div class="context-text">
        <span class="context-name">{{ current.instance.title }}</span>
        <span v-if="pathOf(current.instance)" class="context-path">{{ pathOf(current.instance) }}</span>
      </div>
      <button
        type="button"
        class="context-close"
        aria-label="Close document"
        @click="props.store.closePanel(current.instance.instanceId, current.groupId)"
      >
        <Icon name="lu:x" :size="16" />
      </button>
    </div>

    <!-- Every open document is reachable, not only the ones that would have fitted in a tab strip. -->
    <BottomSheet
      :open="notesSheetOpen"
      title="Open documents"
      label="Open documents"
      @close="notesSheetOpen = false"
    >
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
          <span class="entry-name">{{ tab.instance.title }}</span>
          <span v-if="pathOf(tab.instance)" class="entry-path">{{ pathOf(tab.instance) }}</span>
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

.panel-body {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.panels-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--gray-10);
  font-size: 15px;
}

.context-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 8px 8px 8px 16px;
  border-top: 1px solid var(--gray-4);
  background: var(--gray-2);
}

.context-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.context-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--gray-12);
  font-size: 15px;
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-tight);
}

/* Mono for a path, always: it makes the separators legible and stops the name from reading as prose. */
.context-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--gray-10);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: var(--line-height-tight);
}

.context-close {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--size-md);
  height: var(--size-md);
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--gray-11);
  cursor: pointer;
}

.context-close:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.tab-list {
  display: flex;
  flex-direction: column;
  padding: 0 8px;
}

.tab-entry {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  height: 56px;
  padding: 0 16px;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--gray-12);
  font-family: var(--font-sans);
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}

.tab-entry.active {
  background: var(--accent-3);
  color: var(--accent-11);
}

.tab-entry:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.entry-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--gray-10);
  font-family: var(--font-mono);
  font-size: 11px;
}
</style>
