<script setup lang="ts">
import { Toaster } from '@arxhub/uikit/core'
import AppFooter from './AppFooter.vue'
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
</script>

<template>
  <div class="app-shell">
    <div class="traffic-lights" aria-hidden="true">
      <div class="light red"></div>
      <div class="light yellow"></div>
      <div class="light green"></div>
    </div>
    <slot name="header">
      <AppHeader />
    </slot>
    <div class="main-container">
      <slot name="sidebar">
        <AppSidebar />
      </slot>
      <main class="content-area">
        <slot />
      </main>
    </div>
    <slot name="footer">
      <AppFooter />
    </slot>
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

/* Height tracks AppHeader — these sit on top of it, not beside it. */
.traffic-lights {
  position: absolute;
  top: 0;
  left: 0;
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
  z-index: var(--z-index-docked);
  opacity: 0.8;
}

.light {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
  border: 1px solid var(--black-a2);
}

.light.red { background-color: #E5484D; }
.light.yellow { background-color: #FFB224; }
.light.green { background-color: #30A46C; }
</style>
