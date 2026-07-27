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
  height: 40px;
  background-color: var(--gray-2);
  border-bottom: 1px solid var(--gray-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  flex-shrink: 0;
  z-index: var(--z-index-docked);
  user-select: none;
  font-size: var(--font-size-sm);
}

.left-section, .center-section, .right-section {
  width: 33.333%;
  display: flex;
  align-items: center;
}

.left-section {
  gap: 8px;
}

.center-section {
  justify-content: center;
  gap: 8px;
  color: var(--gray-10);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
}

.right-section {
  justify-content: flex-end;
  gap: 4px;
}
</style>
