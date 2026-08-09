<script setup lang="ts">
import { Row } from '@arxhub/uikit/core'
import type { PanelStore } from '../../types'
import { useOpenTabsList } from '../use-open-tabs'

const props = defineProps<{ store: PanelStore }>()

const { openTabs, pathOf, select } = useOpenTabsList(props.store)
</script>

<template>
  <div class="open-tabs-list" role="menu" aria-label="Open documents">
    <Row
      v-for="tab in openTabs"
      :key="tab.instance.instanceId"
      as="button"
      type="button"
      wrap
      class="tab-entry"
      :selected="tab.active"
      role="menuitem"
      @click="select(tab.groupId, tab.instance.instanceId)"
    >
      <span class="entry-text">
        <span class="entry-name">{{ tab.instance.title }}</span>
        <span v-if="pathOf(tab.instance)" class="entry-path">{{ pathOf(tab.instance) }}</span>
      </span>
    </Row>
    <div v-if="openTabs.length === 0" class="tabs-empty">
      <p>No documents open</p>
    </div>
  </div>
</template>

<style scoped>
.open-tabs-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: 0 8px;
}

.entry-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.entry-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-md);
}

.entry-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--gray-10);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
}

.tabs-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--size-xl);
  color: var(--gray-10);
  font-size: var(--font-size-md);
}
</style>
