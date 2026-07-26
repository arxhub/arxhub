import { toaster, useArxHub } from '@arxhub/uikit/hooks'
import { type ComputedRef, computed, type Ref, ref } from 'vue'
import { SearchExtension } from '../search-extension'

export interface IndexStatusView {
  // The index is still being opened. Its bring-up is detached from the boot, so this is what the first
  // second after a cold start looks like — reachable, and not the same thing as an empty index.
  opening: ComputedRef<boolean>
  // The index could not be opened at all; nothing that reads it will work this session.
  unavailable: ComputedRef<boolean>
  // A walk over the content store is running.
  scanning: ComputedRef<boolean>
  // Opening, walking, or a rebuild just asked for — the Reindex control is inert in all three.
  busy: ComputedRef<boolean>
  tone: ComputedRef<'danger' | 'accent' | 'success'>
  // One line about the index: why it is unavailable, how far the walk has got, or what it holds.
  text: ComputedRef<string>
  reindex(): void
}

// The index's own status line and its rebuild control, shared by the Search rail and the settings section.
// Both show the same three states and offer the same one action, so the wording cannot drift between them.
export function useIndexStatus(): IndexStatusView {
  const arxhub = useArxHub()
  const search = arxhub.extensions.get(SearchExtension)

  const opening = computed(() => search.status.value === 'opening')
  const unavailable = computed(() => search.status.value === 'failed')
  const scanning = computed(() => search.status.value === 'scanning')
  const requested: Ref<boolean> = ref(false)
  const busy = computed(() => opening.value || scanning.value || requested.value)

  const tone = computed<'danger' | 'accent' | 'success'>(() =>
    unavailable.value ? 'danger' : opening.value || scanning.value ? 'accent' : 'success',
  )

  const text = computed(() => {
    if (unavailable.value) return `Search is unavailable: ${search.error.value ?? 'the index did not open.'}`
    // Said rather than left blank: the alternative reads "0 in index", which is a claim about the content
    // store and not about a database that has not answered yet.
    if (opening.value) return 'Opening the index…'
    if (scanning.value) return `Indexing… ${search.processed.value} processed`
    const at = search.lastScan.value
    const scanned = at == null ? '' : ` · scanned ${at.toLocaleTimeString()}`
    return `${search.documentCount.value} in index${scanned}`
  })

  function reindex(): void {
    if (busy.value || unavailable.value) return
    requested.value = true
    // Wrapped rather than called directly: reindex() throws synchronously when there is no indexer, and a
    // control must not let an exception out of a click handler.
    Promise.resolve()
      .then(() => search.reindex())
      .catch((error: unknown) => {
        arxhub.logger.error('[search] the reindex failed', error)
        toaster.create({ title: 'Could not rebuild the index', description: String(error), type: 'error' })
      })
      .finally(() => {
        requested.value = false
      })
  }

  return { opening, unavailable, scanning, busy, tone, text, reindex }
}
