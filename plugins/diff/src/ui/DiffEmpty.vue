<script setup lang="ts">
import { Icon } from '@arxhub/uikit/core'

defineProps<{ label: string; icon?: string }>()
</script>

<template>
  <div class="diff-empty" data-testid="diff-empty">
    <Icon :name="icon ?? 'lu:check'" :size="20" />
    <span>{{ label }}</span>
  </div>
</template>

<style scoped>
.diff-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 16px;
  color: var(--gray-11);
  font-size: var(--font-size-sm);
  text-align: center;
}
</style>
