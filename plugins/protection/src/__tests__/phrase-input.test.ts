import { generateMnemonic } from '@arxhub/crypto'
import { describe, expect, test } from 'vitest'
import { PHRASE_WORDS, pasteInto, phraseState, phraseSuggestions, splitPhrase } from '../entry/phrase-input'

const phrase = generateMnemonic().split(' ')
const empty = () => Array<string>(PHRASE_WORDS).fill('')

describe('splitPhrase', () => {
  test('keeps only the words of a phrase as it was kept', () => {
    expect(splitPhrase('1. Orbit\n2) velvet, 3 canyon;  mercy')).toEqual(['orbit', 'velvet', 'canyon', 'mercy'])
  })
})

describe('pasteInto', () => {
  test('a whole phrase fills every field, whichever one was focused', () => {
    const { words, focus } = pasteInto(empty(), 5, phrase.join(' '))
    expect(words).toEqual(phrase)
    expect(focus).toBe(PHRASE_WORDS - 1)
  })

  test('a few words fill from the focused field on', () => {
    const { words } = pasteInto(empty(), 10, 'alpha beta gamma')
    expect(words.slice(9)).toEqual(['', 'alpha', 'beta'])
  })

  test('a single word is only that field', () => {
    const { words, focus } = pasteInto(empty(), 3, '  Orbit ')
    expect(words[3]).toBe('orbit')
    expect(focus).toBe(3)
  })
})

describe('phraseState', () => {
  test('a word that is not in the list is flagged, a prefix being typed is not', () => {
    const words = empty()
    words[0] = 'orb'
    words[1] = 'orbx'
    expect(phraseState(words, 0).badIndexes).toEqual([1])
    // Once the caret leaves, an unfinished word is no longer on its way anywhere.
    expect(phraseState(words, 2).badIndexes).toEqual([0, 1])
  })

  test('the right words in the wrong order are an order problem, not a spelling one', () => {
    // One swap in sixteen keeps the checksum by chance; walk the pairs until one does not.
    let swapped = [...phrase]
    for (let i = 1; i < PHRASE_WORDS; i++) {
      swapped = [...phrase]
      ;[swapped[0], swapped[i]] = [swapped[i], swapped[0]]
      if (swapped[0] !== swapped[i] && !phraseState(swapped, null).valid) break
    }
    const state = phraseState(swapped, null)
    expect(state).toMatchObject({ badIndexes: [], complete: true, orderWrong: true, valid: false })
  })

  test('the phrase itself is valid', () => {
    expect(phraseState(phrase, null)).toEqual({ badIndexes: [], complete: true, orderWrong: false, valid: true })
  })

  test('an incomplete phrase says nothing about order', () => {
    const words = [...phrase]
    words[11] = ''
    expect(phraseState(words, 11)).toMatchObject({ complete: false, orderWrong: false, valid: false })
  })
})

describe('phraseSuggestions', () => {
  test('offers the words a prefix can still become', () => {
    const found = phraseSuggestions('orb')
    expect(found).toContain('orbit')
    expect(found.every((word) => word.startsWith('orb'))).toBe(true)
  })

  test('offers nothing for a finished word, an empty field, or a dead end', () => {
    expect(phraseSuggestions('orbit')).toEqual([])
    expect(phraseSuggestions('')).toEqual([])
    expect(phraseSuggestions('qqq')).toEqual([])
  })

  test('is capped', () => {
    expect(phraseSuggestions('a')).toHaveLength(6)
  })
})
