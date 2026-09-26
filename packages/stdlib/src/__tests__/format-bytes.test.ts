import { describe, expect, test } from 'vitest'
import { formatBytes } from '../format/bytes'

describe('formatBytes', () => {
  test('reads as a human would say it', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 MB')
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB')
  })
})
