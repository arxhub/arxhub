import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConsoleLogger } from '@arxhub/core'
import { hasErrorCode } from '@arxhub/errors'
import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Repo } from '../repo'
import type { Snapshot, SnapshotFile, SnapshotFileChunk } from '../types'

const enc = (value: string): Uint8Array => new TextEncoder().encode(value)

function snapshotFile(pathname: string, chunks: SnapshotFileChunk[], hash = 'file-hash', size?: number): SnapshotFile {
  return { pathname, hash, chunks, ...(size === undefined ? {} : { size }) }
}

function snapshot(file: SnapshotFile): Snapshot {
  return { hash: 'snapshot-hash', parent: null, timestamp: 1, files: { [file.pathname]: file } }
}

describe('SnapshotRangeReader', () => {
  let root: string
  let repo: Repo

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'arxhub-snapshot-range-'))
    repo = new Repo(new NodeFileSystem(root, new ConsoleLogger()))
    await repo.prepare()
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  test('legacy chunks are concatenated once and never materialized', async () => {
    const first = enc('legacy ')
    const second = enc('content')
    const content = new Uint8Array([...first, ...second])
    const firstHash = sha256(first)
    const secondHash = sha256(second)
    await repo.getChunkFile(firstHash).write(first)
    await repo.getChunkFile(secondHash).write(second)
    const entry = snapshotFile('vault/legacy.bin', [{ hash: firstHash }, { hash: secondHash }], sha256(content))
    const getChunkFile = vi.spyOn(repo, 'getChunkFile')
    const reader = repo.openRangeReader(snapshot(entry), entry.pathname)

    expect(await reader.head()).toMatchObject({ size: content.byteLength })
    expect(await reader.readRange(7, 7)).toEqual(enc('content'))
    expect(await reader.head()).toMatchObject({ size: content.byteLength })
    // The first legacy load checks and reads both chunks; subsequent head/range calls use the cached concat.
    expect(getChunkFile).toHaveBeenCalledTimes(4)
  })

  test('known chunk sizes provide the head size when file size is absent', async () => {
    const first = enc('abc')
    const second = enc('defgh')
    const firstHash = sha256(first)
    const secondHash = sha256(second)
    await repo.getChunkFile(firstHash).write(first)
    await repo.getChunkFile(secondHash).write(second)
    const entry = snapshotFile('vault/sized.bin', [
      { hash: firstHash, size: first.byteLength },
      { hash: secondHash, size: second.byteLength },
    ])
    const reader = repo.openRangeReader(snapshot(entry), entry.pathname)

    expect(await reader.head()).toMatchObject({ size: 8 })
    expect(await reader.readRange(2, 4)).toEqual(enc('cdef'))
  })

  test('rejects an actual chunk length mismatch instead of padding with zeros', async () => {
    const hash = sha256(enc('short'))
    await repo.getChunkFile(hash).write(enc('short'))
    const entry = snapshotFile('vault/mismatch.bin', [{ hash, size: 8 }], 'file-hash', 8)
    const reader = repo.openRangeReader(snapshot(entry), entry.pathname)

    await expect(reader.readRange(0, 8)).rejects.toThrow('manifest declares 8')
  })

  test('rejects an invalid range before fetching a missing chunk', async () => {
    const missing = 'missing-chunk'
    const entry = snapshotFile('vault/missing.bin', [{ hash: missing, size: 5 }], 'file-hash', 5)
    const fetchMissing = vi.fn(async () => undefined)
    const reader = repo.openRangeReader(snapshot(entry), entry.pathname, fetchMissing)

    await expect(reader.readRange(Number.NaN, 1)).rejects.toSatisfy((error: unknown) => hasErrorCode(error, 'ValidationError'))
    expect(fetchMissing).not.toHaveBeenCalled()
  })

  test('refuses an absent chunk clearly when offline', async () => {
    const entry = snapshotFile('vault/offline.bin', [{ hash: 'offline-chunk', size: 7 }], 'file-hash', 7)
    const reader = repo.openRangeReader(snapshot(entry), entry.pathname)

    await expect(reader.readRange(0, 7)).rejects.toThrow('unavailable offline')
  })
})
