import { useArxHub } from '@arxhub/uikit/hooks'
import { type MaybeRefOrGetter, type Ref, readonly, ref, type ShallowRef, shallowReadonly, shallowRef, toValue, watch } from 'vue'
import { DEFAULT_DIFF_SETTINGS, type DiffSettings } from '../diff-config'
import { DiffExtension } from '../diff-extension'
import type { DiffRequest } from '../differ'
import type { DiffResult } from '../model'
import { DIFF_LABELS } from './labels'

function diffExtension(): DiffExtension | null {
  const extensions = useArxHub().extensions
  return extensions.has(DiffExtension) ? extensions.get(DiffExtension) : null
}

// Runs the registry for every new request. Answers can arrive out of order (a large workbook, then a small note),
// so only the answer to the latest request is kept.
export function useDiff(request: MaybeRefOrGetter<DiffRequest | null>): {
  result: Readonly<ShallowRef<DiffResult | null>>
  loading: Readonly<Ref<boolean>>
  error: Readonly<Ref<string>>
} {
  const extension = diffExtension()
  const result = shallowRef<DiffResult | null>(null)
  const loading = ref(false)
  const error = ref('')
  let latest = 0

  watch(
    () => toValue(request),
    async (next) => {
      const ticket = ++latest
      result.value = null
      error.value = ''
      if (next == null) {
        loading.value = false
        return
      }
      if (extension == null) {
        loading.value = false
        error.value = DIFF_LABELS.disabled
        return
      }
      loading.value = true
      try {
        const answer = await extension.diff(next)
        if (ticket === latest) result.value = answer
      } catch (cause) {
        if (ticket === latest) error.value = cause instanceof Error && cause.message !== '' ? cause.message : DIFF_LABELS.failed
      } finally {
        if (ticket === latest) loading.value = false
      }
    },
    { immediate: true },
  )

  return { result: shallowReadonly(result), loading: readonly(loading), error: readonly(error) }
}

// A diff mounted without the plugin (a test harness) folds by the defaults rather than refusing to draw.
export function useDiffSettings(): Readonly<Ref<DiffSettings>> {
  return diffExtension()?.settings ?? shallowRef(DEFAULT_DIFF_SETTINGS)
}
