import { describe, expect, test } from 'vitest'
import { continuable } from '../crash-screen'

describe('continuable', () => {
  test('offers continue when every failure is in start()', () => {
    expect(continuable([{ plugin: 'sync', phase: 'start', error: new Error('x') }])).toBe(true)
  })

  test('refuses continue when a failure happened before start()', () => {
    expect(continuable([{ plugin: 'sync', phase: 'configure', error: new Error('x') }])).toBe(false)
  })

  test('refuses continue when one of several failures is not start()', () => {
    expect(
      continuable([
        { plugin: 'Shell', phase: 'start', error: new Error('a') },
        { plugin: 'sync', phase: 'configure', error: new Error('b') },
      ]),
    ).toBe(false)
  })

  test('refuses continue when bootFailures would be empty', () => {
    expect(continuable([])).toBe(false)
  })

  test('refuses continue for instantiate — no half-registered UI', () => {
    expect(continuable([{ plugin: null, phase: 'instantiate', error: new Error('x') }])).toBe(false)
  })
})
