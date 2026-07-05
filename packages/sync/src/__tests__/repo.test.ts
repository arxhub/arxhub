import { ConsoleLogger } from '@arxhub/core'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { beforeEach, describe, expect, test } from 'vitest'
import { EMPTY_SNAPSHOT_HASH } from '../empty-snapshot-hash'
import { Repo } from '../repo'

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
          hash: '16aba5393ad72c0041f5600ad3c2c52ec437a2f0c7fc08fadfc3c0fe9641d7a3',
          pathname: 'data/lorem.txt',
          chunks: [
            {
              hash: '16aba5393ad72c0041f5600ad3c2c52ec437a2f0c7fc08fadfc3c0fe9641d7a3',
            },
          ],
        },
      },
    })
    expect(await repo.getChunkFile('16aba5393ad72c0041f5600ad3c2c52ec437a2f0c7fc08fadfc3c0fe9641d7a3').readText()).toEqual(
      'Lorem ipsum dolor sit amet',
    )
  })
})
