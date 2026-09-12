<script setup lang="ts">
import { Row } from '@arxhub/uikit/core'
import type { ArxDataItem } from '../data-sources'

defineProps<{ groups: { title: string; items: ArxDataItem[] }[] }>()
const emit = defineEmits<{ open: [item: ArxDataItem] }>()
</script>
<template>
  <div class="data-board" aria-label="Data board"><section v-for="group in groups" :key="group.title"><h3>{{ group.title }} · {{ group.items.length }}</h3><Row v-for="item in group.items" :key="item.id" as="button" type="button" wrap @click="emit('open', item)">{{ item.title }}</Row></section></div>
</template>
<style scoped>
.data-board { display: flex; flex-direction: column; gap: 16px; }
h3 { margin-block: 8px; font-size: var(--font-size-md); color: var(--gray-11); }
</style>
