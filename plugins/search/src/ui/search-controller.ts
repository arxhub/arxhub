import { hasErrorCode } from '@arxhub/errors'
import type { SearchDocument, SearchOptions, SearchResult } from '@arxhub/sql'
import { type Ref, ref, watch } from 'vue'
import type { SearchPreferences } from './search-preferences'

// How long after the last keystroke the search runs. A search is three statements against the index, so
// one per character would spend the whole budget answering strings the owner never finished (FR-230).
export const DEFAULT_SEARCH_DEBOUNCE_MS = 200

// Turns the toggles into what the engine takes. `offset` is always 0: a changed query or a flipped toggle
// is a different question, and answering its second page would be answering nothing the owner asked.
export function searchOptionsFor(preferences: SearchPreferences, limit?: number): SearchOptions {
  return {
    scope: preferences.titlesOnly ? 'titles' : 'all',
    sort: preferences.sort,
    caseSensitive: preferences.caseSensitive,
    regex: preferences.regex,
    offset: 0,
    ...(limit != null ? { limit } : {}),
  }
}

export interface SearchControllerOptions {
  search(input: string, options: SearchOptions): Promise<SearchResult>
  query: Ref<string>
  preferences: Ref<SearchPreferences>
  debounceMs?: number
  limit?: number
  // A failure that is not the owner's typo — reported as well as shown, because the owner cannot act on it.
  onError?: (error: unknown) => void
}

export interface SearchController {
  readonly documents: Ref<SearchDocument[]>
  readonly totalCount: Ref<number>
  // The list is cut at `limit` — there is more in the index than what is on screen.
  readonly hasMore: Ref<boolean>
  readonly warnings: Ref<string[]>
  // The query the list on screen answers. The empty state shows this rather than the field, so it says
  // what was searched instead of what is being typed right now.
  readonly answered: Ref<string>
  readonly searching: Ref<boolean>
  // The query itself is wrong — an expression that does not parse. Belongs at the input, and the previous
  // list stays where it was (FR-232).
  readonly queryError: Ref<string | null>
  // The search could not be run at all. Belongs in the results area.
  readonly resultsError: Ref<string | null>
  // Runs the current query now, skipping the debounce.
  flush(): Promise<void>
  dispose(): void
}

export function createSearchController(options: SearchControllerOptions): SearchController {
  const { search, query, preferences, debounceMs = DEFAULT_SEARCH_DEBOUNCE_MS, limit, onError } = options

  const documents = ref<SearchDocument[]>([])
  const totalCount = ref(0)
  const hasMore = ref(false)
  const warnings = ref<string[]>([])
  const answered = ref('')
  const searching = ref(false)
  const queryError = ref<string | null>(null)
  const resultsError = ref<string | null>(null)

  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight: Promise<void> = Promise.resolve()
  // Every request gets a number and only a higher one may write to the list: a slow answer to a query the
  // owner has already replaced would otherwise put the wrong documents on screen (FR-230.1.3).
  let issued = 0
  let applied = 0

  function clearTimer(): void {
    if (timer == null) return
    clearTimeout(timer)
    timer = null
  }

  function clear(): void {
    documents.value = []
    totalCount.value = 0
    hasMore.value = false
    warnings.value = []
    answered.value = ''
    queryError.value = null
    resultsError.value = null
  }

  async function run(): Promise<void> {
    const input = query.value
    // An empty field is not a search. Bumping the number still matters: an answer to what was typed
    // before the field was cleared must not land in the list afterwards.
    const id = ++issued
    if (input.trim() === '') {
      applied = id
      searching.value = false
      clear()
      return
    }

    searching.value = true
    try {
      const result = await search(input, searchOptionsFor(preferences.value, limit))
      if (id <= applied) return
      applied = id
      documents.value = result.documents
      totalCount.value = result.totalCount
      hasMore.value = result.hasMore
      warnings.value = result.warnings
      answered.value = input
      queryError.value = null
      resultsError.value = null
    } catch (error) {
      if (id <= applied) return
      applied = id
      // An expression that does not parse is a typo in the field, so it is reported there and the list the
      // owner was reading stays. Anything else means the search did not happen at all, which belongs where
      // the results would have been.
      if (hasErrorCode(error, 'SearchRegexInvalidError')) {
        queryError.value = error.body.message
      } else {
        resultsError.value = error instanceof Error ? error.message : String(error)
        onError?.(error)
      }
    } finally {
      if (id === issued) searching.value = false
    }
  }

  function schedule(): void {
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      inFlight = run()
    }, debounceMs)
  }

  watch([query, preferences], schedule, { deep: true })

  return {
    documents,
    totalCount,
    hasMore,
    warnings,
    answered,
    searching,
    queryError,
    resultsError,
    async flush(): Promise<void> {
      clearTimer()
      inFlight = run()
      await inFlight
    },
    dispose(): void {
      clearTimer()
      // Nothing on screen after this, so an answer still in flight has nowhere to land.
      applied = ++issued
      void inFlight.catch(() => undefined)
    },
  }
}
