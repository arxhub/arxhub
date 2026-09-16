import { describe, expect, it } from 'vitest'
import { renameTarget } from '../rename'

describe('renameTarget', () => {
  it('keeps the file in its own directory', () => {
    expect(renameTarget('notes/2026/draft.md', 'final.md')).toBe('notes/2026/final.md')
  })

  it('leaves a file at the root without a directory in front of it', () => {
    // './final.md' and 'final.md' are the same file and two different strings, and the workspace
    // compares paths — so the one that never grows a './' is the only safe answer.
    expect(renameTarget('draft.md', 'final.md')).toBe('final.md')
  })

  it('keeps an absolute path absolute', () => {
    expect(renameTarget('/vault/draft.md', 'final.md')).toBe('/vault/final.md')
  })

  it('trims what was typed', () => {
    expect(renameTarget('draft.md', '  final.md  ')).toBe('final.md')
  })

  it('takes the extension as typed — a name is whatever the owner wrote', () => {
    expect(renameTarget('draft.md', 'final.arx')).toBe('final.arx')
    expect(renameTarget('draft.md', 'final')).toBe('final')
  })

  it('refuses a name that is only whitespace', () => {
    expect(() => renameTarget('draft.md', '   ')).toThrow(/needs a name/)
  })

  it('refuses a separator — a rename is not a move', () => {
    expect(() => renameTarget('notes/draft.md', '../final.md')).toThrow(/slash/)
    expect(() => renameTarget('notes/draft.md', 'sub/final.md')).toThrow(/slash/)
    expect(() => renameTarget('notes/draft.md', 'sub\\final.md')).toThrow(/slash/)
  })

  it('refuses the two names that mean a directory', () => {
    expect(() => renameTarget('notes/draft.md', '.')).toThrow(/not a name/)
    expect(() => renameTarget('notes/draft.md', '..')).toThrow(/not a name/)
  })
})
