import { describe, expect, test } from 'vitest'
import { DEFAULT_DIFF_SETTINGS, type DiffConfig, toDiffSettings } from '../diff-config'

// A hand-edited file can hold anything, so the tests feed values the schema's static type would refuse.
const read = (value: Record<string, unknown>) => toDiffSettings(value as Partial<DiffConfig>)

describe('toDiffSettings', () => {
  test('an empty file is the defaults', () => {
    expect(toDiffSettings({})).toEqual(DEFAULT_DIFF_SETTINGS)
    expect(DEFAULT_DIFF_SETTINGS).toEqual({ contextBlocks: 2, contextLines: 3 })
  })

  test('valid values pass through, bounds included', () => {
    expect(read({ 'context.blocks': 0, 'context.lines': 50 })).toEqual({ contextBlocks: 0, contextLines: 50 })
    expect(read({ 'context.blocks': 20, 'context.lines': 0 })).toEqual({ contextBlocks: 20, contextLines: 0 })
  })

  test('each nonsense field falls back on its own', () => {
    expect(read({ 'context.blocks': '4', 'context.lines': 5 })).toEqual({ contextBlocks: 2, contextLines: 5 })
    expect(read({ 'context.blocks': -1, 'context.lines': 1.5 })).toEqual({ contextBlocks: 2, contextLines: 3 })
    expect(read({ 'context.blocks': 21, 'context.lines': 51 })).toEqual({ contextBlocks: 2, contextLines: 3 })
    expect(read({ 'context.blocks': Number.NaN, 'context.lines': null })).toEqual({ contextBlocks: 2, contextLines: 3 })
  })
})
