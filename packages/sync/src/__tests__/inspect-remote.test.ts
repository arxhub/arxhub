import { describe, expect, it } from 'vitest'
import { EMPTY_SNAPSHOT_HASH } from '../empty-snapshot-hash'
import { inspectRemote } from '../inspect-remote'
import type { SyncRemote } from '../remote/sync-remote'
import { snapshotHash } from '../snapshot-hash'
import type { Snapshot, SnapshotFile } from '../types'

const encoder = new TextEncoder()

function memoryRemote(head: string | null, objects: Map<string, Uint8Array> = new Map()): SyncRemote & { writes: number } {
  const remote = {
    writes: 0,
    getHead: () => Promise.resolve(head),
    setHead: () => {
      remote.writes++
      return Promise.resolve(true)
    },
    hasObjects: (hashes: string[]) => Promise.resolve(new Set(hashes.filter((it) => objects.has(it)))),
    getObjects: (hashes: string[]) =>
      Promise.resolve(new Map(hashes.flatMap((it) => (objects.has(it) ? [[it, objects.get(it) as Uint8Array] as const] : [])))),
    putObjects: () => {
      remote.writes++
      return Promise.resolve()
    },
  }
  return remote
}

function file(pathname: string, size?: number): SnapshotFile {
  // Left out rather than `undefined`: the snapshot travels as JSON, which drops an undefined key.
  if (size == null) return { pathname, hash: `h-${pathname}`, chunks: [{ hash: `c-${pathname}` }] }
  return { pathname, hash: `h-${pathname}`, size, chunks: [{ hash: `c-${pathname}`, size }] }
}

function snapshotOf(files: SnapshotFile[]): Snapshot {
  const record = Object.fromEntries(files.map((it) => [it.pathname, it]))
  return { hash: snapshotHash(null, record), parent: null, timestamp: 0, files: record }
}

function remoteAt(snapshot: Snapshot, bytes = encoder.encode(JSON.stringify(snapshot))) {
  return memoryRemote(snapshot.hash, new Map([[snapshot.hash, bytes]]))
}

describe('inspectRemote', () => {
  it('reads a remote that was never pushed to as empty', async () => {
    expect(await inspectRemote(memoryRemote(null))).toEqual({ empty: true })
  })

  it('reads the shared empty snapshot as empty without fetching it', async () => {
    expect(await inspectRemote(memoryRemote(EMPTY_SNAPSHOT_HASH))).toEqual({ empty: true })
  })

  it('counts the vault files and their bytes, not the plugin storage beside them', async () => {
    const snapshot = snapshotOf([file('vault/a.md', 100), file('vault/b/c.arx', 2048), file('storage/budget/budget.jsonl', 999)])

    expect(await inspectRemote(remoteAt(snapshot))).toEqual({ empty: false, documents: 2, bytes: 2148 })
  })

  it('counts a file from before sized manifests as zero bytes rather than failing', async () => {
    const snapshot = snapshotOf([file('vault/old.md'), file('vault/new.md', 10)])

    expect(await inspectRemote(remoteAt(snapshot))).toEqual({ empty: false, documents: 2, bytes: 10 })
  })

  it('reads a head holding only plugin storage as an empty vault', async () => {
    expect(await inspectRemote(remoteAt(snapshotOf([file('storage/x/y.json', 1)])))).toEqual({ empty: true })
  })

  it('refuses a head whose snapshot does not hash to its name', async () => {
    const snapshot = snapshotOf([file('vault/a.md', 1)])
    const forged = { ...snapshot, files: { ...snapshot.files, 'vault/extra.md': file('vault/extra.md', 5) } }

    await expect(inspectRemote(remoteAt(snapshot, encoder.encode(JSON.stringify(forged))))).rejects.toThrow(/integrity/)
  })

  it('refuses a head the remote does not hold', async () => {
    await expect(inspectRemote(memoryRemote('deadbeef'))).rejects.toThrow(/does not hold/)
  })

  it('writes nothing', async () => {
    const remote = remoteAt(snapshotOf([file('vault/a.md', 1)]))
    await inspectRemote(remote)
    expect(remote.writes).toBe(0)
  })
})
