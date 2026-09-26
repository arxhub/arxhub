<script setup lang="ts">
import { BottomSheet } from '@arxhub/uikit/core'
import { computed } from 'vue'
import SearchSheetList from '../SearchSheetList.vue'
import { typeSections } from '../search-sheet'
import type { StatusRegistry } from '../status'
import type { TabTypeRegistry } from '../tab-type-registry'
import type { Workspace } from '../workspace'
import { fitTypeRow } from './type-row'

// The phone's realization of the search sheet — "More", the last key of the type row. It lists TYPES, not
// the documents inside them: those are a second tap on their type away, and a handful of mini-apps is not
// a list anyone needs to search, so there is no search here.
//
// It hosts the status block as well, and that is the model rather than tidiness: one status registration
// is laid out three ways (F-11) — the desktop bar, THIS block, and the background line — and this frame
// has no permanent bar to put it in. States before actions, the same reading order the desktop bar has
// left to right; there are no two sides here to use instead.
const props = defineProps<{ open: boolean; workspace: Workspace; types: TabTypeRegistry; status: StatusRegistry }>()
const emit = defineEmits<{ close: [] }>()

const statusItems = computed(() => [...props.status.statuses.value, ...props.status.actions.value])
const sections = computed(() => {
  const shown = new Set(fitTypeRow(props.workspace.row.value).shown.map((item) => item.type.id))
  return typeSections(props.workspace, props.types, shown)
})
</script>

<template>
  <BottomSheet :open="props.open" label="Open or switch to" @close="emit('close')">
    <div v-if="statusItems.length" class="status-card">
      <component :is="item.component" v-for="item in statusItems" :key="item.id" />
    </div>
    <SearchSheetList :open="props.open" :workspace="props.workspace" :types="props.types" :sections="sections" @chosen="emit('close')" />
  </BottomSheet>
</template>

<style scoped>
.status-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin: 16px;
  padding: 12px 16px;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  background: var(--gray-2);
  color: var(--gray-11);
}
</style>
