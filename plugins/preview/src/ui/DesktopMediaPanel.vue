<script setup lang="ts">
import { DocumentName } from '@arxhub/plugin-documents/ui'
import { IconButton, Strip } from '@arxhub/uikit/core'
import MediaStage from './MediaStage.vue'
import type { MediaState } from './use-media'

defineProps<{ path: string; state: MediaState }>()
</script>

<template>
  <div class="media-panel">
    <Strip :flush-actions="state.canOpen.value">
      <DocumentName :path="path" />
      <span v-if="state.meta.value" class="media-meta">{{ state.meta.value }}</span>
      <template v-if="state.canOpen.value" #actions>
        <IconButton size="lg" icon="lu:external-link" tooltip="Open in system app" @click="state.openInSystemApp" />
      </template>
    </Strip>
    <MediaStage :path="path" :state="state" />
  </div>
</template>

<style scoped>
.media-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--gray-1);
}

.media-meta {
  color: var(--gray-11);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  white-space: nowrap;
}
</style>
