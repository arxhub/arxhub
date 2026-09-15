import { ConsoleLogger } from '@arxhub/core'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { beforeEach, describe, expect, test } from 'vitest'
import { migrateRepositoryStore, OLD_REPO_STORE_PATH, REPO_STORE_PATH } from '../store-migration'

describe('migrateRepositoryStore', () => {
  let vfs: NodeFileSystem

  beforeEach(async () => {
    vfs = new NodeFileSystem(`${__dirname}/testdata/store-migration`, new ConsoleLogger())
    await vfs.delete('/', { force: true, recursive: true })
  })

  test('moves an existing old-bucket store to the new bucket', async () => {
    await vfs.file(`${OLD_REPO_STORE_PATH}/head`).writeText('abc')
    await vfs.file(`${OLD_REPO_STORE_PATH}/snapshots/abc`).writeText('{}')

    await migrateRepositoryStore(vfs, new ConsoleLogger())

    expect(await vfs.exists(OLD_REPO_STORE_PATH)).toBe(false)
    expect(await vfs.file(`${REPO_STORE_PATH}/head`).readText()).toBe('abc')
    expect(await vfs.file(`${REPO_STORE_PATH}/snapshots/abc`).readText()).toBe('{}')
  })

  // A fresh install, or a device that has already migrated — nothing to move.
  test('does nothing when there is no old store', async () => {
    await migrateRepositoryStore(vfs, new ConsoleLogger())
    expect(await vfs.exists(REPO_STORE_PATH)).toBe(false)
  })

  // A second boot after a successful migration must not clobber the (possibly further-advanced) new
  // store with a stale copy of the old one.
  test('does nothing when the new bucket already exists, even if the old one still does', async () => {
    await vfs.file(`${OLD_REPO_STORE_PATH}/head`).writeText('old')
    await vfs.file(`${REPO_STORE_PATH}/head`).writeText('new')

    await migrateRepositoryStore(vfs, new ConsoleLogger())

    expect(await vfs.file(`${REPO_STORE_PATH}/head`).readText()).toBe('new')
    expect(await vfs.file(`${OLD_REPO_STORE_PATH}/head`).readText()).toBe('old')
  })
})
