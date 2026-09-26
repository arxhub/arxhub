<script setup lang="ts">
import { DocumentName } from '@arxhub/plugin-documents/ui'
import { Strip, ZoomControl } from '@arxhub/uikit/core'
import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from '../pdf'

defineProps<{
  path: string
  meta: string
  zoom: number
  onZoom: (value: number) => void
}>()
</script>

<template>
  <!-- Name + page count at the top; zoom in the thumb zone while reading. -->
  <div class="pdf-shell">
    <Strip>
      <DocumentName :path="path" />
      <span v-if="meta" class="pdf-meta">{{ meta }}</span>
    </Strip>
    <slot />
    <div class="pdf-status" role="toolbar" aria-label="Zoom">
      <ZoomControl :model-value="zoom" :min="MIN_ZOOM" :max="MAX_ZOOM" :step="ZOOM_STEP" :reset-to="DEFAULT_ZOOM" @update:model-value="onZoom" />
    </div>
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
  font-size: var(--font-size-sm);
  white-space: nowrap;
}

.pdf-status {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  flex-shrink: 0;
  min-height: var(--size-xl);
  padding: 4px 12px;
  border-top: 1px solid var(--gray-6);
  background: var(--gray-2);
}
</style>
