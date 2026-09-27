import { afterEach, describe, expect, it } from 'vitest'
import { formatBytes, formatDate, formatList, formatNumber, formatRelative, formatTime, locale } from '../format'
import { setLanguagePreference } from '../language'

afterEach(() => setLanguagePreference('en'))

describe('formatting follows the language', () => {
  it('numbers', () => {
    setLanguagePreference('en')
    expect(locale()).toBe('en')
    expect(formatNumber(1234.5)).toBe('1,234.5')
    setLanguagePreference('ru')
    expect(formatNumber(1234.5)).toBe('1 234,5')
  })

  it("bytes, in the reader's units, on the same steps as stdlib", () => {
    setLanguagePreference('en')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 MB')
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB')
    setLanguagePreference('ru')
    expect(formatBytes(512)).toBe('512 Б')
    expect(formatBytes(1536)).toBe('1,5 КБ')
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 МБ')
  })

  it('relative time picks the largest unit the distance fills', () => {
    const now = Date.UTC(2026, 0, 10, 12)
    setLanguagePreference('en')
    expect(formatRelative(now - 30_000, now)).toBe('30 seconds ago')
    expect(formatRelative(now - 3 * 60_000, now)).toBe('3 minutes ago')
    expect(formatRelative(now - 86_400_000, now)).toBe('yesterday')
    setLanguagePreference('ru')
    expect(formatRelative(now + 2 * 86_400_000, now)).toBe('послезавтра')
    expect(formatRelative(now - 5 * 3_600_000, now)).toBe('5 часов назад')
  })

  it('lists and dates', () => {
    setLanguagePreference('en')
    expect(formatList(['a', 'b', 'c'])).toBe('a, b, and c')
    setLanguagePreference('ru')
    expect(formatList(['а', 'б', 'в'])).toBe('а, б и в')
    const date = new Date(2026, 8, 27, 14, 5)
    expect(formatDate(date, { month: 'long', day: 'numeric' })).toBe('27 сентября')
    expect(formatTime(date)).toBe('14:05')
    setLanguagePreference('en')
    expect(formatDate(date, { month: 'long', day: 'numeric' })).toBe('September 27')
  })
})
