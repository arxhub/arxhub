import { ConsoleLogger } from '@arxhub/core'
import { hasErrorCode } from '@arxhub/errors'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { beforeEach, describe, expect, test } from 'vitest'
import { VfsSyncRemote } from '../remote/vfs-sync-remote'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

describe('VfsSyncRemote', () => {
  let store: VirtualFileSystem
  let remote: VfsSyncRemote

  beforeEach(async () => {
    store = new NodeFileSystem(`${__dirname}/testdata/vfs-sync-remote`, new ConsoleLogger())
    await store.delete('/', { force: true, recursive: true })
    remote = new VfsSyncRemote(store)
  })

  test('head starts null and moves only through a matching compare-and-swap', async () => {
    expect(await remote.getHead()).toBeNull()

    expect(await remote.setHead(null, HASH_A)).toBe(true)
    expect(await remote.getHead()).toBe(HASH_A)

    // Stale expectation (another device already moved it): refused, head untouched.
    expect(await remote.setHead(null, HASH_B)).toBe(false)
    expect(await remote.getHead()).toBe(HASH_A)

    expect(await remote.setHead(HASH_A, HASH_B)).toBe(true)
    expect(await remote.getHead()).toBe(HASH_B)
  })

  test('stores and returns objects; absent hashes are simply omitted', async () => {
    const bytes = new TextEncoder().encode('blob')
    await remote.putObjects(new Map([[HASH_A, bytes]]))

    expect(await remote.hasObjects([HASH_A, HASH_B])).toEqual(new Set([HASH_A]))

    const objects = await remote.getObjects([HASH_A, HASH_B])
    expect(objects.get(HASH_A)).toEqual(bytes)
    expect(objects.has(HASH_B)).toBe(false)
  })

  test('rejects malformed hashes before touching storage', async () => {
    try {
      await remote.putObjects(new Map([['../escape', new Uint8Array([1])]]))
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(hasErrorCode(e, 'ValidationError')).toBe(true)
    }
    try {
      await remote.setHead(null, 'nope')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(hasErrorCode(e, 'ValidationError')).toBe(true)
    }
  })
})
