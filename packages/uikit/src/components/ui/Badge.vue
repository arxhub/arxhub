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
  padding: 0.125rem 0.5rem; /* px-2 py-0.5 */
  border-radius: 9999px;
  font-size: 0.625rem; /* text-[10px] */
  font-weight: 700;
  text-transform: uppercase;
  border: 1px solid transparent;
}

.success {
  background-color: rgba(53, 158, 255, 0.1); /* primary/10 */
  border-color: rgba(53, 158, 255, 0.2); /* primary/20 */
  color: var(--primary);
}

.alert {
  background-color: rgba(229, 72, 77, 0.1); /* #E5484D1A */
  border-color: rgba(229, 72, 77, 0.2); /* #E5484D33 */
  color: #E5484D;
}

.neutral {
  background-color: var(--radix-gray-3);
  border-color: var(--border-cold);
  color: var(--text-muted);
}
</style>
