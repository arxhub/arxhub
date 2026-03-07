<script setup lang="ts">
defineProps<{
  title?: string
}>()
</script>

<template>
  <header class="mobile-header">
    <div class="logo-box" aria-hidden="true">
      <span class="logo-icon">◆</span>
    </div>
    <span class="title">{{ title ?? 'ArxHub' }}</span>
    <div class="actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.mobile-header {
  height: var(--size-lg);
  background-color: var(--gray-1);
  border-bottom: 1px solid var(--gray-6);
  display: flex;
  align-items: center;
  padding: 0 1rem;
  gap: 0.75rem;
  flex-shrink: 0;
  z-index: var(--z-index-docked);
  user-select: none;
}

.logo-box {
  width: var(--size-xs);
  height: var(--size-xs);
  border-radius: var(--radius-md);
  border: 1px solid var(--accent-a3);
  background-color: var(--accent-a1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-9);
  font-size: var(--font-size-xs);
  flex-shrink: 0;
}

.title {
  flex: 1;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--gray-12);
  letter-spacing: var(--letter-spacing-tight);
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
</style>
