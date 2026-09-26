import { ConsoleLogger } from '@arxhub/core'
import { describe, expect, test } from 'vitest'
import { NodeFileSystem } from '../index'
import { tempRoot } from './temp-root'

const SIZE = 4 * 1024 * 1024
const filled = (byte: number) => new Uint8Array(SIZE).fill(byte)

// The repository's head pointer and its snapshots are read without the server's path lock, while
// another request replaces them. A reader must get the old bytes or the new ones: an empty or half
// written head reads as a broken chain, which failed saves and made a copied document keep the
// original's history identity.
describe('NodeFileSystem replaces a file atomically', () => {
  const root = tempRoot('atomic-replace')

  async function readWhile(vfs: NodeFileSystem, replace: (round: number) => Promise<unknown>) {
    let writing = true
    const seen = new Set<string>()
    const listed = new Set<string>()
    const reads = (async () => {
      while (writing) {
        const bytes = await vfs.read('file.bin')
        seen.add(bytes.byteLength === SIZE && bytes.every((byte) => byte === bytes[0]) ? `whole:${bytes[0]}` : `torn:${bytes.byteLength}`)
        for (const entry of await vfs.list('')) listed.add(entry.pathname)
      }
    })()
    for (let round = 1; round <= 12; round++) await replace(round)
    writing = false
    await reads
    return { seen: [...seen].filter((value) => value.startsWith('torn')), listed: [...listed] }
  }

  test('write() never exposes a torn file or its temporary', async () => {
    const vfs = new NodeFileSystem(root(), new ConsoleLogger())
    await vfs.write('file.bin', filled(0))
    const { seen, listed } = await readWhile(vfs, (round) => vfs.write('file.bin', filled(round)))
    expect(seen).toEqual([])
    expect(listed).toEqual(['file.bin'])
    expect(await vfs.list('')).toHaveLength(1)
  })

  test('compareAndSwap() never exposes a torn file or its temporary', async () => {
    const vfs = new NodeFileSystem(root(), new ConsoleLogger())
    await vfs.write('file.bin', filled(0))
    const { seen, listed } = await readWhile(vfs, async (round) => {
      expect(await vfs.compareAndSwap('file.bin', filled(round - 1), filled(round))).toBe(true)
    })
    expect(seen).toEqual([])
    expect(listed).toEqual(['file.bin'])
  })
})
