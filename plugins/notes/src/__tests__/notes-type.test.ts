import { describe, expect, test } from 'vitest'
import { blockAnchorOf, noteSnapshotPath } from '../notes-type'

describe('the address of a place inside a note', () => {
  test('is read from the matched text', () => {
    expect(blockAnchorOf({ text: 'delivery total' })).toEqual({ text: 'delivery total' })
  })

  test('keeps the "how many identical ones came before" hint', () => {
    expect(blockAnchorOf({ text: 'invoice', skip: 2 })).toEqual({ text: 'invoice', skip: 2 })
  })

  // A search hit on an `.arx` block carries the block's own stable id — the precise address, ahead of
  // the text it merely fell back to.
  test('keeps the block and document ids, alongside the text', () => {
    expect(blockAnchorOf({ text: 'invoice', blockId: 'b1', documentId: 'd1', skip: 2 })).toEqual({
      text: 'invoice',
      skip: 2,
      blockId: 'b1',
      documentId: 'd1',
    })
  })

  test('an empty text is still a valid anchor once a block id names the place', () => {
    expect(blockAnchorOf({ text: '', blockId: 'b1' })).toEqual({ text: '', blockId: 'b1' })
  })

  test.each([
    ['a blockId that is not a string', { text: 'invoice', blockId: 7 }, { text: 'invoice' }],
    ['a blank blockId', { text: 'invoice', blockId: '' }, { text: 'invoice' }],
    ['a documentId that is not a string', { text: 'invoice', documentId: 7 }, { text: 'invoice' }],
    ['a blank documentId', { text: 'invoice', documentId: '' }, { text: 'invoice' }],
  ])('%s is dropped, and the rest of the anchor still stands', (_name, value, expected) => {
    expect(blockAnchorOf(value as never)).toEqual(expected)
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
