<script setup lang="ts">
import { computed } from 'vue'
import type { AppSidebarProps } from './types'

const props = defineProps<AppSidebarProps>()
defineEmits<{ 'item-select': [id: string] }>()

const topItems = computed(() =>
  (props.items ?? []).filter(i => i.region !== 'bottom').sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
)

const bottomItems = computed(() =>
  (props.items ?? []).filter(i => i.region === 'bottom').sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
)
</script>

<template>
  <aside class="app-sidebar">
    <div class="content-section">
      <component v-if="content" :is="content" />
    </div>
    <nav class="nav-section">
      <button
        v-for="item in topItems"
        :key="item.id"
        class="sidebar-item"
        :class="{ active: item.id === activeId }"
        :title="item.title"
        @click="$emit('item-select', item.id)"
      >
        <component :is="item.icon" />
      </button>
    </nav>
    <div class="bottom-section">
      <button
        v-for="item in bottomItems"
        :key="item.id"
        class="sidebar-item"
        :class="{ active: item.id === activeId }"
        :title="item.title"
        @click="$emit('item-select', item.id)"
      >
        <component :is="item.icon" />
      </button>
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

.sidebar-item {
  width: var(--size-md);
  height: var(--size-md);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--gray-11);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all var(--duration-normal);
}

.sidebar-item:hover {
  background-color: var(--gray-3);
  color: var(--gray-12);
}

.sidebar-item.active {
  background-color: var(--accent-3);
  color: var(--accent-9);
  border-color: var(--accent-a2);
}
</style>
