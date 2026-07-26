import { effectScope, type Ref, ref, watch } from 'vue'

// The query the owner last had in the console. Device-local and not config: a half-written question is a
// property of the machine it was typed on, and closing the panel must not cost it (FR-236).
export const SQL_CONSOLE_QUERY_KEY = 'arxhub.search.console.query'

// An example to start from, so the console is not an empty box over an undocumented schema. Reaches for
// `document` because that is the table every other one hangs off.
export const SQL_CONSOLE_EXAMPLE = `SELECT path, title, kind, size
FROM document
ORDER BY mtime DESC
LIMIT 20`

// A pasted file, not a query: past this the entry is no longer something anyone typed, and localStorage is
// not a place to keep a megabyte.
const MAX_STORED_LENGTH = 20_000

export function parseConsoleQuery(raw: string | null): string {
  if (raw == null) return ''
  return raw.length > MAX_STORED_LENGTH ? raw.slice(0, MAX_STORED_LENGTH) : raw
}

// localStorage may be absent (a non-browser bundle) or throw (private mode, a sandboxed iframe, storage
// switched off). Guard both sides so the console still works, just without surviving a reload.
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
    // Nothing to do — the query stays in memory for this session.
  }
}

let shared: Ref<string> | null = null

// A module-lifetime scope, the same reason `useSearchPreferences` has one: the panel is unmounted whenever
// it is closed, and a watcher created in that component's scope would stop persisting from then on.
const persistScope = effectScope(true)

// One shared, persisted query text. Shared because two console panels would otherwise drift apart, and
// because the value has to be there when the panel comes back.
export function useConsoleQuery(): Ref<string> {
  let query = shared
  if (query == null) {
    query = ref(parseConsoleQuery(safeGetItem(SQL_CONSOLE_QUERY_KEY)))
    shared = query
    persistScope.run(() => {
      watch(query as Ref<string>, (value) => safeSetItem(SQL_CONSOLE_QUERY_KEY, parseConsoleQuery(value)))
    })
  }
  return query
}
