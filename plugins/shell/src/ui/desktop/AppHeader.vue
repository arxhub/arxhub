<script setup lang="ts">
</script>

<template>
  <header class="app-header">
    <div class="left-section">
      <slot name="left" />
    </div>

    <div class="center-section">
      <slot name="center" />
    </div>

    <div class="right-section">
      <slot name="right" />
    </div>
  </header>
</template>

<style scoped>
.app-header {
  height: var(--size-md);
  background-color: var(--gray-1);
  border-bottom: 1px solid var(--gray-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  flex-shrink: 0;
  z-index: var(--z-index-docked);
  user-select: none;
  font-size: var(--font-size-xs);
}

.left-section, .center-section, .right-section {
  width: 33.333%;
  display: flex;
  align-items: center;
}

.left-section {
  gap: 0.75rem;
}

.center-section {
  justify-content: center;
  gap: 0.5rem;
  color: var(--gray-11);
  font-family: var(--font-mono);
}

.right-section {
  justify-content: flex-end;
  gap: 0.25rem;
}
</style>
