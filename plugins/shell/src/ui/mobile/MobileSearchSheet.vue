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

const states = computed(() => props.status.statuses.value)
const actions = computed(() => props.status.actions.value)
const sections = computed(() => {
  const shown = new Set(fitTypeRow(props.workspace.row.value).shown.map((item) => item.type.id))
  return typeSections(props.workspace, props.types, shown)
})
</script>

<template>
  <BottomSheet :open="props.open" label="Open or switch to" @close="emit('close')">
    <div v-if="states.length || actions.length" class="status-block">
      <div class="states">
        <component :is="item.component" v-for="item in states" :key="item.id" />
      </div>
      <div class="actions">
        <component :is="item.component" v-for="item in actions" :key="item.id" />
      </div>
    </div>
    <SearchSheetList :open="props.open" :workspace="props.workspace" :types="props.types" :sections="sections" @chosen="emit('close')" />
  </BottomSheet>
</template>

<style scoped>
/* The head of the list, not a card inside it: a band at the rows' own height and inset, set off from the
   sections below by the hairline a region keeps inside itself. One line at any width: on a narrow phone
   the states give way (truncated) and the actions keep their place at the end, rather than the band
   wrapping to twice its height and pushing the list down. */
.status-block {
  display: flex;
  align-items: center;
  gap: 12px;
  height: var(--size-xl);
  padding: 0 16px;
  border-bottom: 1px solid var(--gray-4);
  color: var(--gray-11);
}

.states,
.actions {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.states {
  flex: 1 1 auto;
  overflow: hidden;
}

.states > :deep(*) {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions {
  flex: 0 0 auto;
  margin-left: auto;
}
</style>
