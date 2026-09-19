<script setup lang="ts">
import type { SearchSort } from '@arxhub/sql'
import { SectionLabel, Segmented, Switch } from '@arxhub/uikit/core'
import { computed } from 'vue'
import type { SearchPreferences } from './search-preferences'

const model = defineModel<SearchPreferences>({ required: true })
const options = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'title', label: 'Title' },
  { value: 'modified', label: 'Modified' },
]
const toggles = [
  { key: 'titlesOnly', label: 'Titles only', id: 'titles-only' },
  { key: 'caseSensitive', label: 'Case sensitive', id: 'case-sensitive' },
  { key: 'regex', label: 'Regular expression', id: 'regex' },
] as const
const sort = computed({
  get: () => model.value.sort,
  set: (sort: string) => {
    model.value = { ...model.value, sort: sort as SearchSort }
  },
})
</script>

<template>
  <div class="filters">
    <Switch v-for="toggle in toggles" :key="toggle.key" :model-value="model[toggle.key]" :label="toggle.label"
      :data-testid="`search-toggle-${toggle.id}`" @update:model-value="model = { ...model, [toggle.key]: $event }" />
    <div class="sort"><SectionLabel>Order</SectionLabel><Segmented v-model="sort" :options="options" aria-label="Order" stretch /></div>
  </div>
</template>

<style scoped>
.filters { display: flex; flex-direction: column; gap: 8px; }
.sort { display: flex; flex-direction: column; gap: 4px; }
</style>
