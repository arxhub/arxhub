<script setup lang="ts">
import { NavItem } from '@arxhub/uikit/core'
import { computed } from 'vue'
import type { AppSidebarProps } from './types'

const props = defineProps<AppSidebarProps>()
defineEmits<{ 'item-select': [id: string] }>()

const topItems = computed(() => (props.items ?? []).filter((i) => i.region !== 'bottom').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))

const bottomItems = computed(() => (props.items ?? []).filter((i) => i.region === 'bottom').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
</script>

<template>
  <aside class="app-sidebar">
    <div class="content-section">
      <component v-if="content" :is="content" />
    </div>
    <nav class="nav-section">
      <NavItem
        v-for="item in topItems"
        :key="item.id"
        :icon="item.icon"
        :title="item.title"
        :active="item.id === activeId"
        @click="$emit('item-select', item.id)"
      />
    </nav>
    <div class="bottom-section">
      <NavItem
        v-for="item in bottomItems"
        :key="item.id"
        :icon="item.icon"
        :title="item.title"
        :active="item.id === activeId"
        @click="$emit('item-select', item.id)"
      />
    </div>
  </aside>
</template>

<style scoped>
.app-sidebar {
  width: 3.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem 0;
  background-color: var(--gray-1);
  border-right: 1px solid var(--gray-6);
  flex-shrink: 0;
  z-index: var(--z-index-docked);
}

.content-section {
  margin-bottom: 1rem;
}

.nav-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  padding: 0 0.5rem;
}

.bottom-section {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  padding: 0 0.5rem 0.5rem;
}
</style>
