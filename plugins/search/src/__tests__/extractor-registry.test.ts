import { hasErrorCode } from '@arxhub/errors'
import type { DocumentExtractor } from '@arxhub/sql'
import { describe, expect, it } from 'vitest'
import { ExtractorRegistry } from '../extractor-registry'
import { SearchExtension } from '../search-extension'
import { silentLogger } from './fake-indexer'

function extractor(id: string, version = 1): DocumentExtractor {
  return { id, version, extensions: [`.${id}`], extract: () => null }
}

describe('ExtractorRegistry', () => {
  it('lists registrations in the order they arrived', () => {
    const registry = new ExtractorRegistry()
    registry.register(extractor('b'))
    registry.register(extractor('a'))
    expect(registry.list().map((it) => it.id)).toEqual(['b', 'a'])
  })

  it('refuses a second extractor under the same id', () => {
    const registry = new ExtractorRegistry()
    registry.register(extractor('arx'))
    expect(() => registry.register(extractor('arx', 2))).toThrow(/already registered/)
  })

  it('refuses a registration after the seal, as an illegal state', () => {
    const registry = new ExtractorRegistry()
    registry.seal()
    let caught: unknown
    try {
      registry.register(extractor('late'))
    } catch (error) {
      caught = error
    }
    expect(hasErrorCode(caught, 'IllegalStateError')).toBe(true)
  })

  it('still lets an owner unregister after the seal', () => {
    const registry = new ExtractorRegistry()
    const unregister = registry.register(extractor('pdf'))
    registry.seal()
    unregister()
    expect(registry.list()).toEqual([])
  })

  it('removes only the registration it returned the handle for', () => {
    const registry = new ExtractorRegistry()
    const stale = registry.register(extractor('pdf'))
    stale()
    registry.register(extractor('pdf', 2))
    stale()
    expect(registry.list().map((it) => it.version)).toEqual([2])
  })

  it('signs the set independently of the registration order', () => {
    const one = new ExtractorRegistry()
    one.register(extractor('a'))
    one.register(extractor('b'))
    const two = new ExtractorRegistry()
    two.register(extractor('b'))
    two.register(extractor('a'))
    expect(one.signature()).toBe(two.signature())
    expect(one.signature()).not.toBe(new ExtractorRegistry().signature())
  })
})

describe('SearchExtension.registerExtractor', () => {
  it('reaches the extension’s own registry', () => {
    const search = new SearchExtension({ logger: silentLogger() })
    const unregister = search.registerExtractor(extractor('arx'))
    expect(search.extractors.list().map((it) => it.id)).toEqual(['arx'])
    unregister()
    expect(search.extractors.list()).toEqual([])
  })
})
