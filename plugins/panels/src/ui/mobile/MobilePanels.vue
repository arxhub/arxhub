<script setup lang="ts">
import { EmptyState } from '@arxhub/uikit/core'
import { t } from '../../i18n/messages'
import type { PanelStore } from '../../types'
import PanelView from '../PanelView.vue'
import { useOpenTabsList } from '../use-open-tabs'

const props = withDefaults(
  defineProps<{
    store: PanelStore
    // 'single' is one page at a time switched from the mini-app's rail; 'tiled' is the workspace of
    // documents, whose name, location and Close are the shell's object band now, not a strip of our own.
    mode?: 'tiled' | 'single'
  }>(),
  { mode: 'tiled' },
)

// A narrow screen shows one document at a time. The layout tree built on a wide screen is left
// untouched — every open instance is still there, so the same vault opened on a desktop still has the
// arrangement it was given.
const { openTabs, current } = useOpenTabsList(props.store)
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
      <EmptyState v-if="!current" icon="lu:file-text" :text="t('mobile.empty')" :hint="t('mobile.emptyHint')" />
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
</style>
