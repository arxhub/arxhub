<script setup lang="ts">
import { OpenTabsList, PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { Segmented } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed, ref } from 'vue'
import { ExplorerExtension } from '../../explorer-extension'
import FileTreeView from '../FileTreeView.vue'

// Mobile only: the desktop rail stays exactly the file tree it always was (ExplorerLayout picks between
// the two). Files and Tabs are Explorer's own — Tabs reads the shared PanelStoreExtension directly, the
// same extension MobilePanels itself already reads, so no new inter-plugin channel is needed for it.
// Anything else (Search) arrives only through ExplorerExtension.getRailTabs() — a contributor, same as
// registerNodeActions, so Explorer never imports the plugin that added it.
const arxhub = useArxHub()
const explorer = arxhub.extensions.get(ExplorerExtension)
const { store } = arxhub.extensions.get(PanelStoreExtension)

const sections = computed(() => [
  { value: 'files', label: 'Files' },
  { value: 'tabs', label: 'Tabs' },
  ...explorer.getRailTabs().map((tab) => ({ value: tab.id, label: tab.title })),
])

const active = ref('files')
</script>

<template>
  <div class="explorer-mobile-rail">
    <Segmented v-model="active" class="section-switcher" :options="sections" stretch aria-label="Explorer section" />
    <!-- Every section stays mounted, only the active one shows — the same reason PanelView is v-show
         rather than v-if: switching away must not throw away a scroll position, an expanded folder, or
         a half-typed search query. -->
    <div class="section-body">
      <FileTreeView v-show="active === 'files'" />
      <OpenTabsList v-show="active === 'tabs'" :store="store" />
      <component :is="tab.component" v-for="tab in explorer.getRailTabs()" v-show="active === tab.id" :key="tab.id" />
    </div>
  </div>
</template>

<style scoped>
.explorer-mobile-rail {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.section-switcher {
  flex-shrink: 0;
  margin: 8px;
  border-radius: var(--radius-sm);
}

.section-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.section-body > * {
  height: 100%;
}
</style>
