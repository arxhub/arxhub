<script setup lang="ts">
import { Row } from '@arxhub/uikit/core'
import type { ArxDataItem } from '../data-sources'

defineProps<{ groups: { title: string; items: ArxDataItem[] }[] }>()
const emit = defineEmits<{ open: [item: ArxDataItem] }>()
</script>
<template>
  <div class="data-board" aria-label="Grouped results"><section v-for="group in groups" :key="group.title"><h3>{{ group.title }} · {{ group.items.length }}</h3><Row v-for="item in group.items" :key="item.id" as="button" type="button" wrap @click="emit('open', item)">{{ item.title }}</Row></section></div>
</template>
<style scoped>
.data-board { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(200px, 1fr); gap: 16px; overflow-x: auto; }
section { min-width: 0; }
h3 { margin-block: 8px; font-size: var(--font-size-sm); color: var(--gray-11); }
</style>
