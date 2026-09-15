import { ConsoleLogger } from '@arxhub/core'
import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { beforeEach, expect, test } from 'vitest'
import { SyncEngine } from '../engine'
import { FileHistory } from '../file-history'
import { VfsSyncRemote } from '../remote/vfs-sync-remote'
import { Repo } from '../repo'
import { snapshotHash } from '../snapshot-hash'
import type { Snapshot } from '../types'

const encode = (text: string) => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
const identity = 'document-id'
const query = { identity }
let aTree: NodeFileSystem
let bTree: NodeFileSystem
let aRepo: Repo
let bRepo: Repo
let remoteStore: NodeFileSystem
let a: SyncEngine
let b: SyncEngine
let aHistory: FileHistory
let bHistory: FileHistory

beforeEach(async () => {
  const root = new NodeFileSystem(`${__dirname}/testdata/history`, new ConsoleLogger())
  await root.delete('/', { recursive: true, force: true })
  aTree = new NodeFileSystem(`${__dirname}/testdata/history/a/tree`, new ConsoleLogger())
  bTree = new NodeFileSystem(`${__dirname}/testdata/history/b/tree`, new ConsoleLogger())
  aRepo = new Repo(aTree, new NodeFileSystem(`${__dirname}/testdata/history/a/store`, new ConsoleLogger()))
  bRepo = new Repo(bTree, new NodeFileSystem(`${__dirname}/testdata/history/b/store`, new ConsoleLogger()))
  remoteStore = new NodeFileSystem(`${__dirname}/testdata/history/remote`, new ConsoleLogger())
  const remote = new VfsSyncRemote(remoteStore)
  a = new SyncEngine({ local: aRepo, remote })
  b = new SyncEngine({ local: bRepo, remote })
  aHistory = new FileHistory(aRepo)
  bHistory = new FileHistory(
    bRepo,
    () => bRepo.prepare(),
    (snapshot, path) => b.fetchFile(snapshot, path),
  )
})

async function save(text: string, path = 'vault/note.arx') {
  await aTree.file(path).writeText(text)
  await aHistory.record({ identity, path, content: encode(text) })
}

async function contents(history: FileHistory) {
  const versions = await history.list(query)
  return Promise.all(versions.map(async (version) => decode(await history.read(query, version))))
}

test('offline checkpoints survive restart, rename and deletion without duplicate consecutive versions', async () => {
  await save('first')
  await save('second')
  await save('second')
  expect(await contents(new FileHistory(aRepo))).toEqual(['second', 'first'])
  await aTree.delete('vault/note.arx')
  await save('second', 'vault/renamed.arx')
  expect((await aHistory.list(query)).map((version) => version.path)).toEqual(['vault/renamed.arx', 'vault/note.arx', 'vault/note.arx'])
  await aTree.delete('vault/renamed.arx')
  await a.sync()
  expect(await contents(aHistory)).toEqual(['second', 'second', 'first'])
})

test('publishes all offline versions and downloads historical chunks on demand with integrity checks', async () => {
  await save('first')
  await save('second')
  await save('third')
  await a.sync()
  await b.sync()
  expect(await bRepo.getChunkFile(sha256('first')).exists()).toBe(false)
  expect(await contents(bHistory)).toEqual(['third', 'second', 'first'])
  expect(await bRepo.getChunkFile(sha256('first')).exists()).toBe(true)
  await bRepo.getChunkFile(sha256('first')).writeText('corrupt')
  const oldest = (await bHistory.list(query)).at(-1)!
  await expect(bHistory.read(query, oldest)).rejects.toThrow('integrity')
  await bRepo.getChunkFile(sha256('first')).delete()
  const hash = sha256('first')
  await remoteStore.file(`/objects/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`).writeText('tampered')
  await expect(bHistory.read(query, oldest)).rejects.toThrow('integrity')
})

test('rebasing concurrent devices retains intermediate versions from both histories', async () => {
  await save('base')
  await a.sync()
  await b.sync()
  await bTree.file('vault/note.arx').writeText('remote edit')
  await bHistory.record({ identity, path: 'vault/note.arx', content: encode('remote edit') })
  await b.sync()
  await save('offline one')
  await save('offline two')
  await a.sync()
  expect(await contents(aHistory)).toEqual(expect.arrayContaining(['base', 'remote edit', 'offline one', 'offline two']))
  await b.sync()
  expect(await contents(bHistory)).toEqual(expect.arrayContaining(['base', 'remote edit', 'offline one', 'offline two']))
})

test('save and sync share a lock and failed writes retain the earlier checkpoint', async () => {
  await save('before')
  let release = () => {}
  let entered = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  const writing = aHistory.save(
    { identity, path: 'vault/note.arx', content: encode('before') },
    { identity, path: 'vault/note.arx', content: encode('after') },
    async () => {
      entered()
      await gate
      await aTree.file('vault/note.arx').writeText('after')
    },
  )
  await started
  const syncing = a.sync()
  release()
  await Promise.all([writing, syncing])
  await b.sync()
  expect(await contents(bHistory)).toEqual(['after', 'before'])
  await expect(
    aHistory.save(
      { identity, path: 'vault/note.arx', content: encode('after') },
      { identity, path: 'vault/note.arx', content: encode('failed') },
      async () => {
        throw new Error('write failed')
      },
    ),
  ).rejects.toThrow('write failed')
  expect(await contents(aHistory)).toEqual(['after', 'before'])
})

test('legacy imports are idempotent across retries and keep their timestamps', async () => {
  const checkpoint = { identity, path: 'vault/note.arx', content: encode('old'), source: 'legacy/version-1', savedAt: 1234567890000 }
  await aHistory.record(checkpoint)
  await aHistory.record({ ...checkpoint, source: 'legacy/version-2', content: encode('new'), savedAt: 1234567891000 })
  await aRepo.getChunkFile(sha256('old')).writeText('damaged')
  await aHistory.record(checkpoint)
  expect(await contents(aHistory)).toEqual(['new', 'old'])
  expect((await aHistory.list(query)).at(-1)?.savedAt).toBe(checkpoint.savedAt)
  await expect(aHistory.record({ ...checkpoint, path: 'vault/../../state/secret' })).rejects.toThrow('path')
})

test('a version whose snapshot fell off the current head chain still reads back', async () => {
  // A checkpoint is always written as its own snapshot file BEFORE any attempt to link it into head
  // (see recordCheckpoint's comment on the optimistic-retry gap that a competing writer can still land
  // in). So a version `list()` already handed back can end up with a snapshot that is no longer
  // reachable by walking from wherever head ends up — not hypothetically: constructed directly here,
  // without any race, by pointing head at a sibling snapshot descended from the SAME parent instead.
  await save('first')
  const [version] = await aHistory.list(query)
  const orphaned = await aRepo.getSnapshotFile(version.id).readJSON<Snapshot>()

  const sibling: Snapshot = { parent: orphaned.parent, files: {}, hash: snapshotHash(orphaned.parent, {}), timestamp: orphaned.timestamp + 1 }
  await aRepo.getSnapshotFile(sibling.hash).writeJSON(sibling)
  await aRepo.getHeadFile().writeText(sibling.hash)

  // `list()` no longer sees it (head's chain never passes through it) — but the exact version the
  // dialog already showed is still the one being asked for, and its snapshot is untouched on disk.
  expect(await aHistory.list(query)).toEqual([])
  expect(decode(await aHistory.read(query, version))).toBe('first')
})

test('a stalled remote does not block local checkpoint writes', async () => {
  await save('before')
  let release = () => {}
  let entered = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  const remote = new VfsSyncRemote(remoteStore)
  const engine = new SyncEngine({
    local: aRepo,
    remote: {
      getHead: async () => {
        entered()
        await gate
        return remote.getHead()
      },
      getObjects: (hashes) => remote.getObjects(hashes),
      hasObjects: (hashes) => remote.hasObjects(hashes),
      putObjects: (objects) => remote.putObjects(objects),
      setHead: (expected, next) => remote.setHead(expected, next),
    },
  })
  const syncing = engine.sync()
  await started
  await save('saved while offline')
  expect(await contents(aHistory)).toEqual(['saved while offline', 'before'])
  release()
  await syncing
  await b.sync()
  expect(await contents(bHistory)).toEqual(['saved while offline', 'before'])
})
