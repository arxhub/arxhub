import { ConsoleLogger } from '@arxhub/core'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { beforeEach, describe, expect, test } from 'vitest'
import { EMPTY_SNAPSHOT_HASH } from '../empty-snapshot-hash'
import { SyncEngine } from '../engine'
import type { SyncRemote } from '../remote/sync-remote'
import { VfsSyncRemote } from '../remote/vfs-sync-remote'
import { Repo } from '../repo'
import type { Snapshot } from '../types'

// Wraps a SyncRemote and counts calls, so tests can assert the PROTOCOL shape (a no-change sync
// must transfer nothing), not just the end state.
class CountingRemote implements SyncRemote {
  readonly calls = { getHead: 0, setHead: 0, hasObjects: 0, getObjects: 0, putObjects: 0 }
  private readonly inner: SyncRemote

  constructor(inner: SyncRemote) {
    this.inner = inner
  }

  getHead(): Promise<string | null> {
    this.calls.getHead++
    return this.inner.getHead()
  }
  setHead(expected: string | null, next: string): Promise<boolean> {
    this.calls.setHead++
    return this.inner.setHead(expected, next)
  }
  hasObjects(hashes: string[]): Promise<Set<string>> {
    this.calls.hasObjects++
    return this.inner.hasObjects(hashes)
  }
  getObjects(hashes: string[]): Promise<Map<string, Uint8Array>> {
    this.calls.getObjects++
    return this.inner.getObjects(hashes)
  }
  putObjects(objects: Map<string, Uint8Array>): Promise<void> {
    this.calls.putObjects++
    return this.inner.putObjects(objects)
  }
}

function objectPath(hash: string): string {
  return `/objects/${hash.substring(0, 2)}/${hash.substring(2, 4)}/${hash}`
}

describe('SyncEngine', () => {
  let aVfs: VirtualFileSystem
  let bVfs: VirtualFileSystem
  let remoteStore: VirtualFileSystem
  let store: VfsSyncRemote
  let remote: CountingRemote
  let aRepo: Repo
  let bRepo: Repo
  // Two devices, one remote: the remote is a dumb object store, so "the other side has changes"
  // is always expressed as "the other DEVICE pushed changes".
  let a: SyncEngine
  let b: SyncEngine

  beforeEach(async () => {
    aVfs = new NodeFileSystem(`${__dirname}/testdata/engine/a`, new ConsoleLogger())
    bVfs = new NodeFileSystem(`${__dirname}/testdata/engine/b`, new ConsoleLogger())
    remoteStore = new NodeFileSystem(`${__dirname}/testdata/engine/remote`, new ConsoleLogger())
    await aVfs.delete('/', { force: true, recursive: true })
    await bVfs.delete('/', { force: true, recursive: true })
    await remoteStore.delete('/', { force: true, recursive: true })

    store = new VfsSyncRemote(remoteStore)
    remote = new CountingRemote(store)
    aRepo = new Repo(aVfs)
    bRepo = new Repo(bVfs)
    a = new SyncEngine({ local: aRepo, remote })
    b = new SyncEngine({ local: bRepo, remote })

    await aRepo.prepare()
    await bRepo.prepare()
  })

  async function readRemoteHeadSnapshot(): Promise<Snapshot> {
    const head = await store.getHead()
    if (head == null) throw new Error('remote head expected after sync')
    const objects = await store.getObjects([head])
    const bytes = objects.get(head)
    if (bytes == null) throw new Error('head snapshot object expected on remote')
    return JSON.parse(new TextDecoder().decode(bytes))
  }

  describe('add', () => {
    test('should add path to changes', async () => {
      await a.add('change.txt')

      const changes = await aRepo.getChangesFile().readJSON<string[]>([])
      expect(changes).toEqual(['change.txt'])
    })
  })

  describe('sync', () => {
    test('given only local side with changes should push', async () => {
      // Arrange
      await aVfs.file('local.txt').writeText('local content')
      await a.add('local.txt')

      // Act
      await a.sync()

      // Assert — the remote object store now holds the snapshot chain and the content chunk.
      const head = await readRemoteHeadSnapshot()
      expect(head).toEqual({
        // Snapshot hash is content-derived; parent is the empty snapshot (stable).
        hash: expect.any(String),
        parent: EMPTY_SNAPSHOT_HASH,
        timestamp: expect.any(Number),
        files: {
          'local.txt': {
            hash: 'a2553c361dbf7567dc499161607eb2c60c51fc2a4756c4ec3fef8b0b63386e48',
            pathname: 'local.txt',
            chunks: [
              {
                hash: 'a2553c361dbf7567dc499161607eb2c60c51fc2a4756c4ec3fef8b0b63386e48',
              },
            ],
          },
        },
      })
      const chunks = await store.hasObjects(['a2553c361dbf7567dc499161607eb2c60c51fc2a4756c4ec3fef8b0b63386e48'])
      expect(chunks.size).toBe(1)
    })

    test('given only remote side with changes should pull', async () => {
      // Arrange — the "remote change" is a push from device B.
      await bVfs.file('remote.txt').writeText('remote content')
      await b.add('remote.txt')
      await b.sync()

      // Act
      await a.sync()

      // Assert
      expect(await aVfs.file('remote.txt').readText()).toEqual('remote content')
    })

    test('given both sides with changes should merge and rebase onto the remote head', async () => {
      // Arrange
      await aVfs.file('local.txt').writeText('local content')
      await a.add('local.txt')

      await bVfs.file('remote.txt').writeText('remote content')
      await b.add('remote.txt')
      await b.sync()

      // Capture the remote head BEFORE A syncs: A's merged snapshot must be rebased onto it (its
      // parent == this hash). Pinning parent guards against rebasing onto the local head.
      const remoteHeadBefore = await store.getHead()

      // Act
      await a.sync()

      // Assert
      expect(await aVfs.file('remote.txt').readText()).toEqual('remote content')
      const head = await readRemoteHeadSnapshot()
      expect(head.parent).toEqual(remoteHeadBefore)
      expect(Object.keys(head.files).sort()).toEqual(['local.txt', 'remote.txt'])
    })

    test('given both sides modify same file should create conflict', async () => {
      // Arrange — a shared baseline on both devices.
      await aVfs.file('shared.txt').writeText('original')
      await a.add('shared.txt')
      await a.sync()
      await b.sync()

      // Both sides modify.
      await aVfs.file('shared.txt').writeText('local modified')
      await a.add('shared.txt')

      await bVfs.file('shared.txt').writeText('remote modified')
      await b.add('shared.txt')
      await b.sync()

      // Act
      await a.sync()

      // Assert — local edit wins in place, the remote edit lands as a conflict copy.
      expect(await aVfs.file('shared.txt').readText()).toEqual('local modified')
      expect(await aVfs.file('conflict-af216312-shared.txt').readText()).toEqual('remote modified')
    })

    test('given remote side modify same file should override', async () => {
      // Arrange
      await aVfs.file('shared.txt').writeText('original')
      await a.add('shared.txt')
      await a.sync()
      await b.sync()

      await bVfs.file('shared.txt').writeText('remote modified')
      await b.add('shared.txt')
      await b.sync()

      // Act
      await a.sync()

      // Assert
      expect(await aVfs.file('shared.txt').readText()).toEqual('remote modified')
    })

    test('devices converge: edits from both sides end up on both sides', async () => {
      await aVfs.file('a.txt').writeText('from a')
      await a.add('a.txt')
      await a.sync()

      await bVfs.file('b.txt').writeText('from b')
      await b.add('b.txt')
      await b.sync()

      await a.sync()
      expect(await aVfs.file('b.txt').readText()).toEqual('from b')
      expect(await bVfs.file('a.txt').readText()).toEqual('from a')
    })
  })

  describe('protocol shape', () => {
    test('a no-change re-sync transfers zero objects', async () => {
      await aVfs.file('note.txt').writeText('hello world')
      await a.add('note.txt')
      await a.sync()

      const before = { ...remote.calls }
      await a.sync()

      expect(remote.calls.getObjects).toBe(before.getObjects) // nothing fetched
      expect(remote.calls.putObjects).toBe(before.putObjects) // nothing pushed
      expect(remote.calls.setHead).toBe(before.setHead) // head untouched
    })
  })

  describe('zero-trust integrity', () => {
    test('a swapped snapshot blob is rejected', async () => {
      await aVfs.file('note.txt').writeText('hello world')
      await a.add('note.txt')
      await a.sync()

      const head = await store.getHead()
      if (head == null) throw new Error('remote head expected after sync')
      // Server swaps the blob under the head's address: it decodes to a snapshot with another hash.
      await remoteStore.file(objectPath(head)).writeText(JSON.stringify({ hash: 'deadbeef', parent: null, timestamp: 0, files: {} }))

      await expect(b.sync()).rejects.toThrow(/Snapshot integrity check failed/)
    })

    test('a forged snapshot that repeats the requested hash but lies about files is rejected', async () => {
      await aVfs.file('note.txt').writeText('hello world')
      await a.add('note.txt')
      await a.sync()

      const head = await store.getHead()
      if (head == null) throw new Error('remote head expected after sync')
      // The declared hash matches the address, but the files map does not hash to it.
      await remoteStore.file(objectPath(head)).writeText(JSON.stringify({ hash: head, parent: null, timestamp: 0, files: {} }))

      await expect(b.sync()).rejects.toThrow(/Snapshot integrity check failed/)
    })

    test('a tampered chunk blob is rejected and never lands in the local store', async () => {
      await aVfs.file('note.txt').writeText('hello world')
      await a.add('note.txt')
      await a.sync()

      const head = await readRemoteHeadSnapshot()
      const chunkHash = head.files['note.txt'].chunks[0].hash
      await remoteStore.file(objectPath(chunkHash)).writeText('tampered')

      await expect(b.sync()).rejects.toThrow(/Chunk integrity check failed/)
      expect(await bRepo.getChunkFile(chunkHash).exists()).toBe(false)
    })

    test('a lost head compare-and-swap fails the sync instead of overwriting', async () => {
      // A remote whose head is moved by "another device" between getHead and setHead.
      class RacedRemote extends CountingRemote {
        override setHead(): Promise<boolean> {
          return Promise.resolve(false)
        }
      }
      const raced = new SyncEngine({ local: aRepo, remote: new RacedRemote(store) })

      await aVfs.file('note.txt').writeText('hello world')
      await raced.add('note.txt')

      await expect(raced.sync()).rejects.toThrow(/Remote head moved during sync/)
    })
  })
})
