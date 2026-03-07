<script setup lang="ts">
import { computed } from 'vue'
import NavItem from '../../core/layout/NavItem.vue'

interface NavItemConfig {
  icon: string
  title: string
  active?: boolean
}

const props = defineProps<{
  items?: NavItemConfig[]
}>()

const fallbackItems: NavItemConfig[] = [
  { icon: 'book', title: 'Library', active: true },
  { icon: 'image', title: 'Assets' },
  { icon: 'palette', title: 'Tokens' },
  { icon: 'settings', title: 'Settings' },
]

const resolvedItems = computed(() => props.items ?? fallbackItems)
</script>

<template>
  <nav class="bottom-nav">
    <NavItem
      v-for="item in resolvedItems"
      :key="item.icon"
      :icon="item.icon"
      :title="item.title"
      :active="item.active"
    />
  </nav>
</template>

<style scoped>
.bottom-nav {
  height: var(--size-2xl);
  background-color: var(--gray-1);
  border-top: 1px solid var(--gray-6);
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 0 0.5rem;
  flex-shrink: 0;
  z-index: var(--z-index-docked);
}
</style>
