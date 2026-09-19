<script setup lang="ts">
import StatusDot from './StatusDot.vue'

defineProps<{
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral'
  dot?: boolean
}>()
</script>

<template>
  <span class="badge" :class="variant || 'neutral'">
    <StatusDot v-if="dot" :tone="variant === 'info' ? 'accent' : (variant ?? 'neutral')" />
    <slot />
  </span>
</template>

<style scoped>
/* A badge states a condition, so it stays quiet: a wash, the matching text step, no border and no
   uppercase shout — the colour already carries the signal. */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: var(--size-md-half);
  padding: 0 8px;
  border-radius: var(--radius-md);
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-normal);
  white-space: nowrap;
}

.success {
  background-color: var(--success-3);
  color: var(--success-11);
}

.warning {
  background-color: var(--warning-3);
  color: var(--warning-11);
}

.danger {
  background-color: var(--danger-3);
  color: var(--danger-11);
}

.info {
  background-color: var(--info-3);
  color: var(--info-11);
}

.accent {
  background-color: var(--accent-3);
  color: var(--accent-11);
}

.neutral {
  background-color: var(--gray-3);
  color: var(--gray-11);
}
</style>
