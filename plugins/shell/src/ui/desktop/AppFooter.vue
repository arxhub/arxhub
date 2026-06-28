<script setup lang="ts">
</script>

<template>
  <footer class="app-footer">
    <div class="left-section">
      <slot name="left" />
    </div>
    <div class="right-section">
      <slot name="right" />
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  height: 1.75rem;
  width: 100%;
  background-color: var(--gray-1);
  border-top: 1px solid var(--gray-6);
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  color: var(--gray-11);
  flex-shrink: 0;
  z-index: var(--z-index-docked);
  user-select: none;
}

.left-section,
.right-section {
  display: flex;
  align-items: stretch;
  height: 100%;
}
</style>
