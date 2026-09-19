<script setup lang="ts">
import SearchFilterFields from './SearchFilterFields.vue'
import type { SearchPreferences } from './search-preferences'

const model = defineModel<SearchPreferences>({ required: true })
</script>

<template><SearchFilterFields v-model="model" /></template>
