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
  padding: 16px 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 12px;
  text-align: left;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--gray-11);
  font-family: var(--font-sans);
  font-size: 13px;
  cursor: pointer;
  transition: background-color var(--duration-fast), color var(--duration-fast);
}

.nav-item:hover {
  background-color: var(--gray-4);
  color: var(--gray-12);
}

.nav-item:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.nav-item.active {
  background-color: var(--accent-3);
  color: var(--accent-11);
  font-weight: var(--font-weight-medium);
}
</style>
