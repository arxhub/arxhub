import { bip39Wordlist } from '@arxhub/crypto'

export interface PhraseQuestion {
  // 1-based, as the words are numbered on screen.
  position: number
  answer: string
  options: string[]
}

export const CHECKED_WORDS = 3
export const OPTIONS_PER_WORD = 3

// `random` returns [0, 1), like Math.random — injected so a test can pin the draw.
export type Random = () => number

function pickIndex(random: Random, length: number): number {
  return Math.min(length - 1, Math.floor(random() * length))
}

// Three positions of the phrase, each with the right word among two decoys. A decoy is never another
// word of the same phrase: "which word is #7" must have one answer, and a word the person also wrote
// down elsewhere on the paper would be a second.
export function phraseQuestions(words: readonly string[], random: Random = Math.random): PhraseQuestion[] {
  const positions: number[] = []
  while (positions.length < Math.min(CHECKED_WORDS, words.length)) {
    const position = pickIndex(random, words.length) + 1
    if (!positions.includes(position)) positions.push(position)
  }
  positions.sort((a, b) => a - b)

  const inPhrase = new Set(words)
  return positions.map((position) => {
    const answer = words[position - 1]
    const options = [answer]
    while (options.length < OPTIONS_PER_WORD) {
      const word = bip39Wordlist[pickIndex(random, bip39Wordlist.length)]
      if (!inPhrase.has(word) && !options.includes(word)) options.push(word)
    }
    // Shuffled, or the answer would always be the first segment.
    for (let i = options.length - 1; i > 0; i--) {
      const j = pickIndex(random, i + 1)
      ;[options[i], options[j]] = [options[j], options[i]]
    }
    return { position, answer, options }
  })
}
