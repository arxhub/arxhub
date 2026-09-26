import { bip39Wordlist, generateMnemonic } from '@arxhub/crypto'
import { describe, expect, it } from 'vitest'
import { CHECKED_WORDS, OPTIONS_PER_WORD, phraseQuestions } from '../entry/phrase-check'

describe('phraseQuestions', () => {
  it('asks about three distinct positions, in order, each with the right word among four', () => {
    for (let run = 0; run < 50; run++) {
      const words = generateMnemonic().split(' ')
      const questions = phraseQuestions(words)

      expect(questions).toHaveLength(CHECKED_WORDS)
      const positions = questions.map((q) => q.position)
      expect(new Set(positions).size).toBe(CHECKED_WORDS)
      expect([...positions].sort((a, b) => a - b)).toEqual(positions)
      for (const question of questions) {
        expect(question.position).toBeGreaterThanOrEqual(1)
        expect(question.position).toBeLessThanOrEqual(12)
        expect(question.answer).toBe(words[question.position - 1])
        expect(question.options).toHaveLength(OPTIONS_PER_WORD)
        expect(new Set(question.options).size).toBe(OPTIONS_PER_WORD)
        expect(question.options.filter((word) => word === question.answer)).toHaveLength(1)
      }
    }
  })

  it('never offers another word of the same phrase as a decoy', () => {
    for (let run = 0; run < 50; run++) {
      const words = generateMnemonic().split(' ')
      for (const question of phraseQuestions(words)) {
        const decoys = question.options.filter((word) => word !== question.answer)
        for (const decoy of decoys) {
          expect(words).not.toContain(decoy)
          expect(bip39Wordlist).toContain(decoy)
        }
      }
    }
  })

  it('does not always put the answer in the same place', () => {
    const words = generateMnemonic().split(' ')
    const places = new Set<number>()
    for (let run = 0; run < 40; run++) {
      for (const question of phraseQuestions(words)) places.add(question.options.indexOf(question.answer))
    }
    expect(places.size).toBeGreaterThan(1)
  })

  it('stays within bounds when the draw returns its upper edge', () => {
    const words = generateMnemonic().split(' ')
    let n = 0
    // Values right up to 1 (exclusive) and a repeating pattern, so positions still come out distinct.
    const draws = [0.999999, 0.5, 0.0, 0.25, 0.75, 0.1, 0.9]
    const questions = phraseQuestions(words, () => draws[n++ % draws.length])
    for (const question of questions) expect(question.options).toContain(question.answer)
  })
})
