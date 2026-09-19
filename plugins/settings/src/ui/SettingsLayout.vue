<script setup lang="ts">
import { ShellExtension } from '@arxhub/plugin-shell'
import { useArxHub } from '@arxhub/uikit/hooks'
import { onMounted, watch } from 'vue'
import { SETTINGS_TYPE_ID } from '../contributions'
import { SettingsExtension } from '../settings-extension'
import SettingsChangesBar from './SettingsChangesBar.vue'
import SettingsPageHost from './SettingsPageHost.vue'

const arxhub = useArxHub()
const settings = arxhub.extensions.get(SettingsExtension)
const storage = arxhub.extensions.get(ShellExtension).workspaceStorage
const savedSection = storage.navOf(SETTINGS_TYPE_ID)
watch(settings.activeId, (id) => storage.setNav(SETTINGS_TYPE_ID, id))

onMounted(() => {
  // First open: show the active (or first) section, so the screen is never blank behind a full list.
  if (settings.openedIds.value.length > 0) return
  const saved = typeof savedSection === 'string' && settings.sections.value.some((section) => section.id === savedSection) ? savedSection : null
  const id = saved ?? settings.activeId.value ?? settings.sections.value[0]?.id
  if (id) settings.open(id)
})
</script>

<template>
  <div class="settings-content">
    <div class="settings-pages">
      <!-- Every section that has been shown stays mounted; only the active one is displayed —
           exactly what the panel store this replaced did. A `v-if` would tear the page down on
           every switch, and a page holds more than the pending-changes registry can hand back to
           it: its scroll position, a config read still in flight, the index report a custom
           section renders. -->
      <div v-for="id in settings.openedIds.value" v-show="id === settings.activeId.value" :key="id" class="settings-page">
        <SettingsPageHost :section-id="id" />
      </div>
      <p v-if="settings.openedIds.value.length === 0" class="settings-empty">No plugin has registered a settings section.</p>
    </div>
    <SettingsChangesBar />
  </div>
</template>

<style scoped>
.settings-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.settings-pages {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.settings-page {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.settings-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  margin: 0;
  color: var(--gray-10);
  font-size: var(--font-size-sm);
}
</style>
