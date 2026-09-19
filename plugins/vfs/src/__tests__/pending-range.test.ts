import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConsoleLogger } from '@arxhub/core'
import { Repo, SyncEngine, type SyncRemote, VfsSyncRemote } from '@arxhub/sync'
import { ScopedFileSystem, VfsWatcher, type VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { PendingAwareVaultFileSystem, PendingRangeBroker, VfsExtension } from '../range-reader'

class RecordingRemote implements SyncRemote {
  readonly fetched: string[] = []
  constructor(private readonly inner: SyncRemote) {}
  getHead(): Promise<string | null> {
    return this.inner.getHead()
  }
  setHead(expected: string | null, next: string): Promise<boolean> {
    return this.inner.setHead(expected, next)
  }
  hasObjects(hashes: string[]): Promise<Set<string>> {
    return this.inner.hasObjects(hashes)
  }
  getObjects(hashes: string[]): Promise<Map<string, Uint8Array>> {
    this.fetched.push(...hashes)
    return this.inner.getObjects(hashes)
  }
  putObjects(objects: Map<string, Uint8Array>): Promise<void> {
    return this.inner.putObjects(objects)
  }
}

function bytes(length: number, seed: number): Uint8Array {
  let state = seed >>> 0
  const result = new Uint8Array(length)
  for (let i = 0; i < length; i++) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    result[i] = state & 0xff
  }
  return result
}

describe('pending files through VaultVfs and VfsExtension', () => {
  let root: string
  let aVfs: VirtualFileSystem
  let bVfs: VirtualFileSystem
  let aRepo: Repo
  let a: SyncEngine
  let b: SyncEngine
  let remote: RecordingRemote
  let vault: PendingAwareVaultFileSystem
  let extension: VfsExtension
  let online = true

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'arxhub-pending-range-'))
    aVfs = new NodeFileSystem(join(root, 'a'), new ConsoleLogger())
    bVfs = new NodeFileSystem(join(root, 'b'), new ConsoleLogger())
    const remoteVfs = new NodeFileSystem(join(root, 'remote'), new ConsoleLogger())
    const remoteStore = new VfsSyncRemote(remoteVfs)
    remote = new RecordingRemote(remoteStore)
    aRepo = new Repo(aVfs)
    const bRepo = new Repo(bVfs)
    aRepo.setMaterializePolicy(() => false)
    a = new SyncEngine({ local: aRepo, remote })
    b = new SyncEngine({ local: bRepo, remote: remoteStore })
    await aRepo.prepare()
    await bRepo.prepare()

    const localVault = new ScopedFileSystem(aVfs, 'vault')
    const broker = new PendingRangeBroker()
    vault = new PendingAwareVaultFileSystem(localVault, new VfsWatcher(), broker)
    extension = new VfsExtension({ logger: new ConsoleLogger(), localVault, broker })
    extension.registerPendingRangeSource({
      openRangeReader: (path) =>
        aRepo.openPendingRangeReader(`vault/${path}`, async (hashes) => {
          if (!online) throw new Error('remote must not be used while offline')
          await a.fetchChunkObjects(hashes)
        }),
    })
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  test('ranges a pending multi-chunk file, stays pending, caches chunks and pins one session across a head change', async () => {
    const pathname = 'big.pdf'
    const first = bytes(1.5 * 1024 * 1024, 1)
    await bVfs.write(`vault/${pathname}`, first)
    await b.add('vault')
    await b.sync()
    await a.sync()

    const pinnedSnapshot = await aRepo.getHeadSnapshot()
    const pinnedFile = pinnedSnapshot.files[`vault/${pathname}`]
    expect(pinnedFile.chunks.length).toBeGreaterThanOrEqual(2)
    const boundary = pinnedFile.chunks[0].size
    if (boundary == null) throw new Error('sized chunk expected')

    expect(await vault.exists(pathname)).toBe(true)
    expect(await vault.head(pathname)).toMatchObject({ size: first.byteLength })
    expect(await aVfs.exists(`vault/${pathname}`)).toBe(false)
    expect(await aRepo.isPending(`vault/${pathname}`)).toBe(true)

    const reader = await extension.openRangeReader(pathname)
    expect(await reader.head()).toMatchObject({ size: first.byteLength })

    const second = bytes(first.byteLength + 257, 2)
    await bVfs.write(`vault/${pathname}`, second)
    await b.add('vault')
    await b.sync()
    await a.sync()

    remote.fetched.length = 0
    const slice = await reader.readRange(boundary - 10, 20)
    expect(slice).toEqual(first.slice(boundary - 10, boundary + 10))
    expect(remote.fetched).toEqual([pinnedFile.chunks[0].hash, pinnedFile.chunks[1].hash])

    online = false
    remote.fetched.length = 0
    await expect(reader.readRange(boundary - 10, 20)).resolves.toEqual(slice)
    expect(remote.fetched).toEqual([])

    online = true
    expect(await vault.head(pathname)).toMatchObject({ size: second.byteLength })
    expect(await vault.file(pathname).readRange(0, 32)).toEqual(second.slice(0, 32))
    expect(await aVfs.exists(`vault/${pathname}`)).toBe(false)
    expect(await aRepo.isPending(`vault/${pathname}`)).toBe(true)
  })
})
