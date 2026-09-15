<script setup lang="ts">
import { basename } from '@arxhub/path'
import { IconButton, Strip } from '@arxhub/uikit/core'
import { toaster, useArxHub } from '@arxhub/uikit/hooks'
import { canOpenExternally, openExternally, VaultVfs } from '@arxhub/vfs'
import { computed, onUnmounted, ref, watch } from 'vue'
import { formatBytes, mediaOf, resolveMediaSource } from '../media'

const props = defineProps<{ path: string }>()

const arxhub = useArxHub()
const vfs = arxhub.services.get(VaultVfs)
const canOpen = computed(() => canOpenExternally(vfs))

async function openInSystemApp(): Promise<void> {
  try {
    await openExternally(vfs, props.path)
  } catch (error) {
    arxhub.logger.error(`[preview] failed to open ${props.path} in the system app:`, error)
    const description = error instanceof Error ? error.message : String(error ?? '')
    toaster.create({ type: 'error', title: 'Could not open the file in the system app', description })
  }
}

const media = computed(() => mediaOf(props.path))
const name = computed(() => basename(props.path))
const url = ref('')
const size = ref<number | null>(null)
const loading = ref(false)
const error = ref('')
// Whether the bytes came through JS (a blob) or the element streams them itself (a URL) — what the
// meta line says, because the difference is the difference between "seeks" and "loaded whole".
const streamed = ref(false)

let blobUrl: string | null = null
let ticket = 0

function release() {
  if (blobUrl != null) URL.revokeObjectURL(blobUrl)
  blobUrl = null
  url.value = ''
}

async function load() {
  const current = ++ticket
  release()
  error.value = ''
  size.value = null
  const kind = media.value
  if (kind == null) {
    error.value = 'Not a media file'
    return
  }
  loading.value = true
  try {
    const source = await resolveMediaSource(vfs, props.path, kind.mime)
    if (current !== ticket) return
    size.value = source.size
    if (source.kind === 'too-large') {
      streamed.value = false
      error.value = `${formatBytes(source.size)} is too large to load without streaming on this device`
      return
    }
    streamed.value = source.kind === 'url'
    if (source.kind === 'url') url.value = source.url
    else {
      blobUrl = URL.createObjectURL(new Blob([Uint8Array.from(source.bytes).buffer], { type: source.mime }))
      url.value = blobUrl
    }
  } catch (cause) {
    if (current !== ticket) return
    arxhub.logger.error(`[preview] could not load ${props.path}`, cause)
    error.value = cause instanceof Error ? cause.message : 'Could not load the file'
  } finally {
    if (current === ticket) loading.value = false
  }
}

const meta = computed(() => {
  if (size.value == null) return ''
  return streamed.value ? `${formatBytes(size.value)} · streamed` : formatBytes(size.value)
})

watch(
  () => props.path,
  () => void load(),
  { immediate: true },
)
onUnmounted(() => {
  ticket++
  release()
})
</script>

<template>
  <div class="media-panel">
    <Strip :title="name" :flush-actions="canOpen">
      <span v-if="meta" class="media-meta">{{ meta }}</span>
      <template v-if="canOpen" #actions>
        <IconButton size="lg" icon="lu:external-link" tooltip="Open in system app" @click="openInSystemApp" />
      </template>
    </Strip>
    <div class="media-stage">
      <p v-if="loading" class="media-state">Loading…</p>
      <template v-else-if="error">
        <p class="media-state">{{ error }}</p>
        <p class="media-path">{{ path }}</p>
      </template>
      <template v-else-if="url && media">
        <img v-if="media.kind === 'image'" class="media-image" :src="url" :alt="name" />
        <video v-else-if="media.kind === 'video'" class="media-video" :src="url" controls preload="metadata" :aria-label="name" />
        <audio v-else class="media-audio" :src="url" controls preload="metadata" :aria-label="name" />
      </template>
    </div>
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

.media-stage {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  overflow: auto;
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
}

.media-path {
  margin: 0;
  color: var(--gray-10);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  overflow-wrap: anywhere;
  text-align: center;
}
</style>
