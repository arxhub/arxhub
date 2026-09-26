import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConsoleLogger } from '@arxhub/core'
import { SETTINGS_TYPE_ID } from '@arxhub/plugin-settings'
import type { StoredWorkspace } from '@arxhub/plugin-shell'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { DOCUMENTS_SETTINGS_SECTION } from '../documents-config'
import { DOCUMENTS_TYPE_ID } from '../documents-type'
import { LEGACY_SETTINGS_SECTION, LEGACY_TYPE_ID, migrateHomeFolders, migrateWorkspaceRecord } from '../notes-migration'

function stored(patch: Partial<StoredWorkspace>): StoredWorkspace {
  return { activeTypeId: null, types: [], nav: {}, column: {}, ...patch }
}

describe('migrateWorkspaceRecord', () => {
  test('renames the Notes type, its navigation and its column to Documents', () => {
    const tabs = [{ key: 'a.md', title: 'a.md', object: { path: 'a.md' } }]
    const migrated = migrateWorkspaceRecord(
      stored({
        activeTypeId: LEGACY_TYPE_ID,
        types: [{ id: LEGACY_TYPE_ID, activeKey: 'a.md', tabs }, { id: SETTINGS_TYPE_ID }],
        nav: { [LEGACY_TYPE_ID]: ['/', '/deals'], [SETTINGS_TYPE_ID]: LEGACY_SETTINGS_SECTION },
        column: { [LEGACY_TYPE_ID]: { width: 320 } },
      }),
    )

    expect(migrated).toEqual({
      activeTypeId: DOCUMENTS_TYPE_ID,
      types: [{ id: DOCUMENTS_TYPE_ID, activeKey: 'a.md', tabs }, { id: SETTINGS_TYPE_ID }],
      nav: { [DOCUMENTS_TYPE_ID]: ['/', '/deals'], [SETTINGS_TYPE_ID]: DOCUMENTS_SETTINGS_SECTION },
      column: { [DOCUMENTS_TYPE_ID]: { width: 320 } },
    })
  })

  test('a record already written by the new build passes through unchanged', () => {
    const record = stored({
      activeTypeId: DOCUMENTS_TYPE_ID,
      types: [{ id: DOCUMENTS_TYPE_ID, tabs: [] }],
      nav: { [DOCUMENTS_TYPE_ID]: ['/'], [SETTINGS_TYPE_ID]: 'search' },
      column: { [DOCUMENTS_TYPE_ID]: { collapsed: true } },
    })
    expect(migrateWorkspaceRecord(record)).toEqual(record)
    expect(migrateWorkspaceRecord(migrateWorkspaceRecord(record))).toEqual(record)
  })

  // Only the new build writes the new id, so where both are present the new one is the later state.
  test('when both ids are stored, the Documents entries win and the Notes ones are dropped', () => {
    const migrated = migrateWorkspaceRecord(
      stored({
        types: [
          { id: LEGACY_TYPE_ID, tabs: [{ key: 'old.md' }] },
          { id: DOCUMENTS_TYPE_ID, tabs: [{ key: 'new.md' }] },
        ],
        nav: { [LEGACY_TYPE_ID]: ['/old'], [DOCUMENTS_TYPE_ID]: ['/new'] },
        column: { [LEGACY_TYPE_ID]: { width: 200 }, [DOCUMENTS_TYPE_ID]: { width: 400 } },
      }),
    )
    expect(migrated.types).toEqual([{ id: DOCUMENTS_TYPE_ID, tabs: [{ key: 'new.md' }] }])
    expect(migrated.nav).toEqual({ [DOCUMENTS_TYPE_ID]: ['/new'] })
    expect(migrated.column).toEqual({ [DOCUMENTS_TYPE_ID]: { width: 400 } })
  })

  test('entries it does not understand are handed on untouched', () => {
    const migrated = migrateWorkspaceRecord(stored({ activeTypeId: 7, types: ['junk', null, { id: LEGACY_TYPE_ID }] }))
    expect(migrated.activeTypeId).toBe(7)
    expect(migrated.types).toEqual(['junk', null, { id: DOCUMENTS_TYPE_ID }])
  })
})

describe('migrateHomeFolders', () => {
  let dir: string
  let vfs: NodeFileSystem
  const logger = new ConsoleLogger()

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'arxhub-documents-migration-'))
    vfs = new NodeFileSystem(dir, logger)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('moves every bucket of the old plugin name to the new one', async () => {
    await vfs.file('storage/Notes/config.toml').writeText('hide = false')
    await vfs.file('state/Notes/config.toml').writeText('local = 1')
    await vfs.file('state/Notes/deep/file.json').writeText('{}')

    await migrateHomeFolders(vfs, logger)

    expect(await vfs.exists('storage/Notes')).toBe(false)
    expect(await vfs.exists('state/Notes')).toBe(false)
    expect(await vfs.file('storage/Documents/config.toml').readText()).toBe('hide = false')
    expect(await vfs.file('state/Documents/config.toml').readText()).toBe('local = 1')
    expect(await vfs.file('state/Documents/deep/file.json').readText()).toBe('{}')
  })

  test('does nothing on a fresh install or a second boot', async () => {
    await migrateHomeFolders(vfs, logger)
    expect(await vfs.exists('storage/Documents')).toBe(false)

    await vfs.file('storage/Documents/config.toml').writeText('new')
    await migrateHomeFolders(vfs, logger)
    expect(await vfs.file('storage/Documents/config.toml').readText()).toBe('new')
  })

  test('when both exist, a file the new bucket has wins and the rest move over', async () => {
    await vfs.file('storage/Notes/config.toml').writeText('old')
    await vfs.file('storage/Notes/extra.json').writeText('extra')
    await vfs.file('storage/Documents/config.toml').writeText('new')

    await migrateHomeFolders(vfs, logger)

    expect(await vfs.file('storage/Documents/config.toml').readText()).toBe('new')
    expect(await vfs.file('storage/Documents/extra.json').readText()).toBe('extra')
    // Kept rather than deleted: it may be the only copy of a change another device made.
    expect(await vfs.file('storage/Notes/config.toml').readText()).toBe('old')
    expect(await vfs.exists('storage/Notes/extra.json')).toBe(false)
  })

  test('when both exist and nothing collides, the old bucket is gone afterwards', async () => {
    await vfs.file('storage/Notes/a.json').writeText('a')
    await vfs.file('storage/Documents/config.toml').writeText('new')

    await migrateHomeFolders(vfs, logger)

    expect(await vfs.exists('storage/Notes')).toBe(false)
    expect(await vfs.file('storage/Documents/a.json').readText()).toBe('a')
  })

  // The copy half of a copy + delete rename landed and the delete did not: every old file has a twin.
  test('a move cut short after the copy finishes on the next boot', async () => {
    await vfs.file('storage/Notes/config.toml').writeText('hide = false')
    await vfs.file('storage/Notes/deep/a.json').writeText('a')
    await vfs.file('storage/Documents/config.toml').writeText('hide = false')
    await vfs.file('storage/Documents/deep/a.json').writeText('a')

    await migrateHomeFolders(vfs, logger)

    expect(await vfs.exists('storage/Notes')).toBe(false)
    expect(await vfs.file('storage/Documents/config.toml').readText()).toBe('hide = false')
    expect(await vfs.file('storage/Documents/deep/a.json').readText()).toBe('a')
  })
})
