<script setup lang="ts">
import { BottomSheet, Icon } from '@arxhub/uikit/core'
import { type Component, computed } from 'vue'
import type { SidebarItem } from '../types'

const props = defineProps<{
  open: boolean
  items: SidebarItem[]
  activeId: string
  status: { id: string; component: Component }[]
}>()
const emit = defineEmits<{ 'item-select': [id: string]; close: [] }>()

// Same split the desktop rail makes — the mini-apps you work in, then the ones you visit.
const primary = computed(() => props.items.filter((i) => !i.hidden && i.region !== 'bottom'))
const secondary = computed(() => props.items.filter((i) => !i.hidden && i.region === 'bottom'))

function select(id: string): void {
  emit('item-select', id)
  emit('close')
}
</script>

<template>
  <BottomSheet :open="open" label="More" @close="emit('close')">
    <!-- What the desktop frame keeps permanently in the status bar: on a phone it is worth a look, not
         a reserved strip, so it lives at the top of the sheet you already opened. -->
    <div v-if="status.length" class="status-card">
      <component v-for="item in status" :key="item.id" :is="item.component" />
    </div>

    <nav class="more-list" aria-label="Mini-apps">
      <button
        v-for="item in primary"
        :key="item.id"
        type="button"
        class="more-row"
        :class="{ active: item.id === activeId }"
        :aria-current="item.id === activeId ? 'page' : undefined"
        @click="select(item.id)"
      >
        <Icon :name="item.icon" :size="16" />
        <span>{{ item.title }}</span>
      </button>

      <div v-if="secondary.length && primary.length" class="more-divider" />

      <button
        v-for="item in secondary"
        :key="item.id"
        type="button"
        class="more-row"
        :class="{ active: item.id === activeId }"
        :aria-current="item.id === activeId ? 'page' : undefined"
        @click="select(item.id)"
      >
        <Icon :name="item.icon" :size="16" />
        <span>{{ item.title }}</span>
      </button>
    </nav>
  </BottomSheet>
</template>

<style scoped>
.status-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin: 0 16px 8px;
  padding: 12px 16px;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  background: var(--gray-2);
  color: var(--gray-11);
}

.more-list {
  display: flex;
  flex-direction: column;
  padding: 0 8px;
}

.more-row {
  display: flex;
  align-items: center;
  gap: 12px;
  /* Sheet rows are the largest targets in the app: this is the list you hit without looking. */
  height: 56px;
  padding: 0 16px;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--gray-12);
  font-family: var(--font-sans);
  font-size: var(--font-size-md);
  text-align: left;
  cursor: pointer;
}

.more-row.active {
  background: var(--accent-3);
  color: var(--accent-11);
}

.more-row:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.more-divider {
  height: 1px;
  margin: 8px 16px;
  background: var(--gray-4);
}
</style>
