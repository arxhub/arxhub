import { describe, expect, it } from 'vitest'
import { interpolatedParts } from '../core/interpolated'

describe('interpolatedParts', () => {
  it("keeps the translation's own order of words and placeholders", () => {
    expect(interpolatedParts('{abs} не меняется, а {row} — строка')).toEqual([
      { kind: 'slot', name: 'abs' },
      { kind: 'text', text: ' не меняется, а ' },
      { kind: 'slot', name: 'row' },
      { kind: 'text', text: ' — строка' },
    ])
  })

  it('reads a sentence with no placeholder as one text part', () => {
    expect(interpolatedParts('Plain')).toEqual([{ kind: 'text', text: 'Plain' }])
  })
})
