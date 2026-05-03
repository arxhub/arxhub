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
  border-top: 1px solid var(--accent-a2);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 1rem;
  font-size: 0.625rem;
  color: var(--gray-11);
  font-family: var(--font-mono);
  flex-shrink: 0;
  z-index: var(--z-index-docked);
  user-select: none;
  box-shadow: var(--shadow-md);
}

.left-section {
  display: flex;
  align-items: center;
  height: 100%;
}

.right-section {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}
</style>
