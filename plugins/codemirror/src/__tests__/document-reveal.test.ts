import { describe, expect, it } from 'vitest'
import { findOccurrence } from '../document-reveal'

describe('findOccurrence', () => {
  it('finds the first occurrence by default', () => {
    expect(findOccurrence('one two three', 'two')).toBe(4)
  })

  it('finds the Nth occurrence of a repeated line', () => {
    const text = ['Повтор', 'Другое', 'Повтор', 'Повтор'].join('\n')
    expect(findOccurrence(text, 'Повтор', 0)).toBe(0)
    expect(findOccurrence(text, 'Повтор', 1)).toBe(14)
    expect(findOccurrence(text, 'Повтор', 2)).toBe(21)
  })

  it('is not binding — an occurrence that is not there falls back to the first match', () => {
    const text = 'Repeated once'
    expect(findOccurrence(text, 'Repeated', 5)).toBe(0)
  })

  it('falls back to a case-insensitive scan only once the exact text is nowhere at all', () => {
    expect(findOccurrence('Some TEXT here', 'text')).toBe(5)
  })

  it('reports no match rather than guessing', () => {
    expect(findOccurrence('nothing here', 'missing')).toBe(-1)
    expect(findOccurrence('anything', '')).toBe(-1)
  })
})
