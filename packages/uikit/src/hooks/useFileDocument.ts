import { hasErrorCode } from '@arxhub/errors'
import { onMounted, onUnmounted, type Ref, ref, watch } from 'vue'

// Orchestrates loading a VFS-backed file into an editor panel and keeping it safe to persist.
// It is deliberately VFS- and editor-format-agnostic (everything is injected) so it can be shared
// by every editor plugin without uikit depending on any of them. It exists to kill four latent
// data-loss/staleness bugs the per-editor copies had:
//
//   1. Out-of-order loads. Switching A→B→A quickly, the slower load must NOT win. Each load takes a
//      monotonically increasing ticket; a result is applied only if its ticket is still current.
//   2. Read failure masquerading as an empty file. A transient read error must NOT open an editable
//      empty buffer that a subsequent Save would flush over the real (unread) content. Only a
//      genuine FileNotFound opens empty (creating a new file is legitimate); any other error sets
//      an error state and blocks saving until a clean reload.
//   3. Save during load. While a load is in flight (or after a read/build error) `canSave` is false,
//      so the editor can refuse to write the previous file's content to the new path.
//   4. Malformed content masquerading as an empty file. Bytes that exist but cannot be turned into
//      editor state (corrupt JSON, an incompatible schema — a damaged file or an interrupted write)
//      are NOT a legitimately-empty document. A `build` failure is routed through the exact same
//      error path as a read failure below, rather than the caller silently substituting an empty
//      document that a Save (or an autosave) would then flush over the original, still-recoverable
//      bytes.
export interface UseFileDocumentOptions<S> {
  // A mounted document changes path on rename; its unsaved buffer and undo still belong to it.
  retainOnPathChange?: boolean
  allowMissing?: boolean
  // Read the raw bytes for a path. Throw `fileNotFound` (code 'FileNotFound') for a genuinely-absent
  // file; throw anything else for a transport/IO failure.
  read(path: string): Promise<Uint8Array>
  // Build the editor-specific state from bytes. Receives an empty buffer when the file is absent —
  // that is the only case in which an empty document is legitimate. A thrown error is NOT absorbed
  // here: it is treated exactly like a read failure (see bug 4 above), so open an empty document only
  // when the bytes themselves are empty, never as a fallback for content that failed to parse.
  build(path: string, bytes: Uint8Array): Promise<S> | S
  // Apply freshly-built state to the live editor (create the view on first call, swap state after).
  apply(path: string, state: S): void
}

export interface FileDocument {
  // A load (initial mount or a path switch) is in flight.
  loading: Ref<boolean>
  // The last load failed with a non-FileNotFound error; the editor content is not trustworthy.
  error: Ref<unknown>
  // The document loaded cleanly and is safe to persist. False while loading or after a read error.
  canSave: Ref<boolean>
  // Force a reload of the given path (e.g. a retry button after an error).
  reload(path: string): Promise<void>
}

const EMPTY = new Uint8Array()

export function useFileDocument<S>(path: Ref<string>, options: UseFileDocumentOptions<S>): FileDocument {
  const loading = ref(false)
  const error = ref<unknown>(null)
  const canSave = ref(false)
  let ticket = 0

  async function reload(target: string): Promise<void> {
    const current = ++ticket
    loading.value = true
    error.value = null
    canSave.value = false

    let bytes: Uint8Array
    try {
      bytes = await options.read(target)
    } catch (e) {
      if (options.allowMissing !== false && hasErrorCode(e, 'FileNotFound')) {
        // Absent file → open empty; saving creates it. This is the only error that opens a buffer.
        bytes = EMPTY
      } else {
        // Transport/IO failure: surface it and keep canSave false so Save can't clobber the file
        // with empty/partial content. Drop the update if a newer load already superseded this one.
        if (current === ticket) {
          error.value = e
          loading.value = false
        }
        return
      }
    }

    let state: S
    try {
      state = await options.build(target, bytes)
    } catch (e) {
      // A build failure (corrupt JSON, an incompatible schema, …) means the bytes exist but cannot be
      // trusted — not that the file is empty. Same treatment as a read failure: surface it, keep
      // canSave false, and apply nothing, so the caller shows a banner instead of quietly opening an
      // empty document a Save (or an autosave) would flush over the original bytes.
      if (current === ticket) {
        error.value = e
        loading.value = false
      }
      return
    }
    // A newer load started while we were reading/building — its result must win, so drop ours.
    if (current !== ticket) return
    options.apply(target, state)
    loading.value = false
    canSave.value = true
  }

  onMounted(() => reload(path.value))
  watch(path, (target) => {
    if (options.retainOnPathChange && canSave.value) return
    void reload(target)
  })
  onUnmounted(() => {
    ticket++
  })

  return { loading, error, canSave, reload }
}
