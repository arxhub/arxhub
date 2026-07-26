import { describe, expect, test } from 'vitest'
import { describeRejection } from '../auth-status'

// The dialog is the only place a refused device gets explained, so every reason the server can send has
// to arrive with copy — and an unrecognised one must not render a blank dialog.
const SERVER_REASONS = ['missing', 'stale', 'bad-signature', 'unknown-key', 'replay']

describe('describeRejection', () => {
  test.each(SERVER_REASONS)('%s has a label, a title and a detail', (reason) => {
    const copy = describeRejection(reason)
    expect(copy.label).not.toBe('')
    expect(copy.title).not.toBe('')
    expect(copy.detail).not.toBe('')
  })

  test('a key mismatch names both ways out — the phrase and the server-side pin', () => {
    const copy = describeRejection('unknown-key')
    expect(copy.offerPhrase).toBe(true)
    expect(copy.fix).toContain('recovery phrase')
    expect(copy.fix).toContain('pinned-key')
  })

  // A clock skew is not fixed by re-entering the phrase, so the dialog must not offer it as the answer.
  test('a clock skew does not offer the recovery phrase', () => {
    expect(describeRejection('stale').offerPhrase).toBe(false)
  })

  test('a reason this build does not know still explains itself, and says which reason it was', () => {
    const copy = describeRejection('some-future-reason')
    expect(copy.detail).not.toBe('')
    expect(copy.title).toContain('some-future-reason')
  })

  test('a server that reported no reason still explains itself', () => {
    const copy = describeRejection(null)
    expect(copy.detail).not.toBe('')
    expect(copy.fix).toContain('server log')
  })
})
