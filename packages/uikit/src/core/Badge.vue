<script setup lang="ts">
defineProps<{
  variant?: 'success' | 'alert' | 'neutral'
}>()
</script>

<template>
  <span class="badge" :class="variant || 'neutral'">
    <slot />
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-full);
  font-size: 0.625rem;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  border: 1px solid transparent;
}

.success {
  background-color: var(--success-a4);
  border-color: var(--success-9);
  color: var(--success-9);
}

.alert {
  background-color: var(--warning-a4);
  border-color: var(--warning-9);
  color: var(--warning-9);
}

.neutral {
  background-color: var(--gray-3);
  border-color: var(--gray-6);
  color: var(--gray-11);
}
</style>
