import { bip39Wordlist, validateMnemonic } from '@arxhub/crypto'

export const PHRASE_WORDS = 12

const known = new Set(bip39Wordlist)

// What a person pastes is a phrase as it was kept: one word per line, numbered ("1. orbit"), separated
// by commas, in capitals from a note app that capitalises lines. Only the words survive.
export function splitPhrase(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,;]+/)
    .map((token) => token.replace(/^\d+[.)]?/, '').replace(/[^a-z]/g, ''))
    .filter((word) => word !== '')
}

// A paste into one field: several words fill the fields from that one on — or from the first when it
// is a whole phrase, whichever field the caret was in. A single word is just that field's value.
export function pasteInto(words: readonly string[], index: number, text: string): { words: string[]; focus: number } {
  const pasted = splitPhrase(text)
  const next = [...words]
  if (pasted.length <= 1) {
    next[index] = pasted[0] ?? ''
    return { words: next, focus: index }
  }
  const start = pasted.length >= PHRASE_WORDS ? 0 : index
  for (let i = 0; i < pasted.length && start + i < PHRASE_WORDS; i++) next[start + i] = pasted[i]
  return { words: next, focus: Math.min(PHRASE_WORDS - 1, start + pasted.length - 1) }
}

export interface PhraseState {
  // Fields holding something that is certainly not a word of the list. The field being typed in is
  // spared while what it holds could still become one: "orb" is on its way to "orbit".
  badIndexes: number[]
  complete: boolean
  // Every word is a word of the list and yet the checksum fails: the order, or one word swapped for
  // another valid one. Only said once there is nothing else to say.
  orderWrong: boolean
  valid: boolean
}

export function phraseState(words: readonly string[], focus: number | null): PhraseState {
  const badIndexes: number[] = []
  words.forEach((word, index) => {
    if (word === '' || known.has(word)) return
    if (index === focus && bip39Wordlist.some((candidate) => candidate.startsWith(word))) return
    badIndexes.push(index)
  })
  const complete = words.length === PHRASE_WORDS && words.every((word) => known.has(word))
  const valid = complete && validateMnemonic(words.join(' '))
  return { badIndexes, complete, orderWrong: complete && !valid, valid }
}

// The words the field being typed in could still become, for the row of taps above the keyboard.
// Nothing once the field already holds a word of the list: the row would only repeat it.
export function phraseSuggestions(prefix: string, limit = 6): string[] {
  const typed = prefix.trim().toLowerCase()
  if (typed === '' || known.has(typed)) return []
  const found: string[] = []
  for (const word of bip39Wordlist) {
    if (!word.startsWith(typed)) continue
    found.push(word)
    if (found.length === limit) break
  }
  return found
}
