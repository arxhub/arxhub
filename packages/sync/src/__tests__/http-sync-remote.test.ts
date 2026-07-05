import { ConsoleLogger } from '@arxhub/core'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import Elysia from 'elysia'
import { beforeEach, describe, expect, test } from 'vitest'
import { HttpSyncRemote } from '../remote/http-sync-remote'
import { VfsSyncRemote } from '../remote/vfs-sync-remote'
import { objectStoreRoutes } from '../server'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const HASH_C = 'c'.repeat(64)

// Drives the typed HttpSyncRemote through the REAL syncRoutes Elysia app in-process (app.handle, no
// port): typed client → wretch → fetch → routes → VfsSyncRemote and back. Exercises octet-stream
// framing, per-status codes (409 CAS), and batch semantics — the full contract the types describe.
describe('HttpSyncRemote over syncRoutes', () => {
  let client: HttpSyncRemote

  beforeEach(async () => {
    const store: VirtualFileSystem = new NodeFileSystem(`${__dirname}/testdata/http-sync-remote`, new ConsoleLogger())
    await store.delete('/', { force: true, recursive: true })
    // Mount the relative routes under `/api/sync`, exactly as arxhub's gateway.forPlugin does.
    const app = new Elysia({ prefix: '/api/sync' }).use(objectStoreRoutes(new VfsSyncRemote(store)))
    const fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      app.handle(new Request(typeof input === 'string' ? input : input.toString(), init))) as typeof globalThis.fetch
    client = new HttpSyncRemote({ baseUrl: 'http://sync.test/api/sync', fetch })
  })

  test('head starts null and moves through compare-and-swap; a stale CAS 409s to false', async () => {
    expect(await client.getHead()).toBeNull()

    expect(await client.setHead(null, HASH_A)).toBe(true)
    expect(await client.getHead()).toBe(HASH_A)

    // Stale expectation (another device already moved it): server 409s, client reports false, head untouched.
    expect(await client.setHead(null, HASH_B)).toBe(false)
    expect(await client.getHead()).toBe(HASH_A)

    expect(await client.setHead(HASH_A, HASH_B)).toBe(true)
    expect(await client.getHead()).toBe(HASH_B)
  })

  test('puts and gets object batches as octet-stream frames; stat reports presence; absent omitted', async () => {
    const a = new TextEncoder().encode('alpha')
    const b = crypto.getRandomValues(new Uint8Array(4096))
    await client.putObjects(
      new Map([
        [HASH_A, a],
        [HASH_B, b],
      ]),
    )

    expect(await client.hasObjects([HASH_A, HASH_B, HASH_C])).toEqual(new Set([HASH_A, HASH_B]))

    const got = await client.getObjects([HASH_A, HASH_B])
    expect(got.get(HASH_A)).toEqual(a)
    expect(got.get(HASH_B)).toEqual(b)

    // Missing hashes are simply absent from the result map, not an error.
    expect((await client.getObjects([HASH_C])).size).toBe(0)
  })

  test('empty batches short-circuit without a request', async () => {
    expect(await client.hasObjects([])).toEqual(new Set())
    expect((await client.getObjects([])).size).toBe(0)
    await client.putObjects(new Map())
  })
})
