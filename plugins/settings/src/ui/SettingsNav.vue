<script setup lang="ts">
import { useNavHost } from '@arxhub/plugin-shell/ui'
import { IconButton, Row, Strip } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { SettingsExtension } from '../settings-extension'

const arxhub = useArxHub()
const navHost = useNavHost()
const settings = arxhub.extensions.get(SettingsExtension)

const sorted = computed(() => [...settings.sections.value].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
</script>

<template>
  <div class="settings-navigation">
    <Strip title="Sections" flush-actions>
      <template #actions>
        <IconButton v-if="navHost" size="lg" :icon="navHost.icon" :tooltip="navHost.label" @click="navHost.dismiss()" />
      </template>
    </Strip>
    <nav class="settings-nav">
      <Row
        v-for="section in sorted"
        as="button"
        :key="section.id"
        :selected="section.id === settings.activeId.value"
        @click="settings.open(section.id); navHost?.navigated?.()"
      >
        {{ section.title }}
      </Row>
    </nav>
  </div>
</template>

<style scoped>
.settings-navigation {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.settings-nav {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
</style>
