import { describe, expect, it } from 'vitest'
import { normalizePath } from '../index'

describe('normalizePath', () => {
  it('strips leading slashes for vault-relative pathnames', () => {
    expect(normalizePath('/note.md')).toBe('note.md')
    expect(normalizePath('///a/b')).toBe('a/b')
  })

  it('leaves paths without a leading slash unchanged', () => {
    expect(normalizePath('note.md')).toBe('note.md')
    expect(normalizePath('')).toBe('')
  })
})
