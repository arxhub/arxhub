import { describe, expect, test } from 'vitest'
import { DEFAULT_SEARCH_PREFERENCES, parseSearchPreferences, serializeSearchPreferences } from '../ui/search-preferences'

// What is on the device was written by some build of this app and can be edited by hand, so reading it is
// where the toggles either come back intact or quietly reset (FR-231).
describe('the stored toggles', () => {
  test('survive a round trip', () => {
    const stored = { titlesOnly: true, caseSensitive: true, regex: false, sort: 'modified' } as const
    expect(parseSearchPreferences(serializeSearchPreferences(stored))).toEqual(stored)
  })

  test('nothing stored is the defaults', () => {
    expect(parseSearchPreferences(null)).toEqual(DEFAULT_SEARCH_PREFERENCES)
    expect(parseSearchPreferences('')).toEqual(DEFAULT_SEARCH_PREFERENCES)
  })

  test('an entry that is not an object at all is the defaults', () => {
    expect(parseSearchPreferences('{ not json')).toEqual(DEFAULT_SEARCH_PREFERENCES)
    expect(parseSearchPreferences('"a string"')).toEqual(DEFAULT_SEARCH_PREFERENCES)
    expect(parseSearchPreferences('null')).toEqual(DEFAULT_SEARCH_PREFERENCES)
  })

  // Field by field: one value an older build never wrote, or a hand edit got wrong, must not cost the
  // other three.
  test('a value that makes no sense falls back on its own', () => {
    expect(parseSearchPreferences('{"titlesOnly":true,"caseSensitive":"yes","sort":"sideways"}')).toEqual({
      titlesOnly: true,
      caseSensitive: false,
      regex: false,
      sort: 'relevance',
    })
  })

  test('every sort the engine knows is accepted', () => {
    for (const sort of ['relevance', 'title', 'modified']) {
      expect(parseSearchPreferences(`{"sort":"${sort}"}`).sort).toBe(sort)
    }
  })
})
