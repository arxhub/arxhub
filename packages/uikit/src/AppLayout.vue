<script setup lang="ts">
import AppHeader from './components/layout/AppHeader.vue'
import AppSidebar from './components/layout/AppSidebar.vue'
import AppFooter from './components/layout/AppFooter.vue'
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
  background-color: var(--bg-app);
  color: var(--text-main);
  font-family: var(--font-display);
  font-size: 0.875rem; /* text-sm */
}

.main-container {
  flex: 1;
  display: flex;
  min-height: 0;
  background-color: var(--bg-app);
}

.content-area {
  flex: 1;
  overflow-y: auto;
  background-color: var(--radix-gray-1);
}

/* Custom Scrollbar for content area */
.content-area::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.content-area::-webkit-scrollbar-track {
  background: transparent;
}
.content-area::-webkit-scrollbar-thumb {
  background: #313131;
  border-radius: 3px;
}
</style>
