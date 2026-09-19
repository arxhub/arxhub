import type { Logger } from '@arxhub/logger'
import type { ContentMerger } from '@arxhub/sync'
import { describe, expect, test, vi } from 'vitest'
import { type ContentMergerRegistration, ContentMergerRegistry } from '../content-mergers'

const bytes = (text: string) => new TextEncoder().encode(text)
const text = (value: Uint8Array) => new TextDecoder().decode(value)

function fakeLogger(): Logger & { error: ReturnType<typeof vi.fn> } {
  const error = vi.fn()
  return { error, warn: vi.fn(), info: vi.fn(), debug: vi.fn(), child: () => fakeLogger() } as unknown as Logger & { error: typeof error }
}

const accept =
  (tag: string): ContentMerger =>
  async (_pathname, _base, local) => ({ merged: bytes(`${tag}:${text(local)}`), conflicts: 0 })
const decline: ContentMerger = async () => null

function registration(id: string, matches: (pathname: string) => boolean, merge: ContentMerger, fallback = false): ContentMergerRegistration {
  return { id, matches, merge, fallback }
}

describe('ContentMergerRegistry', () => {
  test('answers null with nothing registered', async () => {
    const registry = new ContentMergerRegistry(fakeLogger())
    expect(await registry.merge('a.md', null, bytes('l'), bytes('r'))).toBeNull()
  })

  test('asks the first registration whose matcher holds, in registration order', async () => {
    const registry = new ContentMergerRegistry(fakeLogger())
    registry.register(registration('first', (path) => path.endsWith('.md'), accept('first')))
    registry.register(registration('second', (path) => path.endsWith('.md'), accept('second')))

    const result = await registry.merge('note.md', null, bytes('l'), bytes('r'))
    expect(result && text(result.merged)).toBe('first:l')
  })

  test('skips a registration whose matcher does not hold', async () => {
    const registry = new ContentMergerRegistry(fakeLogger())
    const arx = vi.fn<ContentMerger>(accept('arx'))
    registry.register(registration('arx', (path) => path.endsWith('.arx'), arx))
    registry.register(registration('text', (path) => path.endsWith('.md'), accept('text')))

    const result = await registry.merge('note.md', null, bytes('l'), bytes('r'))
    expect(result && text(result.merged)).toBe('text:l')
    expect(arx).not.toHaveBeenCalled()
  })

  test('a decline (null) passes the file on to the next matching registration', async () => {
    const registry = new ContentMergerRegistry(fakeLogger())
    registry.register(registration('picky', () => true, decline))
    registry.register(registration('willing', () => true, accept('willing')))

    const result = await registry.merge('any', null, bytes('l'), bytes('r'))
    expect(result && text(result.merged)).toBe('willing:l')
  })

  test('a format owner runs before an earlier generic fallback', async () => {
    const registry = new ContentMergerRegistry(fakeLogger())
    const generic = vi.fn<ContentMerger>(accept('generic'))
    registry.register(registration('generic', () => true, generic, true))
    registry.register(registration('owner', () => true, accept('owner')))

    const result = await registry.merge('budget.jsonl', null, bytes('l'), bytes('r'))
    expect(result && text(result.merged)).toBe('owner:l')
    expect(generic).not.toHaveBeenCalled()
  })

  test.each(['declines', 'throws'] as const)('a format owner that %s suppresses generic fallback', async (outcome) => {
    const logger = fakeLogger()
    const registry = new ContentMergerRegistry(logger)
    const generic = vi.fn<ContentMerger>(accept('generic'))
    registry.register(registration('generic', () => true, generic, true))
    registry.register(
      registration(
        'owner',
        () => true,
        async () => {
          if (outcome === 'throws') throw new Error('broken owner')
          return null
        },
      ),
    )

    expect(await registry.merge('budget.jsonl', null, bytes('l'), bytes('r'))).toBeNull()
    expect(generic).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledTimes(outcome === 'throws' ? 1 : 0)
  })

  test('generic fallback still handles a path no format owner claims', async () => {
    const registry = new ContentMergerRegistry(fakeLogger())
    registry.register(registration('generic', (path) => path.endsWith('.md'), accept('generic'), true))
    registry.register(registration('owner', (path) => path.endsWith('.jsonl'), accept('owner')))

    const result = await registry.merge('note.md', null, bytes('l'), bytes('r'))
    expect(result && text(result.merged)).toBe('generic:l')
  })

  test('every matching registration declining is a null answer', async () => {
    const registry = new ContentMergerRegistry(fakeLogger())
    registry.register(registration('a', () => true, decline))
    registry.register(registration('b', () => true, decline))
    expect(await registry.merge('any', null, bytes('l'), bytes('r'))).toBeNull()
  })

  test('a merger that throws is logged and treated as a decline, never aborting the round', async () => {
    const logger = fakeLogger()
    const registry = new ContentMergerRegistry(logger)
    registry.register(
      registration(
        'broken',
        () => true,
        async () => {
          throw new Error('boom')
        },
      ),
    )
    registry.register(registration('willing', () => true, accept('willing')))

    const result = await registry.merge('any', null, bytes('l'), bytes('r'))
    expect(result && text(result.merged)).toBe('willing:l')
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(String(logger.error.mock.calls[0][0])).toContain('broken')
  })

  test('a matcher that throws is contained the same way', async () => {
    const logger = fakeLogger()
    const registry = new ContentMergerRegistry(logger)
    registry.register(
      registration(
        'broken',
        () => {
          throw new Error('boom')
        },
        accept('broken'),
      ),
    )
    registry.register(registration('willing', () => true, accept('willing')))

    const result = await registry.merge('any', null, bytes('l'), bytes('r'))
    expect(result && text(result.merged)).toBe('willing:l')
    expect(logger.error).toHaveBeenCalledTimes(1)
  })

  test('a duplicate id is refused', () => {
    const registry = new ContentMergerRegistry(fakeLogger())
    registry.register(registration('arx', () => true, decline))
    expect(() => registry.register(registration('arx', () => true, decline))).toThrow(/arx/)
  })

  test('the returned function unregisters, and the id is free again afterwards', async () => {
    const registry = new ContentMergerRegistry(fakeLogger())
    const unregister = registry.register(registration('arx', () => true, accept('arx')))
    unregister()
    expect(await registry.merge('any', null, bytes('l'), bytes('r'))).toBeNull()
    expect(() => registry.register(registration('arx', () => true, decline))).not.toThrow()
  })

  test('unregistering twice is a no-op, and does not remove a later registration under the same id', async () => {
    const registry = new ContentMergerRegistry(fakeLogger())
    const unregister = registry.register(registration('arx', () => true, accept('old')))
    unregister()
    registry.register(registration('arx', () => true, accept('new')))
    unregister()

    const result = await registry.merge('any', null, bytes('l'), bytes('r'))
    expect(result && text(result.merged)).toBe('new:l')
  })

  test('the merger passes the base, local and remote through untouched', async () => {
    const registry = new ContentMergerRegistry(fakeLogger())
    const merger = vi.fn<ContentMerger>(decline)
    registry.register(registration('spy', () => true, merger))

    const base = bytes('b')
    const local = bytes('l')
    const remote = bytes('r')
    await registry.merge('vault/note.md', base, local, remote)

    expect(merger).toHaveBeenCalledWith('vault/note.md', base, local, remote)
  })
})
