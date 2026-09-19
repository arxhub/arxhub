<script setup lang="ts">
import { Row } from '@arxhub/uikit/core'
import type { ArxDataItem } from '../data-sources'

defineProps<{ items: ArxDataItem[] }>()
const emit = defineEmits<{ open: [item: ArxDataItem] }>()
</script>

<template>
  <div aria-label="Data list">
    <Row v-for="item in items" :key="item.id" as="button" type="button" wrap @click="emit('open', item)">
      <span class="item-content">
        <span class="title">{{ item.title }}</span>
        <small v-if="item.group">{{ item.group }}</small>
      </span>
    </Row>
  </div>
</template>

<style scoped>
.item-content { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.title { overflow-wrap: anywhere; }
small { font-size: var(--font-size-sm); color: var(--gray-11); overflow-wrap: anywhere; }
</style>
