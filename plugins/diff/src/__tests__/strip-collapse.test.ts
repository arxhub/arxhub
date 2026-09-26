import { describe, expect, test } from 'vitest'
import { collapsedCount } from '../strip-collapse'

describe('collapsedCount', () => {
  // fixed 200; meta 120, summary 80, segment 100; gap 8 → everything needs 200 + 128 + 88 + 108 = 524.
  const parts = [120, 80, 100]

  test('nothing hides when everything fits', () => {
    expect(collapsedCount(524, 200, parts, 8)).toBe(0)
  })

  test('meta goes first, then summary, then the segment', () => {
    expect(collapsedCount(523, 200, parts, 8)).toBe(1)
    expect(collapsedCount(396, 200, parts, 8)).toBe(1)
    expect(collapsedCount(395, 200, parts, 8)).toBe(2)
    expect(collapsedCount(308, 200, parts, 8)).toBe(2)
    expect(collapsedCount(307, 200, parts, 8)).toBe(3)
  })

  test('too narrow even for the fixed part hides every part', () => {
    expect(collapsedCount(50, 200, parts, 8)).toBe(3)
  })

  test('no optional parts, nothing to hide', () => {
    expect(collapsedCount(10, 200, [], 8)).toBe(0)
  })
})
