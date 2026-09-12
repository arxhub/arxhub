import { type SearchOptions, type SearchResult, searchRegexInvalid } from '@arxhub/sql'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { createSearchController, DEFAULT_SEARCH_DEBOUNCE_MS, SEARCH_REVALIDATE_MS, searchOptionsFor } from '../ui/search-controller'
import { DEFAULT_SEARCH_PREFERENCES, type SearchPreferences } from '../ui/search-preferences'

// Everything here is the controller alone: the debounce, which answer is allowed to reach the list, and
// which of the two places an error belongs in. No DBMS and no component — those are the parts that were
// already proven elsewhere, and the ones this cannot get wrong quietly.

function result(paths: readonly string[], extra: Partial<SearchResult> = {}): SearchResult {
  return {
    documents: paths.map((path) => ({
      path,
      title: path,
      dir: '',
      ext: 'md',
      modifiedAt: 0,
      score: 1,
      snippets: [],
    })),
    totalCount: paths.length,
    hasMore: false,
    warnings: [],
    durationMs: 1,
    ...extra,
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function preferences(overrides: Partial<SearchPreferences> = {}) {
  return ref<SearchPreferences>({ ...DEFAULT_SEARCH_PREFERENCES, ...overrides })
}

// The debounce is a timer and the answers are promises, so a step is "let the timer fire, then let every
// microtask it queued run".
async function settle(ms = DEFAULT_SEARCH_DEBOUNCE_MS): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  await nextTick()
  await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('searchOptionsFor', () => {
  test('maps the toggles onto what the engine takes and always asks for the first page', () => {
    expect(searchOptionsFor({ titlesOnly: true, caseSensitive: true, regex: true, sort: 'modified' }, 50)).toEqual({
      scope: 'titles',
      sort: 'modified',
      caseSensitive: true,
      regex: true,
      offset: 0,
      limit: 50,
    })
  })

  test('an unset scope is the whole document', () => {
    expect(searchOptionsFor(DEFAULT_SEARCH_PREFERENCES).scope).toBe('all')
  })
})

describe('the search controller', () => {
  test('refreshes when the index changes before the first answer arrives', async () => {
    const first = deferred<SearchResult>()
    const search = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(result(['saved.md']))
    const query = ref('')
    const indexRevision = ref(0)
    const controller = createSearchController({ search, query, preferences: preferences(), indexRevision })
    query.value = 'needle'
    await settle()
    expect(search).toHaveBeenCalledTimes(1)

    indexRevision.value++
    await nextTick()
    first.resolve(result([]))
    await settle(0)
    expect(controller.documents.value).toEqual([])
    await settle(SEARCH_REVALIDATE_MS)

    expect(search).toHaveBeenCalledTimes(2)
    expect(controller.documents.value.map((doc) => doc.path)).toEqual(['saved.md'])
    controller.dispose()
  })

  test('keeps keyboard selection stable and stops refreshing after disposal', async () => {
    const search = vi.fn(async () => result(['saved.md']))
    const query = ref('')
    const indexRevision = ref(0)
    const selected = ref(true)
    const controller = createSearchController({
      search,
      query,
      preferences: preferences(),
      indexRevision,
      canRefresh: () => !selected.value,
    })
    query.value = 'needle'
    await settle()
    indexRevision.value++
    await settle(SEARCH_REVALIDATE_MS)
    expect(search).toHaveBeenCalledTimes(1)
    selected.value = false
    indexRevision.value++
    await settle(SEARCH_REVALIDATE_MS)
    expect(search).toHaveBeenCalledTimes(2)
    controller.dispose()
    indexRevision.value++
    query.value = 'changed'
    await settle(SEARCH_REVALIDATE_MS)
    expect(search).toHaveBeenCalledTimes(2)
  })

  test('index batches do not postpone a query the owner has typed', async () => {
    const search = vi.fn(async () => result(['saved.md']))
    const query = ref('')
    const indexRevision = ref(0)
    const controller = createSearchController({ search, query, preferences: preferences(), indexRevision })
    query.value = 'needle'
    for (let batch = 0; batch < 4; batch++) {
      indexRevision.value++
      await settle(DEFAULT_SEARCH_DEBOUNCE_MS / 4)
    }
    expect(search).toHaveBeenCalledTimes(1)
    controller.dispose()
    await settle(SEARCH_REVALIDATE_MS)
    expect(search).toHaveBeenCalledTimes(1)
  })

  test('five characters in a row are one search', async () => {
    const search = vi.fn(async () => result(['a.md']))
    const query = ref('')
    const controller = createSearchController({ search, query, preferences: preferences() })

    for (const input of ['r', 'rh', 'rhi', 'rhin', 'rhino']) {
      query.value = input
      await nextTick()
      await vi.advanceTimersByTimeAsync(20)
    }
    await settle()

    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith('rhino', expect.objectContaining({ offset: 0 }))
    expect(controller.documents.value.map((d) => d.path)).toEqual(['a.md'])
    expect(controller.answered.value).toBe('rhino')
  })

  test('an answer to a query the owner has already replaced never reaches the list', async () => {
    const slow = deferred<SearchResult>()
    const fast = deferred<SearchResult>()
    const search = vi.fn((input: string): Promise<SearchResult> => (input === 'first' ? slow.promise : fast.promise))
    const query = ref('')
    const controller = createSearchController({ search, query, preferences: preferences() })

    query.value = 'first'
    await settle()
    query.value = 'second'
    await settle()
    expect(search).toHaveBeenCalledTimes(2)

    // The second question is answered first, which is the whole point: the first answer arrives last and
    // has to be thrown away rather than overwriting it.
    fast.resolve(result(['second.md']))
    await nextTick()
    slow.resolve(result(['first.md']))
    await settle(0)

    expect(controller.documents.value.map((d) => d.path)).toEqual(['second.md'])
    expect(controller.answered.value).toBe('second')
  })

  test('flipping a toggle asks again, from the first page', async () => {
    const search = vi.fn(async () => result(['a.md']))
    const query = ref('')
    const prefs = preferences()
    createSearchController({ search, query, preferences: prefs })
    query.value = 'rhino'
    await settle()
    expect(search).toHaveBeenCalledTimes(1)

    prefs.value = { ...prefs.value, titlesOnly: true }
    await settle()

    expect(search).toHaveBeenCalledTimes(2)
    expect(search).toHaveBeenLastCalledWith('rhino', expect.objectContaining({ scope: 'titles', offset: 0 }))
  })

  test('an empty field asks nothing and shows nothing', async () => {
    const search = vi.fn(async () => result(['a.md']))
    const query = ref('')
    const controller = createSearchController({ search, query, preferences: preferences() })
    query.value = 'rhino'
    await settle()
    expect(controller.documents.value).toHaveLength(1)

    query.value = '   '
    await settle()

    expect(search).toHaveBeenCalledTimes(1)
    expect(controller.documents.value).toEqual([])
    expect(controller.answered.value).toBe('')
  })

  test('an expression that does not parse is reported at the input and the list stays', async () => {
    const query = ref('')
    const prefs = preferences()
    const search = vi.fn((_input: string, options: SearchOptions): Promise<SearchResult> => {
      if (options.regex === true) return Promise.reject(searchRegexInvalid('(unclosed'))
      return Promise.resolve(result(['a.md']))
    })
    const controller = createSearchController({ search, query, preferences: prefs })
    query.value = 'rhino'
    await settle()

    prefs.value = { ...prefs.value, regex: true }
    await settle()

    expect(controller.queryError.value).toContain('(unclosed')
    expect(controller.documents.value.map((d) => d.path)).toEqual(['a.md'])
    expect(controller.resultsError.value).toBeNull()
  })

  test('a search that could not run at all is reported where the results would have been', async () => {
    const onError = vi.fn()
    const search = vi.fn(async () => {
      throw new Error('the search index is not open')
    })
    const query = ref('')
    const controller = createSearchController({ search, query, preferences: preferences(), onError })
    query.value = 'rhino'
    await settle()

    expect(controller.resultsError.value).toBe('the search index is not open')
    expect(controller.queryError.value).toBeNull()
    expect(onError).toHaveBeenCalledTimes(1)
  })

  test('the warnings of the answered query are what is on screen', async () => {
    const search = vi.fn(async () => result(['a.md'], { warnings: ['The quote is not closed.'], hasMore: true, totalCount: 99 }))
    const query = ref('')
    const controller = createSearchController({ search, query, preferences: preferences() })

    query.value = '"rhino'
    await settle()

    expect(controller.warnings.value).toEqual(['The quote is not closed.'])
    expect(controller.hasMore.value).toBe(true)
    expect(controller.totalCount.value).toBe(99)
  })

  test('a disposed controller lets nothing land', async () => {
    const answer = deferred<SearchResult>()
    const search = vi.fn(() => answer.promise)
    const query = ref('')
    const controller = createSearchController({ search, query, preferences: preferences() })
    query.value = 'rhino'
    await settle()

    controller.dispose()
    answer.resolve(result(['a.md']))
    await settle(0)

    expect(controller.documents.value).toEqual([])
  })
})
