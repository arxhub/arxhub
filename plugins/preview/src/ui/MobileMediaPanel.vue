<script setup lang="ts">
import { DocumentsExtension } from '@arxhub/plugin-documents'
import { useArxHub } from '@arxhub/uikit/hooks'
import { onUnmounted } from 'vue'
import MediaStage from './MediaStage.vue'
import type { MediaState } from './use-media'

const props = defineProps<{ path: string; state: MediaState }>()
const documents = useArxHub().extensions.get(DocumentsExtension)

const ICONS = { image: 'lu:image', video: 'lu:video', audio: 'lu:music' } as const

// The picture takes the whole screen: its name, its size and "open elsewhere" are the object band's.
onUnmounted(
  documents.registerViewBar(
    () => props.path,
    () => {
      const kind = props.state.media.value?.kind
      return {
        icon: kind == null ? 'lu:file' : ICONS[kind],
        sub: props.state.meta.value || undefined,
        actions: props.state.canOpen.value
          ? [
              {
                id: 'preview.open-external',
                label: 'Open in system app',
                icon: 'lu:external-link',
                onSelect: () => void props.state.openInSystemApp(),
              },
            ]
          : [],
      }
    },
  ),
)
</script>

<template>
  <div class="media-panel">
    <MediaStage class="touch" :path="path" :state="state" />
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
</style>
