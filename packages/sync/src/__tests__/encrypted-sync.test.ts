import { ConsoleLogger } from '@arxhub/core'
import { generateMnemonic, keyringFromMnemonic } from '@arxhub/crypto'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { beforeEach, describe, expect, test } from 'vitest'
import { SyncEngine } from '../engine'
import { EncryptedSyncRemote } from '../remote/encrypted-sync-remote'
import { VfsSyncRemote } from '../remote/vfs-sync-remote'
import { Repo } from '../repo'

// Two devices sharing one mnemonic, syncing through an EncryptedSyncRemote over a common object store.
// Proves the MVP promise: content round-trips end-to-end, but the remote only ever holds ciphertext.
describe('encrypted two-device sync', () => {
  const NOTE = 'notes/secret.md'
  const CONTENT = 'the launch codes are 0000 — do not leak'

  let aVfs: VirtualFileSystem
  let bVfs: VirtualFileSystem
  let remoteStore: VirtualFileSystem // the raw, unencrypted view of what the server stores on disk
  let a: SyncEngine
  let b: SyncEngine
  let key: Uint8Array

  beforeEach(async () => {
    aVfs = new NodeFileSystem(`${__dirname}/testdata/encrypted/a`, new ConsoleLogger())
    bVfs = new NodeFileSystem(`${__dirname}/testdata/encrypted/b`, new ConsoleLogger())
    remoteStore = new NodeFileSystem(`${__dirname}/testdata/encrypted/remote`, new ConsoleLogger())
    for (const vfs of [aVfs, bVfs, remoteStore]) await vfs.delete('/', { force: true, recursive: true })

    // One mnemonic → one shared encryption key on both devices (the server never sees it).
    key = keyringFromMnemonic(generateMnemonic()).encryptionKey
    const aRepo = new Repo(aVfs)
    const bRepo = new Repo(bVfs)
    a = new SyncEngine({ local: aRepo, remote: new EncryptedSyncRemote(new VfsSyncRemote(remoteStore), key) })
    b = new SyncEngine({ local: bRepo, remote: new EncryptedSyncRemote(new VfsSyncRemote(remoteStore), key) })
    await aRepo.prepare()
    await bRepo.prepare()
  })

  // Read every object blob the server holds on disk (the raw, still-encrypted bytes).
  async function remoteObjectBytes(): Promise<Uint8Array[]> {
    const out: Uint8Array[] = []
    for await (const file of remoteStore.walk('/objects')) out.push(await file.read())
    return out
  }

  test('a note edited on A decrypts correctly on B', async () => {
    await aVfs.file(NOTE).writeText(CONTENT)
    await a.add(NOTE)
    await a.sync()

    await b.sync()
    expect(await bVfs.file(NOTE).readText()).toBe(CONTENT)
  })

  test('the remote holds only ciphertext — plaintext and pathnames never appear on disk', async () => {
    await aVfs.file(NOTE).writeText(CONTENT)
    await a.add(NOTE)
    await a.sync()

    const blobs = await remoteObjectBytes()
    expect(blobs.length).toBeGreaterThan(0)
    const decoder = new TextDecoder()
    for (const bytes of blobs) {
      const text = decoder.decode(bytes)
      expect(text).not.toContain(CONTENT) // chunk content is encrypted
      expect(text).not.toContain('secret.md') // snapshot manifest (pathnames) is encrypted too
      expect(text).not.toContain('"chunks"') // ...not readable JSON
    }
  })

  test('a device with the wrong key cannot decrypt the remote', async () => {
    await aVfs.file(NOTE).writeText(CONTENT)
    await a.add(NOTE)
    await a.sync()

    const wrongKey = keyringFromMnemonic(generateMnemonic()).encryptionKey
    const cVfs = new NodeFileSystem(`${__dirname}/testdata/encrypted/c`, new ConsoleLogger())
    await cVfs.delete('/', { force: true, recursive: true })
    const cRepo = new Repo(cVfs)
    await cRepo.prepare()
    const c = new SyncEngine({ local: cRepo, remote: new EncryptedSyncRemote(new VfsSyncRemote(remoteStore), wrongKey) })

    await expect(c.sync()).rejects.toThrow()
  })
})
