<script setup lang="ts">
import { Row } from '@arxhub/uikit/core'
import type { ArxDataItem } from '../data-sources'

defineProps<{ items: ArxDataItem[] }>()
const emit = defineEmits<{ open: [item: ArxDataItem] }>()
</script>

<template>
  <div aria-label="Data list">
    <Row v-for="item in items" :key="item.id" as="button" type="button" wrap @click="emit('open', item)">
      <span class="title">{{ item.title }}</span><small>{{ item.group }}</small>
    </Row>
  </div>
</template>

<style scoped>
.title { flex: 1; min-width: 0; overflow-wrap: anywhere; }
small { flex-shrink: 0; font-size: var(--font-size-xs); color: var(--gray-11); }
</style>
