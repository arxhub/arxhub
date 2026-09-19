<script setup lang="ts">
import { BottomSheet, Button, Icon } from '@arxhub/uikit/core'
import { computed, ref } from 'vue'
import SearchFilterFields from './SearchFilterFields.vue'
import type { SearchPreferences } from './search-preferences'

const model = defineModel<SearchPreferences>({ required: true })
const open = ref(false)
const active = computed(() => [model.value.titlesOnly, model.value.caseSensitive, model.value.regex].filter(Boolean).length)
const order = computed(() => ({ relevance: 'Relevance', title: 'Title', modified: 'Modified' })[model.value.sort])
</script>

<template>
  <Button size="lg" variant="secondary" :active="active > 0" aria-label="Search filters" @click="open = true">
    <Icon name="lu:sliders-horizontal" :size="16" />
    Filters{{ active ? ` (${active})` : '' }} · {{ order }}
  </Button>
  <BottomSheet :open="open" title="Search filters" @close="open = false">
    <div class="content"><SearchFilterFields v-model="model" /><Button size="lg" @click="open = false">Done</Button></div>
  </BottomSheet>
</template>

<style scoped>
.content { display: flex; flex-direction: column; gap: 16px; padding: 0 16px 16px; }
</style>
