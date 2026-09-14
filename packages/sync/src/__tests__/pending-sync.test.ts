import { ConsoleLogger } from '@arxhub/core'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { beforeEach, describe, expect, test } from 'vitest'
import { SyncEngine } from '../engine'
import type { SyncRemote } from '../remote/sync-remote'
import { VfsSyncRemote } from '../remote/vfs-sync-remote'
import { Repo } from '../repo'
import type { Snapshot } from '../types'

// Records which objects were asked for, so a test can prove a declined file's chunk never crossed the wire.
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

// Two devices, one remote: B keeps everything, A leaves anything over 16 bytes in the cloud.
describe('a device that leaves large files in the cloud', () => {
  let aVfs: VirtualFileSystem
  let bVfs: VirtualFileSystem
  let store: VfsSyncRemote
  let remote: RecordingRemote
  let aRepo: Repo
  let bRepo: Repo
  let a: SyncEngine
  let b: SyncEngine

  beforeEach(async () => {
    aVfs = new NodeFileSystem(`${__dirname}/testdata/pending-sync/a`, new ConsoleLogger())
    bVfs = new NodeFileSystem(`${__dirname}/testdata/pending-sync/b`, new ConsoleLogger())
    const remoteStore = new NodeFileSystem(`${__dirname}/testdata/pending-sync/remote`, new ConsoleLogger())
    for (const vfs of [aVfs, bVfs, remoteStore]) await vfs.delete('/', { force: true, recursive: true })

    store = new VfsSyncRemote(remoteStore)
    remote = new RecordingRemote(store)
    aRepo = new Repo(aVfs)
    bRepo = new Repo(bVfs)
    aRepo.setMaterializePolicy((file) => (file.size ?? 0) <= 16)
    a = new SyncEngine({ local: aRepo, remote })
    b = new SyncEngine({ local: bRepo, remote })
    await aRepo.prepare()
    await bRepo.prepare()
  })

  async function remoteHead(): Promise<Snapshot> {
    const head = await store.getHead()
    if (head == null) throw new Error('remote head expected')
    const bytes = (await store.getObjects([head])).get(head)
    if (bytes == null) throw new Error('head object expected')
    return JSON.parse(new TextDecoder().decode(bytes))
  }

  test('the small file arrives, the large one stays in the cloud, and neither round pushes a deletion', async () => {
    await bVfs.file('vault/note.md').writeText('short note')
    await bVfs.file('vault/film.mp4').writeText('a film far longer than sixteen bytes')
    await b.add('vault')
    await b.sync()
    const filmChunk = (await remoteHead()).files['vault/film.mp4'].chunks[0].hash

    await a.sync()

    expect(await aVfs.file('vault/note.md').readText()).toBe('short note')
    expect(await aVfs.exists('vault/film.mp4')).toBe(false)
    expect(await aRepo.isPending('vault/film.mp4')).toBe(true)
    expect(remote.fetched).not.toContain(filmChunk)

    // The round that follows must not read the film's absence as A having deleted it.
    await aVfs.file('vault/from-a.md').writeText('edited on a')
    await a.add('vault')
    await a.sync()
    expect(Object.keys((await remoteHead()).files).sort()).toEqual(['vault/film.mp4', 'vault/from-a.md', 'vault/note.md'])

    await b.sync()
    expect(await bVfs.exists('vault/film.mp4')).toBe(true)
  })

  test('opening the file brings it down: exactly its chunks, then the write', async () => {
    await bVfs.file('vault/film.mp4').writeText('a film far longer than sixteen bytes')
    await b.add('vault')
    await b.sync()
    await a.sync()
    const filmChunk = (await remoteHead()).files['vault/film.mp4'].chunks[0].hash
    remote.fetched.length = 0

    await a.materialize('vault/film.mp4')

    expect(await aVfs.file('vault/film.mp4').readText()).toBe('a film far longer than sixteen bytes')
    expect(await aRepo.isPending('vault/film.mp4')).toBe(false)
    expect(remote.fetched).toEqual([filmChunk])

    // Now on disk, the file is kept current whatever the policy says about its size.
    await bVfs.file('vault/film.mp4').writeText('a film far longer than sixteen bytes, re-cut')
    await b.add('vault')
    await b.sync()
    await a.sync()
    expect(await aVfs.file('vault/film.mp4').readText()).toBe('a film far longer than sixteen bytes, re-cut')
  })

  test('a remote edit to a file left in the cloud updates the mark, not the disk', async () => {
    await bVfs.file('vault/film.mp4').writeText('a film far longer than sixteen bytes')
    await b.add('vault')
    await b.sync()
    await a.sync()

    await bVfs.file('vault/film.mp4').writeText('a film far longer than sixteen bytes, re-cut')
    await b.add('vault')
    await b.sync()
    await a.sync()

    expect(await aVfs.exists('vault/film.mp4')).toBe(false)
    expect(await aRepo.isPending('vault/film.mp4')).toBe(true)
    await a.materialize('vault/film.mp4')
    expect(await aVfs.file('vault/film.mp4').readText()).toBe('a film far longer than sixteen bytes, re-cut')
  })
})
