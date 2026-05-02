<script setup lang="ts">
import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'

defineProps<{
  edge: Edge | null
}>()
</script>

<template>
  <div v-if="edge === 'left'" class="drop-indicator drop-indicator--left" />
  <div v-else-if="edge === 'right'" class="drop-indicator drop-indicator--right" />
</template>

<style scoped>
.drop-indicator {
  position: absolute;
  top: 2px;
  bottom: 2px;
  width: 2px;
  background-color: var(--accent-9);
  border-radius: 2px;
  pointer-events: none;
  z-index: 10;
  box-shadow: 0 0 4px var(--accent-7);
}

.drop-indicator--left {
  left: -1px;
}

.drop-indicator--right {
  right: -1px;
}
</style>
