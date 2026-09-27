<script setup lang="ts">
import type { SearchSort } from '@arxhub/sql'
import { SectionLabel, Segmented, Switch } from '@arxhub/uikit/core'
import { computed } from 'vue'
import { t } from '../i18n/messages'
import type { SearchPreferences } from './search-preferences'

const model = defineModel<SearchPreferences>({ required: true })
const options = computed(() => [
  { value: 'relevance', label: t('filters.relevance') },
  { value: 'title', label: t('filters.byTitle') },
  { value: 'modified', label: t('filters.modified') },
])
const toggles = computed(
  () =>
    [
      { key: 'titlesOnly', label: t('filters.titlesOnly'), id: 'titles-only' },
      { key: 'caseSensitive', label: t('filters.caseSensitive'), id: 'case-sensitive' },
      { key: 'regex', label: t('filters.regex'), id: 'regex' },
    ] as const,
)
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
    <div class="sort"><SectionLabel>{{ t('filters.order') }}</SectionLabel><Segmented v-model="sort" :options="options" :aria-label="t('filters.order')" stretch /></div>
  </div>
</template>

<style scoped>
.filters { display: flex; flex-direction: column; gap: 8px; }
.sort { display: flex; flex-direction: column; gap: 4px; }
</style>
