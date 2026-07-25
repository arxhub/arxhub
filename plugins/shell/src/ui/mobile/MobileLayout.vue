<script setup lang="ts">
import { Icon, Toaster } from '@arxhub/uikit/core'

const props = defineProps<{
  title: string
  drawerOpen: boolean
}>()
const emit = defineEmits<{ 'toggle-navigation': [] }>()
</script>

<template>
  <div class="mobile-shell">
    <header class="mobile-header">
      <button
        type="button"
        class="icon-button"
        :aria-label="props.drawerOpen ? 'Close navigation' : 'Open navigation'"
        :aria-expanded="props.drawerOpen"
        @click="emit('toggle-navigation')"
      >
        <Icon name="lu:menu" :size="20" />
      </button>
      <span class="mobile-title">{{ props.title }}</span>
      <div class="header-slot">
        <slot name="header-right" />
      </div>
    </header>

    <main class="mobile-content">
      <slot />
    </main>

    <footer class="mobile-footer">
      <slot name="footer" />
    </footer>

    <Toaster />
  </div>
</template>

<style scoped>
.mobile-shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  width: 100%;
  overflow: hidden;
  background: var(--gray-1);
  color: var(--gray-12);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
}

.mobile-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: var(--size-lg);
  padding: 0 0.5rem;
  padding-top: env(safe-area-inset-top);
  border-bottom: 1px solid var(--gray-6);
  background: var(--gray-2);
  flex-shrink: 0;
}

.mobile-title {
  flex: 1;
  font-weight: var(--font-weight-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-slot {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.mobile-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.mobile-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: var(--size-sm);
  padding: 0 0.5rem;
  padding-bottom: env(safe-area-inset-bottom);
  border-top: 1px solid var(--gray-6);
  background: var(--gray-2);
  flex-shrink: 0;
}

/* Touch targets: a finger needs the whole control, not an icon-sized hit box. */
.icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--size-md);
  height: var(--size-md);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--gray-11);
  cursor: pointer;
}

.icon-button:active {
  background: var(--gray-4);
}

</style>
