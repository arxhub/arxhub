<script setup lang="ts">
</script>

<template>
  <div class="welcome-panel">
    <h1>Welcome to ArxHub</h1>
    <p>Open a file to get started.</p>
  </div>
</template>

<style scoped>
.welcome-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  gap: 12px;
  color: var(--gray-10);
}

h1 {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--gray-12);
  margin: 0;
}

p {
  font-size: var(--font-size-sm);
  margin: 0;
}
</style>
