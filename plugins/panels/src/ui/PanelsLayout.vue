<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import { provide } from 'vue'
import type { PanelStore } from '../types'
import { PanelStoreKey, usePanels } from '../use-panels'
import DesktopPanels from './desktop/DesktopPanels.vue'
import MobilePanels from './mobile/MobilePanels.vue'

// A mini-app can pass its own independent store; otherwise fall back to the global singleton.
const props = defineProps<{ store?: PanelStore }>()
const panelStore = props.store ?? usePanels()
provide(PanelStoreKey, panelStore)

// Tiled groups and one-document-at-a-time are different layouts, not one layout at two widths — so
// this picks between two components rather than reshaping either of them.
const impl = useShellFrame() === 'mobile' ? MobilePanels : DesktopPanels
</script>

<template>
  <div class="panels-layout">
    <component :is="impl" :store="panelStore" />
  </div>
</template>

<style scoped>
.panels-layout {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
