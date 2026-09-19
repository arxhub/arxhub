<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import DesktopSearchFilters from './DesktopSearchFilters.vue'
import MobileSearchFilters from './MobileSearchFilters.vue'
import type { SearchPreferences } from './search-preferences'

const model = defineModel<SearchPreferences>({ required: true })
const Filters = useShellFrame() === 'mobile' ? MobileSearchFilters : DesktopSearchFilters
</script>

<template><component :is="Filters" v-model="model" /></template>
