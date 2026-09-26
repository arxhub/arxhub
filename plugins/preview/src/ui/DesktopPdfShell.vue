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
  <div class="pdf-shell">
    <Strip flush-actions>
      <DocumentName :path="path" />
      <span v-if="meta" class="pdf-meta">{{ meta }}</span>
      <template #actions>
        <ZoomControl :model-value="zoom" :min="MIN_ZOOM" :max="MAX_ZOOM" :step="ZOOM_STEP" :reset-to="DEFAULT_ZOOM" @update:model-value="onZoom" />
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
