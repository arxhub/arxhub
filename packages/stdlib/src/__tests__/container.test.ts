import { describe, expect, it } from 'vitest'
import { Container } from '../collections/container'

describe('Container', () => {
  it('distinguishes a missing key from a stored undefined value', () => {
    const c = new Container<undefined>('Test')
    c.set('optional', undefined)

    expect(c.has('optional')).toBe(true)
    expect(c.getOrNull('optional')).toBeUndefined()
    expect(c.get('optional')).toBeUndefined()
    expect(c.getOrNull('missing')).toBeNull()
    expect(() => c.get('missing')).toThrow(/Test/)
  })
})
