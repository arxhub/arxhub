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
    localVfs = new LocalFileSystem(`${__dirname}/testdata/local`)
    remoteVfs = new LocalFileSystem(`${__dirname}/testdata/remote`)

    // Clean up any existing test data
    await localVfs.delete('./', { force: true, recursive: true })
    await remoteVfs.delete('./', { force: true, recursive: true })

    local = new Repo(localVfs)
    remote = new Repo(remoteVfs)
    engine = new SyncEngine({ local, remote })
  })

  describe('sync', () => {
    test('from scratch - first commit', async () => {
      // Arrange: Both repos are empty (no snapshots)
      await local.prepare()
      await remote.prepare()

      // Add a file to local
      const testFile = localVfs.file('test.txt')
      await testFile.write(Buffer.from('Hello World'))
      await engine.add('test.txt')

      // Act: Sync
      await engine.sync()

      // Assert: File should be synced to remote
      const remoteFile = remoteVfs.file('test.txt')
      expect(await remoteFile.isExists()).toBe(true)
      expect(await remoteFile.read()).toEqual(Buffer.from('Hello World'))

      // Both repos should have the same head snapshot
      const localHead = await local.getHeadSnapshot()
      const remoteHead = await remote.getHeadSnapshot()
      expect(localHead.hash).toBe(remoteHead.hash)
    })

    test('local without changes, remote with changes', async () => {
      const initialFile = localVfs.file('initial.txt')
      await initialFile.write(Buffer.from('initial'))
      await engine.add('initial.txt')
      await engine.sync()

      // Add file to remote only
      const remoteFile = remoteVfs.file('remote-only.txt')
      await remoteFile.write(Buffer.from('remote content'))

      // Simulate remote commit by directly manipulating remote repo
      const remoteSnapshot = await remote.commit()
      await remote.getHeadFile().writeText(remoteSnapshot.hash)

      // Act: Sync from local perspective
      await engine.sync()

      // Assert: Remote changes should be downloaded to local
      const localRemoteFile = localVfs.file('remote-only.txt')
      expect(await localRemoteFile.isExists()).toBe(true)
      expect(await localRemoteFile.read()).toEqual(Buffer.from('remote content'))
    })

    test('local with changes, remote without', async () => {
      // Arrange: Initialize both repos
      await local.prepare()
      await remote.prepare()

      // Create initial sync state
      const initialFile = localVfs.file('initial.txt')
      await initialFile.write(Buffer.from('initial'))
      await engine.add('initial.txt')
      await engine.sync()

      // Add file to local only
      const localFile = localVfs.file('local-only.txt')
      await localFile.write(Buffer.from('local content'))
      await engine.add('local-only.txt')

      // Act: Sync
      await engine.sync()

      // Assert: Local changes should be uploaded to remote
      const remoteLocalFile = remoteVfs.file('local-only.txt')
      expect(await remoteLocalFile.isExists()).toBe(true)
      expect(await remoteLocalFile.read()).toEqual(Buffer.from('local content'))
    })

    test('both sides with changes', async () => {
      // Arrange: Initialize both repos
      await local.prepare()
      await remote.prepare()

      // Create initial sync state
      const initialFile = localVfs.file('initial.txt')
      await initialFile.write(Buffer.from('initial'))
      await engine.add('initial.txt')
      await engine.sync()

      // Add different files to both sides
      const localFile = localVfs.file('local-change.txt')
      await localFile.write(Buffer.from('local version'))
      await engine.add('local-change.txt')

      const remoteFile = remoteVfs.file('remote-change.txt')
      await remoteFile.write(Buffer.from('remote version'))

      // Simulate remote commit
      const remoteSnapshot = await remote.commit()
      await remote.getHeadFile().writeText(remoteSnapshot.hash)

      // Act: Sync
      await engine.sync()

      // Assert: Both changes should be present
      const localRemoteFile = localVfs.file('remote-change.txt')
      expect(await localRemoteFile.isExists()).toBe(true)
      expect(await localRemoteFile.read()).toEqual(Buffer.from('remote version'))

      const remoteLocalFile = remoteVfs.file('local-change.txt')
      expect(await remoteLocalFile.isExists()).toBe(true)
      expect(await remoteLocalFile.read()).toEqual(Buffer.from('local version'))
    })

    test('both sides modify same file - creates conflict file', async () => {
      // Arrange: Initialize both repos
      await local.prepare()
      await remote.prepare()

      // Create initial sync state with shared file
      const sharedFile = localVfs.file('shared.txt')
      await sharedFile.write(Buffer.from('original'))
      await engine.add('shared.txt')
      await engine.sync()

      // Modify the same file on both sides
      const localSharedFile = localVfs.file('shared.txt')
      await localSharedFile.write(Buffer.from('local modified'))
      await engine.add('shared.txt')

      const remoteSharedFile = remoteVfs.file('shared.txt')
      await remoteSharedFile.write(Buffer.from('remote modified'))

      // Simulate remote commit
      const remoteSnapshot = await remote.commit()
      await remote.getHeadFile().writeText(remoteSnapshot.hash)

      // Act: Sync
      await engine.sync()

      // Assert: Local version kept, remote version saved as conflict file
      expect(await localSharedFile.read()).toEqual(Buffer.from('local modified'))

      // Check for conflict file (hash-based naming)
      const conflictFiles = []
      for await (const file of localVfs.list('/')) {
        if (file.pathname.startsWith('/shared-') && file.pathname.endsWith('.txt')) {
          conflictFiles.push(file)
        }
      }
      expect(conflictFiles.length).toBe(1)
      expect(await conflictFiles[0].read()).toEqual(Buffer.from('remote modified'))
    })
  })

  describe('add', () => {
    test('adds path to changes', async () => {
      // Arrange
      await local.prepare()

      // Act
      await engine.add('test.txt')

      // Assert
      const changes = await local.getChangesFile().readJSON<string[]>([])
      expect(changes).toContain('test.txt')
    })
  })
})
