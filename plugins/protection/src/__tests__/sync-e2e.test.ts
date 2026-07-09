import { apiBaseUrl, ConsoleLogger } from '@arxhub/core'
import { keyringFromMnemonic, MutableRequestSigner } from '@arxhub/crypto'
import { EncryptedSyncRemote, HttpSyncRemote, Repo, SYNC_NAMESPACE, SyncEngine, VfsSyncRemote } from '@arxhub/sync'
import { objectStoreRoutes } from '@arxhub/sync/server'
import { ScopedFileSystem, type VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import Elysia from 'elysia'
import { beforeEach, describe, expect, test } from 'vitest'
import { RequestAuthenticator } from '../authenticator'
import { createAuthGuard } from '../server'

// The whole stack in one flow — the proof that "e2e sync" actually works, not just its slices:
//
//   Repo → SyncEngine → EncryptedSyncRemote → HttpSyncRemote → [ auth guard → sync routes → store ]
//
// Two devices share ONE recovery phrase (the real model: same mnemonic on phone + laptop), so they
// authenticate as the same pinned identity and derive the same content key. The server is exercised
// through its real HTTP surface (guard + routes), and only ever holds ciphertext.
describe('e2e: authenticated encrypted sync over HTTP', () => {
  // Same phrase on both devices → same auth key (one pinned identity) AND same encryption key.
  const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
  const OTHER = 'legal winner thank year wave sausage worth useful legal winner thank yellow'
  const NOTE = 'notes/journal.md'
  const CONTENT = '# Day one\n\nthe vault syncs end to end'

  // Absolute origin: HttpSyncRemote signs the host from the URL (a browser would use location.host on
  // a relative url; desktop/mobile point at an absolute serverUrl — this mirrors that path).
  const ORIGIN = 'http://hub.test'
  const BASE_URL = apiBaseUrl(ORIGIN, SYNC_NAMESPACE)

  let serverVfs: VirtualFileSystem
  let serverStore: VirtualFileSystem // the raw on-disk view of what the server persists
  let aVfs: VirtualFileSystem
  let bVfs: VirtualFileSystem
  let serverFetch: typeof fetch

  // Build a device's SyncEngine talking to the shared server over HTTP, signing with `mnemonic`.
  function deviceEngine(local: VirtualFileSystem, mnemonic: string): SyncEngine {
    const signer = new MutableRequestSigner()
    signer.install(keyringFromMnemonic(mnemonic))
    const key = keyringFromMnemonic(mnemonic).encryptionKey
    const remote = new EncryptedSyncRemote(new HttpSyncRemote({ baseUrl: BASE_URL, signer, fetch: serverFetch }), key)
    return new SyncEngine({ local: new Repo(local), remote })
  }

  beforeEach(async () => {
    serverVfs = new NodeFileSystem(`${__dirname}/testdata/e2e/server`, new ConsoleLogger())
    aVfs = new NodeFileSystem(`${__dirname}/testdata/e2e/a`, new ConsoleLogger())
    bVfs = new NodeFileSystem(`${__dirname}/testdata/e2e/b`, new ConsoleLogger())
    for (const vfs of [serverVfs, aVfs, bVfs]) await vfs.delete('/', { force: true, recursive: true })

    // The sync object store lives under repo/, exactly like every server instance wires it.
    serverStore = new ScopedFileSystem(serverVfs, 'repo')

    // The real gateway shape: global auth guard + the sync routes mounted at /api/sync. A fresh
    // authenticator per test starts unpinned (TOFU), so the first device to sync pins the shared key.
    const app = new Elysia()
      .use(createAuthGuard(new RequestAuthenticator()))
      .use(new Elysia({ prefix: apiBaseUrl('', SYNC_NAMESPACE) }).use(objectStoreRoutes(new VfsSyncRemote(serverStore))))
      .compile()

    serverFetch = ((input: Request | string | URL, init?: RequestInit) =>
      app.handle(new Request(typeof input === 'string' || input instanceof URL ? input.toString() : input, init))) as typeof fetch
  })

  test('a note written on device A round-trips to device B through the server', async () => {
    const a = deviceEngine(aVfs, MNEMONIC)
    const b = deviceEngine(bVfs, MNEMONIC)

    await aVfs.file(NOTE).writeText(CONTENT)
    await a.add(NOTE)
    await a.sync()

    await b.sync()
    expect(await bVfs.file(NOTE).readText()).toBe(CONTENT)
  })

  test('edits converge in both directions across repeated syncs', async () => {
    const a = deviceEngine(aVfs, MNEMONIC)
    const b = deviceEngine(bVfs, MNEMONIC)

    await aVfs.file(NOTE).writeText(CONTENT)
    await a.add(NOTE)
    await a.sync()
    await b.sync()

    // B adds a second file; A must see it after both sync.
    await bVfs.file('notes/todo.md').writeText('- ship it')
    await b.add('notes/todo.md')
    await b.sync()
    await a.sync()

    expect(await aVfs.file('notes/todo.md').readText()).toBe('- ship it')
  })

  test('the server persists only ciphertext (no plaintext, pathname, or JSON on disk)', async () => {
    const a = deviceEngine(aVfs, MNEMONIC)
    await aVfs.file(NOTE).writeText(CONTENT)
    await a.add(NOTE)
    await a.sync()

    const decoder = new TextDecoder()
    let objectCount = 0
    for await (const file of serverStore.walk('/objects')) {
      objectCount++
      const text = decoder.decode(await file.read())
      expect(text).not.toContain('vault syncs end to end') // chunk content
      expect(text).not.toContain('journal.md') // pathname in the snapshot manifest
      expect(text).not.toContain('"chunks"') // manifest JSON structure
    }
    expect(objectCount).toBeGreaterThan(0)
  })

  test('an unsigned client is rejected by the guard (no anonymous writes)', async () => {
    // No signer → HttpSyncRemote sends unauthenticated requests → guard 401s → sync throws.
    const unsigned = new SyncEngine({
      local: new Repo(aVfs),
      remote: new EncryptedSyncRemote(
        new HttpSyncRemote({ baseUrl: BASE_URL, fetch: serverFetch }),
        keyringFromMnemonic(MNEMONIC).encryptionKey,
      ),
    })
    await aVfs.file(NOTE).writeText(CONTENT)
    await unsigned.add(NOTE)
    await expect(unsigned.sync()).rejects.toThrow()
  })

  test('a device with a different recovery phrase cannot touch the pinned vault', async () => {
    // Device A pins the shared identity first.
    const a = deviceEngine(aVfs, MNEMONIC)
    await aVfs.file(NOTE).writeText(CONTENT)
    await a.add(NOTE)
    await a.sync()

    // An intruder with a valid signature but a DIFFERENT key is rejected (unknown-key).
    const intruder = deviceEngine(bVfs, OTHER)
    await expect(intruder.sync()).rejects.toThrow()
  })
})
