<script setup lang="ts">
import { EmptyState, Row, ScrollArea } from '@arxhub/uikit/core'
import type { PanelStore } from '../../types'
import { useOpenTabsList } from '../use-open-tabs'

const props = defineProps<{ store: PanelStore }>()

const { openTabs, pathOf, select } = useOpenTabsList(props.store)
</script>

<template>
  <ScrollArea class="open-tabs-list">
    <div class="open-tabs-menu" role="menu" aria-label="Open documents">
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
      <EmptyState v-if="openTabs.length === 0" compact icon="lu:file-text" text="No documents open." />
    </div>
  </ScrollArea>
</template>

<style scoped>
.open-tabs-list {
  height: 100%;
}

.open-tabs-menu {
  display: flex;
  flex-direction: column;
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
</style>
