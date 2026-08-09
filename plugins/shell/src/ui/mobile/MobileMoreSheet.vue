<script setup lang="ts">
import { BottomSheet, Icon, Row } from '@arxhub/uikit/core'
import { type Component, computed } from 'vue'
import type { SidebarItem } from '../types'

const props = defineProps<{
  open: boolean
  items: SidebarItem[]
  activeId: string
  status: { id: string; component: Component }[]
}>()
const emit = defineEmits<{ 'item-select': [id: string]; close: [] }>()

// Same split the desktop rail makes — the mini-apps you work in, then the ones you visit. An item
// absorbed into another mini-app's mobile rail (see SidebarItem.absorbedOnMobileBy) is reachable from
// there, not from a second place here — the same filter the bottom tab row applies.
const primary = computed(() => props.items.filter((i) => !i.hidden && i.region !== 'bottom' && !i.absorbedOnMobileBy))
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
      <Row
        v-for="item in primary"
        :key="item.id"
        as="button"
        type="button"
        :selected="item.id === activeId"
        :aria-current="item.id === activeId ? 'page' : undefined"
        @click="select(item.id)"
      >
        <Icon :name="item.icon" :size="16" />
        <span>{{ item.mobileTitle ?? item.title }}</span>
      </Row>

      <div v-if="secondary.length && primary.length" class="more-divider" />

      <Row
        v-for="item in secondary"
        :key="item.id"
        as="button"
        type="button"
        :selected="item.id === activeId"
        :aria-current="item.id === activeId ? 'page' : undefined"
        @click="select(item.id)"
      >
        <Icon :name="item.icon" :size="16" />
        <span>{{ item.mobileTitle ?? item.title }}</span>
      </Row>
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

.more-divider {
  height: 1px;
  margin: 8px 16px;
  background: var(--gray-4);
}
</style>
