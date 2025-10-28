import { LocalFileSystem, type VirtualFileSystem } from '@arxhub/vfs'
import { beforeEach, describe, expect, test } from 'vitest'
import { SyncEngine } from '../engine'
import { Repo } from '../repo'

describe('SyncEngine', () => {
  let localVfs: VirtualFileSystem
  let remoteVfs: VirtualFileSystem
  let local: Repo
  let remote: Repo
  let engine: SyncEngine

  beforeEach(async () => {
    // Create separate VFS instances for local and remote
    localVfs = new LocalFileSystem(`${__dirname}/testdata/engine/local`)
    remoteVfs = new LocalFileSystem(`${__dirname}/testdata/engine/remote`)

    // Clean up any existing test data
    await localVfs.delete('/', { force: true, recursive: true })
    await remoteVfs.delete('/', { force: true, recursive: true })

    local = new Repo(localVfs)
    remote = new Repo(remoteVfs)
    engine = new SyncEngine({ local, remote })

    await local.prepare()
    await remote.prepare()
  })

  describe('add', () => {
    test('should add path to changes', async () => {
      await engine.add('change.txt')

      const changes = await local.getChangesFile().readJSON<string[]>([])
      expect(changes).toEqual(['change.txt'])
    })
  })

  describe('sync', () => {
    test('given empty repo should commit', async () => {
      // Arrange
      const note = localVfs.file('/data/lorem.txt')
      await note.writeText('Lorem ipsum dolor sit amet')
      await local.add('/data')

      // Act
      await local.commit()

      // Assert
      expect(await local.getHeadFile().readText()).toEqual('3bdec02bb21d82f532e08b53531e21f2a36f4fc267cbe1e5cfd1f41e03355893')
      expect(await local.getChangesFile().readJSON()).toEqual([])
      expect(await local.getSnapshotFile('44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a').readJSON()).toEqual({
        hash: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
        parent: null,
        timestamp: 0,
        files: {},
      })
      expect(await local.getSnapshotFile('3bdec02bb21d82f532e08b53531e21f2a36f4fc267cbe1e5cfd1f41e03355893').readJSON()).toEqual({
        hash: '3bdec02bb21d82f532e08b53531e21f2a36f4fc267cbe1e5cfd1f41e03355893',
        parent: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
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
      expect(await local.getChunkFile('16aba5393ad72c0041f5600ad3c2c52ec437a2f0c7fc08fadfc3c0fe9641d7a3').readText()).toEqual(
        'Lorem ipsum dolor sit amet',
      )
    })

    test('given only remote side with changes should pull', async () => {
      // Arrange
      await remoteVfs.file('remote.txt').writeText('remote content')
      await remote.add('remote.txt')
      await remote.commit()

      // Act
      await engine.sync()

      // Assert
      expect(await localVfs.file('remote.txt').readText()).toEqual('remote content')
    })

    test('given only local side with changes should push', async () => {
      // Arrange
      await localVfs.file('local.txt').writeText('local content')
      await local.add('local.txt')

      // Act
      await engine.sync()

      // Assert
      const head = await remote.getHeadSnapshot()
      expect(head).toEqual({
        hash: '5357bece6f5c405b7c089065f4de42ebe5d32dacd057747ba50b34eec7e7338e',
        parent: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
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
      expect(await remote.getChunkFile('a2553c361dbf7567dc499161607eb2c60c51fc2a4756c4ec3fef8b0b63386e48').isExists()).toBe(true)
    })

    test('given both sides with changes should merge', async () => {
      // Arrange
      await localVfs.file('local.txt').writeText('local content')
      await local.add('local.txt')

      await remoteVfs.file('remote.txt').writeText('remote content')
      await remote.add('remote.txt')
      await remote.commit()

      // Act
      await engine.sync()

      // Assert
      expect(await localVfs.file('remote.txt').readText()).toEqual('remote content')
      const head = await remote.getHeadSnapshot()
      expect(head).toEqual({
        hash: 'a88e220e6a730e9610cd3e552fa767cc62415b6327cd3af7320f7ffa08372c0a',
        parent: 'a0f5ae89c6048c17c30c2d8cee9abfebee14d86dccf3071ca95128ade77f0544',
        timestamp: expect.any(Number),
        files: {
          'remote.txt': {
            hash: '0709e9b00585ba4764fd4d89bdefec5b1a20b3735c50d8e33a27f740023ceca2',
            pathname: 'remote.txt',
            chunks: [
              {
                hash: '0709e9b00585ba4764fd4d89bdefec5b1a20b3735c50d8e33a27f740023ceca2',
              },
            ],
          },
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
      expect(await remote.getChunkFile('0709e9b00585ba4764fd4d89bdefec5b1a20b3735c50d8e33a27f740023ceca2').isExists()).toBe(true)
      expect(await remote.getChunkFile('a2553c361dbf7567dc499161607eb2c60c51fc2a4756c4ec3fef8b0b63386e48').isExists()).toBe(true)
    })

    test('given both sides modify same file should create conflict', async () => {
      // Arrange
      await localVfs.file('shared.txt').writeText('original')
      await engine.add('shared.txt')
      await engine.sync()

      // Modify on both sides
      await localVfs.file('shared.txt').writeText('local modified')

      await remoteVfs.file('shared.txt').writeText('remote modified')
      await remote.commit()

      await engine.add('shared.txt')

      // Act
      await engine.sync()

      // Assert
      expect(await localVfs.file('shared.txt').readText()).toEqual('local modified')
      expect(await localVfs.file('conflict-af216312-shared.txt').readText()).toEqual('remote modified')
    })
  })

  // TODO: Add test where local == base, and remote has update
  // TODO: Add all matrix tests
})
