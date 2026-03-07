<script setup lang="ts">
import MobileHeader from './components/MobileHeader.vue'
import BottomNav from './components/BottomNav.vue'
</script>

<template>
  <div class="mobile-shell">
    <MobileHeader />
    <main class="content-area">
      <slot />
    </main>
    <BottomNav />
  </div>
</template>

<style scoped>
.mobile-shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  width: 100%;
  overflow: hidden;
  background-color: var(--gray-1);
  color: var(--gray-12);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
}

.content-area {
  flex: 1;
  overflow-y: auto;
  background-color: var(--gray-2);
  overscroll-behavior: contain;
}

.content-area::-webkit-scrollbar {
  display: none;
}
</style>
