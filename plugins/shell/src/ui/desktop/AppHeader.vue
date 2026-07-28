<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { Strip } from '@arxhub/uikit/core'
</script>

<template>
  <Strip class="app-header">
    <div class="left-section">
      <slot name="left" />
    </div>

    <div class="center-section">
      <slot name="center" />
    </div>

    <div class="right-section">
      <slot name="right" />
    </div>
  </Strip>
</template>

<style scoped>
/* Height, surface, border, inset and text size come from the strip. What stays is this header's own
   layout — three equal sections, so the mono middle reads as centred on the window rather than on
   whatever the left section happens to hold. */
.app-header {
  z-index: var(--z-index-docked);
  user-select: none;
}

.left-section, .center-section, .right-section {
  width: 33.333%;
  display: flex;
  align-items: center;
}

.left-section {
  gap: 8px;
}

.center-section {
  justify-content: center;
  gap: 8px;
  color: var(--gray-10);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
}

.right-section {
  justify-content: flex-end;
  gap: 4px;
}
</style>
