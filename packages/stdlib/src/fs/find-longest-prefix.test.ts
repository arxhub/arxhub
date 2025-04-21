import { describe, expect, it } from 'vitest'
import { findLongestPrefix } from './find-longest-prefix'

describe('findLongestPrefix', () => {
  it('should find the longest matching prefix', () => {
    const prefixes = ['/a', '/a/b', '/a/b/c']
    expect(findLongestPrefix(prefixes, '/a/b/c/d')).toBe('/a/b/c')
  })

  it('should return undefined if no prefix matches', () => {
    const prefixes = ['/a', '/b', '/c']
    expect(findLongestPrefix(prefixes, '/d/e')).toBeUndefined()
  })

  it('should handle empty prefixes array', () => {
    expect(findLongestPrefix([], '/a/b/c')).toBeUndefined()
  })

  it('should handle empty target string', () => {
    const prefixes = ['/a', '/b', '/c']
    expect(findLongestPrefix(prefixes, '')).toBeUndefined()
  })

  it('should match exact prefix', () => {
    const prefixes = ['/a', '/a/b', '/a/b/c']
    expect(findLongestPrefix(prefixes, '/a/b')).toBe('/a/b')
  })

  it('should handle prefixes with different lengths', () => {
    const prefixes = ['/a', '/ab', '/abc']
    expect(findLongestPrefix(prefixes, '/abc/d')).toBe('/abc')
  })

  it('should handle case where multiple prefixes could match', () => {
    const prefixes = ['/a', '/a/b', '/a/c']
    expect(findLongestPrefix(prefixes, '/a/b/d')).toBe('/a/b')
  })

  it('should handle prefixes that are not sorted by length', () => {
    const prefixes = ['/a/b/c', '/a', '/a/b']
    expect(findLongestPrefix(prefixes, '/a/b/c/d')).toBe('/a/b/c')
  })
})
