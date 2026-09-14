import { ConsoleLogger } from '@arxhub/core'
import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { beforeEach, describe, expect, test } from 'vitest'
import { Repo } from '../repo'
import type { Snapshot, SnapshotFile } from '../types'

const enc = (s: string) => new TextEncoder().encode(s)

// A manifest entry for content that is NOT in this repo's chunk store — what a device sees after a
// fetch that declined the file.
function remoteEntry(pathname: string, content: string): SnapshotFile {
  const hash = sha256(enc(content))
  return { fileId: `id-${pathname}`, hash, size: content.length, pathname, chunks: [{ hash, size: content.length }] }
}

describe('a file this device leaves in the cloud', () => {
  let vfs: VirtualFileSystem
  let repo: Repo
  let head: Snapshot

  beforeEach(async () => {
    vfs = new NodeFileSystem(`${__dirname}/testdata/pending`, new ConsoleLogger())
    await vfs.delete('/', { force: true, recursive: true })
    repo = new Repo(vfs)
    await repo.prepare()
    head = await repo.getHeadSnapshot()
  })

  test('merge marks it pending instead of writing, and status does not call its absence a deletion', async () => {
    const film = remoteEntry('vault/film.mp4', 'twelve bytes')
    await repo.merge({}, {}, { 'vault/film.mp4': film })

    expect(await vfs.exists('vault/film.mp4')).toBe(false)
    expect(await repo.isPending('vault/film.mp4')).toBe(true)
    expect(await repo.pendingPaths()).toEqual(['vault/film.mp4'])

    // The manifest keeps the entry; a status against it reports nothing to snapshot.
    const manifest: Snapshot = { ...head, files: { 'vault/film.mp4': film } }
    expect(await repo.status(manifest)).toEqual([])
  })

  test('once the chunks are in the store, materialize writes the file and the mark goes', async () => {
    const film = remoteEntry('vault/film.mp4', 'twelve bytes')
    await repo.merge({}, {}, { 'vault/film.mp4': film })
    // The manifest has to name the file for materialize to find it — as a synced head would.
    const manifest: Snapshot = { ...head, files: { 'vault/film.mp4': film } }
    await repo.getSnapshotFile(manifest.hash).writeJSON(manifest)
    await repo.getHeadFile().writeText(manifest.hash)

    await expect(repo.materialize('vault/film.mp4')).rejects.toThrow(/has not been fetched/)

    await repo.getChunkFile(film.chunks[0].hash).write(enc('twelve bytes'))
    await repo.materialize('vault/film.mp4')

    expect(await vfs.file('vault/film.mp4').readText()).toBe('twelve bytes')
    expect(await repo.isPending('vault/film.mp4')).toBe(false)
    expect(await repo.status(manifest)).toEqual([])
  })

  test('a pending file the remote deletes is simply forgotten', async () => {
    const film = remoteEntry('vault/film.mp4', 'twelve bytes')
    await repo.merge({}, {}, { 'vault/film.mp4': film })

    await repo.merge({ 'vault/film.mp4': film }, { 'vault/film.mp4': film }, {})

    expect(await repo.isPending('vault/film.mp4')).toBe(false)
    expect(await repo.pendingPaths()).toEqual([])
  })

  test('a file that appears on disk at a pending path is a file again, judged by its content', async () => {
    const film = remoteEntry('vault/film.mp4', 'twelve bytes')
    await repo.merge({}, {}, { 'vault/film.mp4': film })
    const manifest: Snapshot = { ...head, files: { 'vault/film.mp4': film } }

    await vfs.write('vault/film.mp4', enc('something else entirely'))

    expect(await repo.status(manifest)).toEqual([{ pathname: 'vault/film.mp4', type: 'modified' }])
    expect(await repo.isPending('vault/film.mp4')).toBe(false)
  })

  test('the policy decides what a fetch owes, and a file already on disk is owed regardless', async () => {
    repo.setMaterializePolicy((file) => (file.size ?? 0) <= 5)
    await vfs.file('vault/kept.bin').writeText('kept on this device')
    await repo.add('vault')
    await repo.snapshot()

    expect(await repo.wantsContent(remoteEntry('vault/small.txt', 'tiny'))).toBe(true)
    expect(await repo.wantsContent(remoteEntry('vault/film.mp4', 'twelve bytes'))).toBe(false)
    expect(await repo.wantsContent(remoteEntry('vault/kept.bin', 'kept on this device, edited'))).toBe(true)
  })
})
