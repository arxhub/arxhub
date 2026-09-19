<script setup lang="ts">
import { IconButton } from '@arxhub/uikit/core'
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

    <!-- What a top app bar would have said, in the third of the screen a thumb reaches: which file
         this is, where it came from, and the one control that closes it. A page switched from the rail
         gets none of it — its own heading already names it, and closing it would leave nothing. -->
    <div v-if="current && mode === 'tiled'" class="context-strip">
      <span class="entry-text">
        <span class="entry-name">{{ current.instance.title }}</span>
        <span v-if="pathOf(current.instance)" class="entry-path">{{ pathOf(current.instance) }}</span>
      </span>
      <IconButton
        icon="lu:x"
        size="xl"
        ariaLabel="Close document"
        @click="props.store.requestClosePanel(current.instance.instanceId, current.groupId)"
      />
    </div>
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
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  min-height: var(--size-xl);
  padding: 4px 8px 4px 16px;
  border-top: 1px solid var(--gray-4);
  background: var(--gray-2);
}

/* The two lines of a document's identity — name over path — also used, verbatim, by OpenTabsList's own
   Row entries; one block, so the two never drift apart the way a `Row`-owned copy and a hand-rolled one
   already had (gap, weight). */
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
