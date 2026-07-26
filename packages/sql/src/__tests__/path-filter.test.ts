import { describe, expect, it } from 'vitest'
import { refCandidates } from '../index-document'
import { isIndexablePath, matchesGlob } from '../path-filter'

describe('isIndexablePath', () => {
  it('indexes a file of the content store', () => {
    expect(isIndexablePath('notes/example.md')).toBe(true)
    expect(isIndexablePath('/notes/example.md')).toBe(true)
  })

  it('leaves out the metadata sidecar and the folder marker', () => {
    expect(isIndexablePath('notes/example.md.arxmeta')).toBe(false)
    expect(isIndexablePath('notes/.keep')).toBe(false)
    expect(isIndexablePath('.keep')).toBe(false)
  })

  it('leaves out nothing for an empty exclude list, and the matches for a filled one', () => {
    expect(isIndexablePath('assets/photo.png', [])).toBe(true)
    expect(isIndexablePath('assets/photo.png', ['*.png'])).toBe(false)
    expect(isIndexablePath('assets/photo.png', ['assets/'])).toBe(false)
    expect(isIndexablePath('notes/example.md', ['assets/'])).toBe(true)
  })
})

describe('matchesGlob', () => {
  it('keeps * inside one segment and lets ** cross them', () => {
    expect(matchesGlob('a/b.md', 'a/*.md')).toBe(true)
    expect(matchesGlob('a/b/c.md', 'a/*.md')).toBe(false)
    expect(matchesGlob('a/b/c.md', 'a/**')).toBe(true)
    expect(matchesGlob('a/b.md', 'a/**/b.md')).toBe(true)
  })

  it('tries a pattern without a separator against the file name', () => {
    expect(matchesGlob('deep/inside/notes.tmp', '*.tmp')).toBe(true)
    expect(matchesGlob('deep/inside/notes.md', '*.tmp')).toBe(false)
  })

  it('treats the pattern characters as characters, not as a regular expression', () => {
    expect(matchesGlob('a+b.md', 'a+b.md')).toBe(true)
    expect(matchesGlob('aab.md', 'a+b.md')).toBe(false)
    expect(matchesGlob('a/b?.md', 'a/b?.md')).toBe(true)
  })
})

describe('refCandidates', () => {
  it('tries next to the document first, then from the root, each with the document extensions', () => {
    expect(refCandidates('notes/deep', 'target')).toEqual([
      'notes/deep/target',
      'notes/deep/target.md',
      'notes/deep/target.markdown',
      'notes/deep/target.arx',
      'notes/deep/target.txt',
      'notes/deep/target.text',
      'target',
      'target.md',
      'target.markdown',
      'target.arx',
      'target.txt',
      'target.text',
    ])
  })

  it('keeps an extension the link already carries', () => {
    expect(refCandidates('notes', '../other/file.md')).toEqual(['other/file.md'])
  })

  it('drops the anchor, the query and the percent encoding', () => {
    expect(refCandidates('', 'my%20note.md#section')).toEqual(['my note.md'])
  })

  it('gives nothing for a target that climbs out of the content store', () => {
    expect(refCandidates('', '../../escape.md')).toEqual([])
  })
})
