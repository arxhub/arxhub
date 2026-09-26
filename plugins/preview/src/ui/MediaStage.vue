<script setup lang="ts">
import { ScrollArea } from '@arxhub/uikit/core'
import type { MediaState } from './use-media'

defineProps<{ path: string; state: MediaState }>()
</script>

<template>
  <ScrollArea axis="both" class="media-stage" content-class="media-stage-inner">
    <p v-if="state.loading.value" class="media-state">Loading…</p>
    <template v-else-if="state.error.value">
      <p class="media-state">{{ state.error.value }}</p>
      <p class="media-path">{{ path }}</p>
    </template>
    <template v-else-if="state.url.value && state.media.value">
      <img v-if="state.media.value.kind === 'image'" class="media-image" :src="state.url.value" :alt="state.name.value" />
      <video v-else-if="state.media.value.kind === 'video'" class="media-video" :src="state.url.value" controls preload="metadata" :aria-label="state.name.value" />
      <audio v-else class="media-audio" :src="state.url.value" controls preload="metadata" :aria-label="state.name.value" />
    </template>
  </ScrollArea>
</template>

<style scoped>
.media-stage {
  flex: 1;
}

/* Exactly the viewport's height rather than at least it, so the picture's max-height: 100% resolves
   against a definite size and contains it, as it did against the old stage. The width is Ark's inline
   `min-width: fit-content`, which a scoped rule cannot override: it stays the viewport's only while
   every child can shrink to it, which is why the texts below break anywhere. */
.media-stage :deep(.media-stage-inner) {
  display: flex;
  flex: 1 1 0;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
}

.media-image,
.media-video {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.media-audio {
  width: 100%;
  max-width: 480px;
}

.media-state {
  margin: 0;
  color: var(--gray-11);
  font-size: var(--font-size-sm);
  text-align: center;
  overflow-wrap: anywhere;
}

.media-path {
  margin: 0;
  color: var(--gray-10);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  overflow-wrap: anywhere;
  text-align: center;
}

/* Set by the phone's realization: a touch frame reads its meta a step larger, as its rows do. */
.media-stage.touch .media-path {
  font-size: var(--font-size-sm);
}
</style>
