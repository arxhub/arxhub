<script setup lang="ts">
import { PanelsLayout } from '@arxhub/plugin-panels/ui'
import { MiniAppShell } from '@arxhub/plugin-shell/ui'
import { useArxHub } from '@arxhub/uikit/hooks'
import { onMounted } from 'vue'
import { SettingsExtension } from '../settings-extension'
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
  <MiniAppShell>
    <template #rail>
      <SettingsNav />
    </template>
    <PanelsLayout :store="settings.store" />
  </MiniAppShell>
</template>
