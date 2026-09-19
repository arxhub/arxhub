import { ConsoleLogger } from '@arxhub/core'
import { hasErrorCode } from '@arxhub/errors'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { beforeEach, describe, expect, test } from 'vitest'
import { SyncEngine } from '../engine'
import type { SyncRemote } from '../remote/sync-remote'
import { VfsSyncRemote } from '../remote/vfs-sync-remote'
import { Repo } from '../repo'
import type { Snapshot, SnapshotFileChunk } from '../types'

// Records which objects were asked for, so a test can prove a read fetched exactly the chunks a slice
// intersects and nothing else. Copied from pending-sync.test.ts — same two-device shape.
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

// A long, non-repeating byte stream (xorshift32) — long enough (1.5 MiB) that the Rabin chunker's
// 512 KiB minimum guarantees several chunks, and varied enough that a simple repeating pattern would
// not have: a chunker can (and did, in an earlier draft of this test) cut a too-regular byte string
// into exactly one chunk, which defeats the whole point of the fixture.
function pseudoRandomBytes(length: number, seed = 1): Uint8Array {
  let state = seed >>> 0
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i++) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    bytes[i] = state & 0xff
  }
  return bytes
}

type ChunkSpan = { hash: string; start: number; end: number }

// Two devices, one remote: B keeps everything, A leaves anything over 16 bytes in the cloud — same
// fixture as pending-sync.test.ts. B writes one large file spanning several chunks; A never
// materializes it and reads slices of it straight from the chunks that cover them instead.
describe('reading a slice of a file left in the cloud', () => {
  const path = 'vault/big.bin'

  let aVfs: VirtualFileSystem
  let bVfs: VirtualFileSystem
  let store: VfsSyncRemote
  let remote: RecordingRemote
  let aRepo: Repo
  let a: SyncEngine
  let b: SyncEngine
  let content: Uint8Array
  let chunks: ChunkSpan[]

  async function remoteHead(): Promise<Snapshot> {
    const head = await store.getHead()
    if (head == null) throw new Error('remote head expected')
    const bytes = (await store.getObjects([head])).get(head)
    if (bytes == null) throw new Error('head object expected')
    return JSON.parse(new TextDecoder().decode(bytes))
  }

  function spansOf(entries: SnapshotFileChunk[]): ChunkSpan[] {
    let running = 0
    return entries.map((chunk) => {
      const size = chunk.size ?? 0
      const start = running
      running += size
      return { hash: chunk.hash, start, end: running }
    })
  }

  beforeEach(async () => {
    aVfs = new NodeFileSystem(`${__dirname}/testdata/chunk-range/a`, new ConsoleLogger())
    bVfs = new NodeFileSystem(`${__dirname}/testdata/chunk-range/b`, new ConsoleLogger())
    const remoteStore = new NodeFileSystem(`${__dirname}/testdata/chunk-range/remote`, new ConsoleLogger())
    for (const vfs of [aVfs, bVfs, remoteStore]) await vfs.delete('/', { force: true, recursive: true })

    store = new VfsSyncRemote(remoteStore)
    remote = new RecordingRemote(store)
    aRepo = new Repo(aVfs)
    const bRepo = new Repo(bVfs)
    aRepo.setMaterializePolicy((file) => (file.size ?? 0) <= 16)
    a = new SyncEngine({ local: aRepo, remote })
    b = new SyncEngine({ local: bRepo, remote })
    await aRepo.prepare()
    await bRepo.prepare()

    content = pseudoRandomBytes(1.5 * 1024 * 1024)
    await bVfs.file(path).write(content)
    await b.add('vault')
    await b.sync()
    await a.sync()

    const entry = (await remoteHead()).files[path]
    expect(entry.chunks.length).toBeGreaterThanOrEqual(2)
    chunks = spansOf(entry.chunks)

    // A declined the file (bigger than its 16-byte policy) — it is pending, not on disk, which is
    // exactly the situation readRange exists for.
    expect(await aVfs.exists(path)).toBe(false)
    expect(await aRepo.isPending(path)).toBe(true)

    remote.fetched.length = 0
  })

  test('a middle slice inside one chunk fetches exactly that chunk', async () => {
    const target = chunks[1]
    const offset = target.start + 10
    const length = Math.min(50, target.end - offset)

    const result = await a.readRange(path, offset, length)

    expect(remote.fetched).toEqual([target.hash])
    expect(result).toEqual(content.slice(offset, offset + length))
  })

  test('a slice straddling two chunks fetches exactly those two', async () => {
    const boundary = chunks[1].start
    const offset = boundary - 10
    const length = 20

    const result = await a.readRange(path, offset, length)

    expect(remote.fetched).toEqual([chunks[0].hash, chunks[1].hash])
    expect(result).toEqual(content.slice(offset, offset + length))
  })

  test('a second read of the same range fetches nothing — the chunks are already local', async () => {
    const offset = chunks[0].start + 5
    const length = 30
    await a.readRange(path, offset, length)
    remote.fetched.length = 0

    const result = await a.readRange(path, offset, length)

    expect(remote.fetched).toEqual([])
    expect(result).toEqual(content.slice(offset, offset + length))
  })

  test('a suffix range reads the last chunk only', async () => {
    const last = chunks[chunks.length - 1]

    const result = await a.readRange(path, -100)

    expect(remote.fetched).toEqual([last.hash])
    expect(result).toEqual(content.slice(content.length - 100))
  })

  test('an offset past EOF returns empty and fetches nothing', async () => {
    const result = await a.readRange(path, content.length + 1000)

    expect(result).toEqual(new Uint8Array(0))
    expect(remote.fetched).toEqual([])
  })

  test('a fractional offset rejects with ValidationError', async () => {
    try {
      await a.readRange(path, 1.5)
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(hasErrorCode(e, 'ValidationError')).toBe(true)
    }
  })

  test('a cached chunk whose byte length disagrees with the manifest is refused instead of zero-filling the result', async () => {
    const target = chunks[1]
    await a.readRange(path, target.start, Math.min(32, target.end - target.start))
    await aRepo.getChunkFile(target.hash).write(new Uint8Array([1]))
    remote.fetched.length = 0

    await expect(a.readRange(path, target.start, Math.min(32, target.end - target.start))).rejects.toThrow('manifest declares')
    expect(remote.fetched).toEqual([])
  })

  test('a legacy entry fetches and joins the whole file once per pinned reader without materialising it', async () => {
    const snapshot = await aRepo.getHeadSnapshot()
    const current = snapshot.files[path]
    const legacy: Snapshot = {
      ...snapshot,
      files: {
        ...snapshot.files,
        [path]: {
          ...current,
          size: undefined,
          chunks: current.chunks.map(({ hash }) => ({ hash })),
        },
      },
    }
    const reader = aRepo.openRangeReader(legacy, path, (hashes) => a.fetchChunkObjects(hashes))

    expect(await reader.head()).toMatchObject({ size: content.byteLength })
    expect(remote.fetched).toEqual(current.chunks.map(({ hash }) => hash))
    remote.fetched.length = 0

    await expect(reader.readRange(123, 45)).resolves.toEqual(content.slice(123, 168))
    expect(remote.fetched).toEqual([])
    expect(await aVfs.exists(path)).toBe(false)
    expect(await aRepo.isPending(path)).toBe(true)
  })

  test('inconsistent sized metadata is refused before remote work', async () => {
    const snapshot = await aRepo.getHeadSnapshot()
    const current = snapshot.files[path]
    const malformed: Snapshot = {
      ...snapshot,
      files: { ...snapshot.files, [path]: { ...current, size: (current.size ?? 0) + 1 } },
    }

    expect(() => aRepo.openRangeReader(malformed, path, (hashes) => a.fetchChunkObjects(hashes))).toThrow('total')
    expect(remote.fetched).toEqual([])
  })

  test('after materialize the file is on disk and no longer pending — readRange served the wait, the VFS serves the rest', async () => {
    await a.materialize(path)

    expect(await aRepo.isPending(path)).toBe(false)
    expect(await aVfs.exists(path)).toBe(true)
    expect(await aVfs.file(path).read()).toEqual(content)
  })
})
