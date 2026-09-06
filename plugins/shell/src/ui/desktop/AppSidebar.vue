<script setup lang="ts">
import { NavItem } from '@arxhub/uikit/core'
import { computed } from 'vue'
import type { AppSidebarProps } from './types'

const props = defineProps<AppSidebarProps>()
defineEmits<{ 'item-select': [id: string] }>()

const topItems = computed(() =>
  (props.items ?? []).filter((i) => !i.hidden && i.region !== 'bottom').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
)

const bottomItems = computed(() =>
  (props.items ?? []).filter((i) => !i.hidden && i.region === 'bottom').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
)
</script>

<template>
  <aside class="app-sidebar">
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
  /* +1px: border-box counts border-right in the width, so without this the 40px nav item overflowed
     past it — the border rendered underneath the button's own fill instead of beside it. */
  width: calc(var(--size-md) + 1px);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0;
  background-color: var(--gray-2);
  border-right: 1px solid var(--gray-6);
  flex-shrink: 0;
  z-index: var(--z-index-docked);
}

.nav-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.bottom-section {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}
</style>
