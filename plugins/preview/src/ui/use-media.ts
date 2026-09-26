import { basename } from '@arxhub/path'
import { formatBytes } from '@arxhub/stdlib/format/bytes'
import { toaster, useArxHub } from '@arxhub/uikit/hooks'
import { canOpenExternally, openExternally, VaultVfs } from '@arxhub/vfs'
import { computed, onUnmounted, ref, watch } from 'vue'
import { mediaOf, resolveMediaSource } from '../media'

// Everything a media viewer knows about its file, shared by both frames' realizations: each draws its own
// chrome around the one stage.
export function useMedia(path: () => string) {
  const arxhub = useArxHub()
  const vfs = arxhub.services.get(VaultVfs)
  const canOpen = computed(() => canOpenExternally(vfs))

  async function openInSystemApp(): Promise<void> {
    try {
      await openExternally(vfs, path())
    } catch (error) {
      arxhub.logger.error(`[preview] failed to open ${path()} in the system app:`, error)
      const description = error instanceof Error ? error.message : String(error ?? '')
      toaster.create({ type: 'error', title: 'Could not open the file in the system app', description })
    }
  }

  const media = computed(() => mediaOf(path()))
  const name = computed(() => basename(path()))
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
      const source = await resolveMediaSource(vfs, path(), kind.mime)
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
        blobUrl = URL.createObjectURL(new Blob([source.bytes], { type: source.mime }))
        url.value = blobUrl
      }
    } catch (cause) {
      if (current !== ticket) return
      arxhub.logger.error(`[preview] could not load ${path()}`, cause)
      error.value = cause instanceof Error ? cause.message : 'Could not load the file'
    } finally {
      if (current === ticket) loading.value = false
    }
  }

  const meta = computed(() => {
    if (size.value == null) return ''
    return streamed.value ? `${formatBytes(size.value)} · streamed` : formatBytes(size.value)
  })

  watch(path, () => void load(), { immediate: true })
  onUnmounted(() => {
    ticket++
    release()
  })

  return { canOpen, openInSystemApp, media, name, url, loading, error, meta }
}

export type MediaState = ReturnType<typeof useMedia>
