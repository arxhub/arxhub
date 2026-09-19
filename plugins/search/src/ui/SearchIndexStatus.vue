<script setup lang="ts">
import { StatusDot } from '@arxhub/uikit/core'
import { computed } from 'vue'
import { useIndexStatus } from './use-index-status'

const index = useIndexStatus()

const visible = computed(() => index.opening.value || index.scanning.value || index.unavailable.value)
</script>

<template>
  <div v-if="visible" class="search-index-status" role="status" :aria-label="index.text.value">
    <StatusDot :tone="index.tone.value" :pulse="index.scanning.value || index.opening.value" />
    {{ index.text.value }}
  </div>
</template>

<style scoped>
.search-index-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: var(--size-md);
  padding: 0 8px;
  border-radius: var(--radius-xs);
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  color: var(--gray-11);
  white-space: nowrap;
}
</style>
