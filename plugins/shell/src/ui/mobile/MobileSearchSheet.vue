<script setup lang="ts">
import { BottomSheet } from '@arxhub/uikit/core'
import { computed } from 'vue'
import SearchSheetList from '../SearchSheetList.vue'
import type { StatusRegistry } from '../status'
import type { TabTypeRegistry } from '../tab-type-registry'
import type { Workspace } from '../workspace'

// The phone's realization of the search sheet, opened from the immobile key beside the type row.
//
// It hosts the status block as well, and that is the model rather than tidiness: one status registration
// is laid out three ways (F-11) — the desktop bar, THIS block, and the background line — and this frame
// has no permanent bar to put it in. States before actions, the same reading order the desktop bar has
// left to right; there are no two sides here to use instead.
const props = defineProps<{ open: boolean; workspace: Workspace; types: TabTypeRegistry; status: StatusRegistry }>()
const emit = defineEmits<{ close: [] }>()

const statusItems = computed(() => [...props.status.statuses.value, ...props.status.actions.value])
</script>

<template>
  <BottomSheet :open="props.open" label="Open or switch to" @close="emit('close')">
    <div v-if="statusItems.length" class="status-card">
      <component :is="item.component" v-for="item in statusItems" :key="item.id" />
    </div>
    <SearchSheetList :open="props.open" :workspace="props.workspace" :types="props.types" @chosen="emit('close')" />
  </BottomSheet>
</template>

<style scoped>
.status-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin: 0 16px 16px;
  padding: 12px 16px;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  background: var(--gray-2);
  color: var(--gray-11);
}
</style>
