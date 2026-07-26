import type { SearchSort } from '@arxhub/sql'
import { effectScope, type Ref, ref, watch } from 'vue'

// How the owner left the search field set up. Device-local and not config: which scope and which order
// suit the machine in front of you is a property of that machine, and syncing it would have a phone
// silently re-narrow a search on the desktop (FR-231).
export interface SearchPreferences {
  // 'titles' scope — a word that is only in the body of a note is then not an answer.
  titlesOnly: boolean
  caseSensitive: boolean
  regex: boolean
  sort: SearchSort
}

export const SEARCH_PREFERENCES_KEY = 'arxhub.search.preferences'

export const DEFAULT_SEARCH_PREFERENCES: SearchPreferences = {
  titlesOnly: false,
  caseSensitive: false,
  regex: false,
  sort: 'relevance',
}

const SORTS: readonly SearchSort[] = ['relevance', 'title', 'modified']

// Read field by field rather than trusted whole: the entry is device-local storage, which an older build
// wrote and a user can edit, and one unknown value must not cost the other three.
export function parseSearchPreferences(raw: string | null): SearchPreferences {
  if (raw == null || raw === '') return { ...DEFAULT_SEARCH_PREFERENCES }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ...DEFAULT_SEARCH_PREFERENCES }
  }
  if (parsed == null || typeof parsed !== 'object') return { ...DEFAULT_SEARCH_PREFERENCES }
  const record = parsed as Record<string, unknown>
  return {
    titlesOnly: boolean(record.titlesOnly, DEFAULT_SEARCH_PREFERENCES.titlesOnly),
    caseSensitive: boolean(record.caseSensitive, DEFAULT_SEARCH_PREFERENCES.caseSensitive),
    regex: boolean(record.regex, DEFAULT_SEARCH_PREFERENCES.regex),
    sort: SORTS.includes(record.sort as SearchSort) ? (record.sort as SearchSort) : DEFAULT_SEARCH_PREFERENCES.sort,
  }
}

export function serializeSearchPreferences(preferences: SearchPreferences): string {
  return JSON.stringify(preferences)
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

// localStorage may be absent (a non-browser bundle) or throw (private mode, a sandboxed iframe, storage
// switched off). Guard both sides so the toggles still work, just without surviving a reload.
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
    // Nothing to do — the preferences stay in memory for this session.
  }
}

let shared: Ref<SearchPreferences> | null = null

// A module-lifetime scope, the same reason `useRailWidth` has one: the rail unmounts every time the owner
// leaves the mini-app, and a watcher created in that component's scope would stop persisting from then on.
const persistScope = effectScope(true)

// One shared, persisted set of toggles. Shared because the rail is torn down on every navigation away from
// the mini-app, and the values have to be there when it comes back (FR-231).
export function useSearchPreferences(): Ref<SearchPreferences> {
  let preferences = shared
  if (preferences == null) {
    preferences = ref(parseSearchPreferences(safeGetItem(SEARCH_PREFERENCES_KEY)))
    shared = preferences
    persistScope.run(() => {
      watch(preferences as Ref<SearchPreferences>, (value) => safeSetItem(SEARCH_PREFERENCES_KEY, serializeSearchPreferences(value)), {
        deep: true,
      })
    })
  }
  return preferences
}
