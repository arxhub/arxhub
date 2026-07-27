<script setup lang="ts">
import { Toaster } from '@arxhub/uikit/core'
import AppSidebar from './AppSidebar.vue'
</script>

<template>
  <div class="app-shell">
    <!-- No fallback header or footer. A strip of chrome exists because something asked for it: an
         empty one still spends its height, and the header's fallback was what kept a blank 40px band
         across the top of the window even when the frame had decided against it. -->
    <slot name="header" />
    <div class="main-container">
      <slot name="sidebar">
        <AppSidebar />
      </slot>
      <main class="content-area">
        <slot />
      </main>
    </div>
    <slot name="footer" />
    <Toaster />
  </div>
</template>

<style scoped>
.app-shell {
  position: relative;
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
