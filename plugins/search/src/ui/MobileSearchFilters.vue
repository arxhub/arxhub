<script setup lang="ts">
import { BottomSheet, Button, Icon } from '@arxhub/uikit/core'
import { computed, ref } from 'vue'
import { t } from '../i18n/messages'
import SearchFilterFields from './SearchFilterFields.vue'
import type { SearchPreferences } from './search-preferences'

const model = defineModel<SearchPreferences>({ required: true })
const open = ref(false)
const active = computed(() => [model.value.titlesOnly, model.value.caseSensitive, model.value.regex].filter(Boolean).length)
const order = computed(
  () => ({ relevance: t('filters.relevance'), title: t('filters.byTitle'), modified: t('filters.modified') })[model.value.sort],
)
</script>

<template>
  <Button size="lg" variant="secondary" :active="active > 0" :aria-label="t('filters.title')" @click="open = true">
    <Icon name="lu:sliders-horizontal" :size="16" />
    {{ t('filters.button') }}{{ active ? ` (${active})` : '' }} · {{ order }}
  </Button>
  <BottomSheet :open="open" :title="t('filters.title')" inset @close="open = false">
    <SearchFilterFields v-model="model" /><Button size="lg" @click="open = false">{{ t('filters.done') }}</Button>
  </BottomSheet>
</template>
