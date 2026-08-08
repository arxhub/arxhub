import { watch } from 'vue'
import type { PanelStore } from './types'

const STORAGE_KEY = 'arxhub.panels.workspace'
// Coalesces bursts (dragging a split ratio, opening several files in a row) into one write instead of
// one per intermediate frame.
const PERSIST_DEBOUNCE_MS = 500

// localStorage may be absent (non-browser env) or throw (Safari private mode, sandboxed iframe,
// storage disabled) — mirrors use-rail-width.ts's guard. Losing persistence is fine; losing the
// workspace itself over a storage hiccup would not be.
function safeGetItem(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
  } catch {
    return null
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
  } catch {
    // Persistence unavailable — the in-memory workspace still works for this session.
  }
}

// Restores whatever was saved (best-effort: a corrupt or incompatible snapshot is dropped, not
// thrown), then persists every later change. Device-local by design — this is UI layout, not vault
// content, and never goes through sync. Call once, right where the store is created: registering the
// watcher in a component's setup scope would stop persisting the moment that component unmounts (the
// mini-app switches away), exactly the trap use-rail-width.ts's module-level effectScope works around.
export function restoreAndPersistWorkspace(store: PanelStore): void {
  const saved = safeGetItem(STORAGE_KEY)
  if (saved != null) {
    try {
      store.restore(JSON.parse(saved))
    } catch {
      // Shape changed, or the JSON itself is corrupt — start from an empty workspace rather than throw
      // during boot over a cache of UI state.
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  watch(
    () => store.serialize(),
    (state) => {
      clearTimeout(timer)
      timer = setTimeout(() => safeSetItem(STORAGE_KEY, JSON.stringify(state)), PERSIST_DEBOUNCE_MS)
    },
  )
}
