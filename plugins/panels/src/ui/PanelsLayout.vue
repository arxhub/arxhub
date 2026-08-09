<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import { provide } from 'vue'
import type { PanelStore } from '../types'
import { PanelStoreKey, usePanels } from '../use-panels'
import DesktopPanels from './desktop/DesktopPanels.vue'
import MobilePanels from './mobile/MobilePanels.vue'

const props = withDefaults(
  defineProps<{
    // A mini-app can pass its own independent store; otherwise fall back to the global singleton.
    store?: PanelStore
    // What the store is being used as. 'tiled' is a workspace of documents: a tab strip and splits on
    // desktop, a context strip naming the current one on mobile. 'single' is one page at a time,
    // switched from the mini-app's own rail — Settings and its sections — so neither frame offers a
    // second list of what is open, because the rail already is that list.
    mode?: 'tiled' | 'single'
  }>(),
  { mode: 'tiled' },
)
const panelStore = props.store ?? usePanels()
provide(PanelStoreKey, panelStore)

// Tiled groups and one-document-at-a-time are different layouts, not one layout at two widths — so
// this picks between two components rather than reshaping either of them.
const impl = useShellFrame() === 'mobile' ? MobilePanels : DesktopPanels
</script>

<template>
  <div class="panels-layout">
    <component :is="impl" :store="panelStore" :mode="props.mode" />
  </div>
</template>

<style scoped>
.panels-layout {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
