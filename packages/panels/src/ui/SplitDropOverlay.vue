<script setup lang="ts">
import type { DropZone } from '../composables/drag-types'

defineProps<{
  zone: DropZone | null
}>()
</script>

<template>
  <Transition name="split-overlay">
    <div v-if="zone" class="split-overlay" :class="`zone-${zone}`" />
  </Transition>
</template>

<style scoped>
.split-overlay {
  position: absolute;
  background: var(--accent-4);
  opacity: 0.6;
  pointer-events: none;
  z-index: 20;
  border: 2px solid var(--accent-9);
  border-radius: 2px;
}

.zone-top    { inset: 0 0 50% 0; }
.zone-bottom { inset: 50% 0 0 0; }
.zone-left   { inset: 0 50% 0 0; }
.zone-right  { inset: 0 0 0 50%; }
.zone-center { inset: 0; }

.split-overlay-enter-active,
.split-overlay-leave-active {
  transition: opacity 80ms ease;
}

.split-overlay-enter-from,
.split-overlay-leave-to {
  opacity: 0;
}
</style>
