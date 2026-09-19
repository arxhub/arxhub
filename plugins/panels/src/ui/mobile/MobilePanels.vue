<script setup lang="ts">
import { dirname } from '@arxhub/path'
import { Icon, IconButton, Strip } from '@arxhub/uikit/core'
import { computed } from 'vue'
import type { PanelStore } from '../../types'
import PanelView from '../PanelView.vue'
import { useOpenTabsList } from '../use-open-tabs'

const props = withDefaults(
  defineProps<{
    store: PanelStore
    // 'single' is one page at a time switched from the mini-app's rail: no context strip, because the
    // rail is already that list and a settings section has nothing to close.
    mode?: 'tiled' | 'single'
  }>(),
  { mode: 'tiled' },
)

// A narrow screen shows one document at a time. The layout tree built on a wide screen is left
// untouched — every open instance is still there, so the same vault opened on a desktop still has the
// arrangement it was given.
const { openTabs, current, pathOf } = useOpenTabsList(props.store)
const location = computed(() => {
  const path = current.value ? pathOf(current.value.instance) : null
  if (path == null) return null
  const parent = dirname(path)
  return parent === '.' || parent === '/' ? 'Vault' : parent
})
</script>

<template>
  <div class="mobile-panels">
    <div class="panel-body">
      <!-- All mounted, one shown: switching documents must not throw away an editor's state, and a
           staged settings draft lives in the page until it is applied. -->
      <PanelView
        v-for="tab in openTabs"
        :key="tab.instance.instanceId"
        :instance="tab.instance"
        :group-id="tab.groupId"
        :is-active="tab.instance.instanceId === current?.instance.instanceId"
      />
      <div v-if="!current" class="panels-empty">
        <p>No documents open</p>
      </div>
    </div>

    <!-- The viewer owns the document name. This band keeps only its location and the thumb-reachable close. -->
    <Strip v-if="current && mode === 'tiled'" class="context-strip" :bordered="false" flush-actions>
      <span v-if="location" class="entry-path" :title="location"><Icon name="lu:folder" :size="16" /><span class="location">{{ location }}</span></span>
      <template #actions>
      <IconButton
        icon="lu:x"
        size="xl"
        ariaLabel="Close document"
        @click="props.store.requestClosePanel(current.instance.instanceId, current.groupId)"
      />
      </template>
    </Strip>
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
  font-size: var(--font-size-md);
}

.context-strip {
  border-top: 1px solid var(--gray-4);
}

.location {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-path {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--gray-11);
  font-size: var(--font-size-sm);
}
</style>
