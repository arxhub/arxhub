<script setup lang="ts">
import { DocumentName } from '@arxhub/plugin-notes/ui'
import { Strip } from '@arxhub/uikit/core'
import PdfZoomButtons from './PdfZoomButtons.vue'

defineProps<{
  path: string
  meta: string
  zoom: number
  onZoomOut: () => void
  onZoomIn: () => void
}>()
</script>

<template>
  <div class="pdf-shell">
    <Strip flush-actions>
      <DocumentName :path="path" />
      <span v-if="meta" class="pdf-meta">{{ meta }}</span>
      <template #actions>
        <PdfZoomButtons :zoom="zoom" :on-zoom-out="onZoomOut" :on-zoom-in="onZoomIn" />
      </template>
    </Strip>
    <slot />
  </div>
</template>

<style scoped>
.pdf-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.pdf-meta {
  color: var(--gray-11);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  white-space: nowrap;
}
</style>
