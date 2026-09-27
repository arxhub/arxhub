import { describeError, formatBytes } from '@arxhub/i18n'
import { basename } from '@arxhub/path'
import { toaster, useArxHub } from '@arxhub/uikit/hooks'
import { canOpenExternally, openExternally, VaultVfs } from '@arxhub/vfs'
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { t } from '../i18n/messages'
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
      const description = describeError(error)?.message || (error instanceof Error ? error.message : String(error ?? ''))
      toaster.create({ type: 'error', title: t('openExternalFailed'), description })
    }
  }

  const media = computed(() => mediaOf(path()))
  const name = computed(() => basename(path()))
  const url = ref('')
  const size = ref<number | null>(null)
  const loading = ref(false)
  // A function rather than the text, so a message on screen follows a language switch.
  const failure = shallowRef<(() => string) | null>(null)
  const error = computed(() => failure.value?.() ?? '')
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
    failure.value = null
    size.value = null
    const kind = media.value
    if (kind == null) {
      failure.value = () => t('media.notMedia')
      return
    }
    loading.value = true
    try {
      const source = await resolveMediaSource(vfs, path(), kind.mime)
      if (current !== ticket) return
      size.value = source.size
      if (source.kind === 'too-large') {
        streamed.value = false
        const tooLarge = source.size
        failure.value = () => t('media.tooLarge', { size: formatBytes(tooLarge) })
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
      failure.value = () => describeError(cause)?.message || (cause instanceof Error ? cause.message : t('media.loadFailed'))
    } finally {
      if (current === ticket) loading.value = false
    }
  }

  const meta = computed(() => {
    if (size.value == null) return ''
    return streamed.value ? t('media.streamed', { size: formatBytes(size.value) }) : formatBytes(size.value)
  })

  watch(path, () => void load(), { immediate: true })
  onUnmounted(() => {
    ticket++
    release()
  })

  return { canOpen, openInSystemApp, media, name, url, loading, error, meta }
}

export type MediaState = ReturnType<typeof useMedia>
