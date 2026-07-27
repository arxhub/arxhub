<script setup lang="ts">
import { PanelsLayout } from '@arxhub/plugin-panels/ui'
import { MiniAppShell } from '@arxhub/plugin-shell/ui'
import { useArxHub } from '@arxhub/uikit/hooks'
import { onMounted } from 'vue'
import { SettingsExtension } from '../settings-extension'
import SettingsChangesBar from './SettingsChangesBar.vue'
import SettingsNav from './SettingsNav.vue'

const arxhub = useArxHub()
const settings = arxhub.extensions.get(SettingsExtension)

onMounted(() => {
  // First open: surface the active (or first) section as a tab if the content is empty.
  if (Object.keys(settings.store.groups.value).length > 0) return
  const id = settings.activeId.value ?? settings.sections.value[0]?.id
  if (id) settings.open(id)
})
</script>

<template>
  <MiniAppShell rail-title="Sections">
    <template #rail>
      <SettingsNav />
    </template>
    <div class="settings-content">
      <PanelsLayout :store="settings.store" mode="single" />
      <SettingsChangesBar />
    </div>
  </MiniAppShell>
</template>

<style scoped>
.settings-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.settings-content > :first-child {
  flex: 1;
  min-height: 0;
}
</style>
