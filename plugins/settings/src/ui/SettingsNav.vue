<script setup lang="ts">
import { Row } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { SettingsExtension } from '../settings-extension'

const arxhub = useArxHub()
const settings = arxhub.extensions.get(SettingsExtension)

const sorted = computed(() => [...settings.sections.value].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
</script>

<template>
  <nav class="settings-nav">
    <Row
      v-for="section in sorted"
      as="button"
      :key="section.id"
      :selected="section.id === settings.activeId.value"
      @click="settings.open(section.id)"
    >
      {{ section.title }}
    </Row>
  </nav>
</template>

<style scoped>
.settings-nav {
  display: flex;
  flex-direction: column;
  padding: 16px 8px;
}




</style>
