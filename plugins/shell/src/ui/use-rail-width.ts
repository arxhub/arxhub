import { effectScope, type Ref, ref, watch } from 'vue'

export const RAIL_MIN = 160
export const RAIL_MAX = 480
const RAIL_DEFAULT = 240

// One shared ref per key so every mini-app rail using the same key stays in sync.
const widths = new Map<string, Ref<number>>()

// A module-lifetime effect scope detached from any component. The persistence watcher MUST live
// here, not in the first calling component's setup scope — otherwise when that component unmounts
// Vue disposes the watcher and every later width change silently stops persisting (the cached ref
// keeps working, but nothing writes it to localStorage).
const persistScope = effectScope(true)

function storageKey(key: string): string {
  return `arxhub.rail.${key}`
}

// localStorage may be absent (non-browser env) or throw (Safari private mode, sandboxed iframe,
// storage disabled). Guard both reads and writes so the rail still works, just without persistence.
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
    // Persistence unavailable — keep the in-memory width and carry on.
  }
}

function load(key: string): number {
  const raw = Number(safeGetItem(storageKey(key)))
  return Number.isFinite(raw) && raw > 0 ? Math.max(RAIL_MIN, Math.min(RAIL_MAX, raw)) : RAIL_DEFAULT
}

// Shared, persisted rail width keyed by name. The default key links every mini-app's
// left rail to a single width; pass a distinct key for an independent rail.
export function useRailWidth(key = 'default'): Ref<number> {
  let width = widths.get(key)
  if (!width) {
    width = ref(load(key))
    widths.set(key, width)
    // Register the persistence watcher in the detached module scope, not the caller's component
    // scope, so it survives that component unmounting.
    persistScope.run(() => {
      watch(width as Ref<number>, (value) => safeSetItem(storageKey(key), String(Math.round(value))))
    })
  }
  return width
}
