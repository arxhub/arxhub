import { ConsoleLogger } from '@arxhub/core'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { beforeEach, describe, expect, test } from 'vitest'
import { EMPTY_SNAPSHOT_HASH } from '../empty-snapshot-hash'
import { Repo } from '../repo'
import { snapshotHash } from '../snapshot-hash'
import type { Snapshot, SnapshotFile } from '../types'

describe('Repo.snapshot', () => {
  let vfs: VirtualFileSystem
  let repo: Repo

  beforeEach(async () => {
    vfs = new NodeFileSystem(`${__dirname}/testdata/repo`, new ConsoleLogger())
    await vfs.delete('/', { force: true, recursive: true })
    repo = new Repo(vfs)
    await repo.prepare()
  })

  test('given empty repo should commit', async () => {
    // Arrange
    const note = vfs.file('/data/lorem.txt')
    await note.writeText('Lorem ipsum dolor sit amet')
    await repo.add('/data')

    // Act
    const committed = await repo.snapshot()

    // Assert
    // Snapshot hashes are content-derived (canonical stableStringify); assert via the produced
    // snapshot rather than pinning a magic literal. Parent is the empty snapshot.
    expect(await repo.getHeadFile().readText()).toEqual(committed.hash)
    expect(await repo.getChangesFile().readJSON()).toEqual([])
    expect(await repo.getSnapshotFile(EMPTY_SNAPSHOT_HASH).readJSON()).toEqual({
      hash: EMPTY_SNAPSHOT_HASH,
      parent: null,
      timestamp: 0,
      files: {},
    })
    expect(await repo.getSnapshotFile(committed.hash).readJSON()).toEqual({
      hash: committed.hash,
      parent: EMPTY_SNAPSHOT_HASH,
      timestamp: expect.any(Number),
      files: {
        'data/lorem.txt': {
          fileId: expect.any(String),
          hash: '16aba5393ad72c0041f5600ad3c2c52ec437a2f0c7fc08fadfc3c0fe9641d7a3',
          size: 26,
          pathname: 'data/lorem.txt',
          chunks: [
            {
              hash: '16aba5393ad72c0041f5600ad3c2c52ec437a2f0c7fc08fadfc3c0fe9641d7a3',
              size: 26,
            },
          ],
        },
      },
    })
    expect(await repo.getChunkFile('16aba5393ad72c0041f5600ad3c2c52ec437a2f0c7fc08fadfc3c0fe9641d7a3').readText()).toEqual(
      'Lorem ipsum dolor sit amet',
    )
  })

  test('a modified file keeps its file id, a renamed one too, and a copy gets its own', async () => {
    await vfs.file('/data/a.txt').writeText('alpha')
    await repo.add('/data')
    const first = await repo.snapshot()
    const id = first.files['data/a.txt'].fileId
    expect(id).toEqual(expect.any(String))

    await vfs.file('/data/a.txt').writeText('alpha, edited')
    await repo.add('/data')
    const edited = await repo.snapshot()
    expect(edited.files['data/a.txt'].fileId).toBe(id)

    // A rename is a new path holding the content whose old path is gone in the same round.
    await vfs.file('/data/b.txt').writeText('alpha, edited')
    await vfs.file('/data/a.txt').delete()
    await repo.add('/data')
    const renamed = await repo.snapshot()
    expect(renamed.files['data/a.txt']).toBeUndefined()
    expect(renamed.files['data/b.txt'].fileId).toBe(id)

    // A copy is a new path holding content that still exists elsewhere — a second file, not the first.
    await vfs.file('/data/c.txt').writeText('alpha, edited')
    await repo.add('/data')
    const copied = await repo.snapshot()
    expect(copied.files['data/b.txt'].fileId).toBe(id)
    expect(copied.files['data/c.txt'].fileId).toEqual(expect.any(String))
    expect(copied.files['data/c.txt'].fileId).not.toBe(id)
  })

  test('entries from a manifest written without sizes and ids are completed by the next manifest', async () => {
    await vfs.file('/data/old.txt').writeText('written before sizes existed')
    await repo.add('/data')
    const modern = await repo.snapshot()

    // Rewrite the head as the previous format would have: no sizes, no file id. The address has to be
    // recomputed, because a manifest is verified against its own content.
    const { size: _size, fileId: _fileId, ...legacyEntry } = modern.files['data/old.txt']
    const legacyFiles: Record<string, SnapshotFile> = {
      'data/old.txt': { ...legacyEntry, chunks: legacyEntry.chunks.map(({ hash }) => ({ hash })) },
    }
    const legacy: Snapshot = { hash: snapshotHash(modern.parent, legacyFiles), parent: modern.parent, timestamp: 1, files: legacyFiles }
    await repo.getSnapshotFile(legacy.hash).writeJSON(legacy)
    await repo.getHeadFile().writeText(legacy.hash)

    await vfs.file('/data/new.txt').writeText('the change that triggers a manifest')
    await repo.add('/data')
    const next = await repo.snapshot()

    expect(next.files['data/old.txt']).toEqual({
      ...legacyEntry,
      fileId: expect.any(String),
      size: 28,
      chunks: [{ hash: legacyEntry.chunks[0].hash, size: 28 }],
    })
  })

  test('rebase compares entries by content, so a manifest that only gained sizes replays nothing', async () => {
    // base: the file as an old manifest recorded it. local: the same content, now with sizes — no edit.
    // remote: the file edited on another device. A JSON comparison would call local's entry a change
    // and replay the unedited content over the remote edit.
    const chunk = 'aa'.repeat(32)
    const oldShape: SnapshotFile = { hash: chunk, pathname: 'data/x.txt', chunks: [{ hash: chunk }] }
    const newShape: SnapshotFile = { ...oldShape, fileId: 'file-1', size: 5, chunks: [{ hash: chunk, size: 5 }] }
    const remoteEdit: SnapshotFile = { ...newShape, hash: 'bb'.repeat(32), chunks: [{ hash: 'bb'.repeat(32), size: 6 }], size: 6 }

    const write = async (parent: string | null, files: Record<string, SnapshotFile>): Promise<Snapshot> => {
      const snapshot: Snapshot = { hash: snapshotHash(parent, files), parent, timestamp: 1, files }
      await repo.getSnapshotFile(snapshot.hash).writeJSON(snapshot)
      return snapshot
    }
    const base = await write(EMPTY_SNAPSHOT_HASH, { 'data/x.txt': oldShape })
    const local = await write(base.hash, { 'data/x.txt': newShape })
    const remote = await write(base.hash, { 'data/x.txt': remoteEdit })
    await repo.getHeadFile().writeText(local.hash)

    await repo.rebase(local, remote, base)

    const head = await repo.getHeadSnapshot()
    expect(head.parent).toBe(remote.hash)
    expect(head.files['data/x.txt'].hash).toBe(remoteEdit.hash)
  })
})
