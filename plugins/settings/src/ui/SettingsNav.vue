<script setup lang="ts">
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { SettingsExtension } from '../settings-extension'

const arxhub = useArxHub()
const settings = arxhub.extensions.get(SettingsExtension)

const sorted = computed(() => [...settings.sections.value].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
</script>

<template>
  <nav class="settings-nav">
    <button
      v-for="section in sorted"
      :key="section.id"
      type="button"
      class="nav-item"
      :class="{ active: section.id === settings.activeId.value }"
      @click="settings.open(section.id)"
    >
      {{ section.title }}
    </button>
  </nav>
</template>

<style scoped>
.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0.75rem 0.5rem;
}

.nav-item {
  text-align: left;
  padding: 0.375rem 0.625rem;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--gray-11);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--duration-normal);
}

.nav-item:hover {
  background-color: var(--gray-3);
  color: var(--gray-12);
}

.nav-item.active {
  background-color: var(--gray-4);
  color: var(--gray-12);
}
</style>
