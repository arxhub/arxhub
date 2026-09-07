import { describe, expect, test } from 'vitest'
import { blockAnchorOf, noteSnapshotPath } from '../notes-type'

describe('the address of a place inside a note', () => {
  test('is read from the matched text', () => {
    expect(blockAnchorOf({ text: 'delivery total' })).toEqual({ text: 'delivery total' })
  })

  test('keeps the "how many identical ones came before" hint', () => {
    expect(blockAnchorOf({ text: 'invoice', skip: 2 })).toEqual({ text: 'invoice', skip: 2 })
  })

  // What arrives is data, not an instruction: the address comes from the index or from a saved link,
  // and a malformed field must not cost the opening of the object.
  test.each([
    ['nothing', undefined],
    ['null', null],
    ['a string instead of a record', 'invoice'],
    ['an array', ['invoice']],
    ['no text', { skip: 1 }],
    ['text that is not a string', { text: 7 }],
    ['blank text', { text: '   ' }],
  ])('%s — no address, rather than a throw', (_name, value) => {
    expect(blockAnchorOf(value as never)).toBeNull()
  })

  test.each([
    ['a negative skip', { text: 'invoice', skip: -3 }],
    ['a fractional skip', { text: 'invoice', skip: 1.5 }],
    ['a non-numeric skip', { text: 'invoice', skip: 'two' }],
    ['infinity', { text: 'invoice', skip: Number.POSITIVE_INFINITY }],
  ])('%s does not break the address — it is simply without a hint, or with a whole one', (_name, value) => {
    const anchor = blockAnchorOf(value as never)
    expect(anchor?.text).toBe('invoice')
    expect(anchor?.skip == null || Number.isInteger(anchor.skip)).toBe(true)
  })
})

describe('a note snapshot', () => {
  test('yields the path', () => {
    expect(noteSnapshotPath({ path: 'cases/contract.md' })).toBe('cases/contract.md')
  })

  test.each([
    ['null', null],
    ['not a record', 'cases/contract.md'],
    ['no path', { title: 'Contract' }],
    ['a path that is not a string', { path: 7 }],
  ])('%s — no path, and the tab is honestly marked as gone', (_name, value) => {
    expect(noteSnapshotPath(value as never)).toBeNull()
  })
})
