<script setup lang="ts">
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
import AppFooter from './AppFooter.vue'
</script>

<template>
  <div class="app-shell">
    <AppHeader />
    <div class="main-container">
      <AppSidebar />
      <main class="content-area">
        <slot />
      </main>
    </div>
    <AppFooter />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  overflow: hidden;
  background-color: var(--gray-1);
  color: var(--gray-12);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
}

.main-container {
  flex: 1;
  display: flex;
  min-height: 0;
  background-color: var(--gray-1);
}

.content-area {
  flex: 1;
  overflow: hidden;
  height: 100%;
  background-color: var(--gray-1);
}

</style>
