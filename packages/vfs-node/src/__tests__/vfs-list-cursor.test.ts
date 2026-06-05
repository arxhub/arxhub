import { ConsoleLogger } from '@arxhub/core'
import { beforeEach, describe, expect, test } from 'vitest'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '../index'

describe('VirtualWalker (walk)', () => {
  let vfs: VirtualFileSystem

  beforeEach(async () => {
    vfs = new NodeFileSystem(`${__dirname}/testdata/vfs-list-cursor`, new ConsoleLogger())
    await vfs.delete('/', { force: true, recursive: true })
  })

  async function collect(prefix: string, cursor?: string): Promise<string[]> {
    const items: string[] = []
    for await (const file of vfs.walk(prefix, cursor)) {
      items.push(file.pathname)
    }
    return items
  }

  test('lists all files under prefix, excludes .arxmeta files', async () => {
    await vfs.write('a.txt', new Uint8Array([1]))
    await vfs.write('b.txt', new Uint8Array([2]))
    await vfs.write('a.txt.arxmeta', new Uint8Array([3]))

    const result = await collect('/')
    expect(result.sort()).toEqual(['a.txt', 'b.txt'])
  })

  test('lists files in nested directories', async () => {
    await vfs.write('dir/a.txt', new Uint8Array([1]))
    await vfs.write('dir/sub/b.txt', new Uint8Array([2]))
    await vfs.write('c.txt', new Uint8Array([3]))

    const result = await collect('/')
    expect(result.sort()).toEqual(['c.txt', 'dir/a.txt', 'dir/sub/b.txt'])
  })

  test('walk with prefix filters to subtree', async () => {
    await vfs.write('repo/snapshots/abc', new Uint8Array([1]))
    await vfs.write('repo/snapshots/def', new Uint8Array([2]))
    await vfs.write('repo/chunks/xy/zz/hash', new Uint8Array([3]))

    const result = await collect('/repo/snapshots')
    expect(result.sort()).toEqual(['repo/snapshots/abc', 'repo/snapshots/def'])
  })

  test('cursor mid-iteration → resume → no duplicates, no gaps', async () => {
    for (let i = 0; i < 5; i++) {
      await vfs.write(`file${i}.txt`, new Uint8Array([i]))
    }

    const seen: string[] = []
    const walker = vfs.walk('/')
    let snapshotCursor: string | undefined

    let i = 0
    for await (const file of walker) {
      seen.push(file.pathname)
      i++
      if (i === 2) {
        snapshotCursor = walker.cursor()
        break
      }
    }

    // Resume from cursor
    for await (const file of vfs.walk('/', snapshotCursor)) {
      seen.push(file.pathname)
    }

    expect(seen).toHaveLength(5)
    expect(new Set(seen).size).toBe(5)
  })

  test('empty directory → done immediately', async () => {
    const result = await collect('nonexistent')
    expect(result).toEqual([])
  })

  test('file path as prefix → yields that file', async () => {
    await vfs.write('solo.txt', new Uint8Array([42]))
    const result = await collect('solo.txt')
    expect(result).toEqual(['solo.txt'])
  })
})

describe('list (flat)', () => {
  let vfs: VirtualFileSystem

  beforeEach(async () => {
    vfs = new NodeFileSystem(`${__dirname}/testdata/vfs-list-cursor`, new ConsoleLogger())
    await vfs.delete('/', { force: true, recursive: true })
  })

  test('returns immediate children only, not recursive', async () => {
    await vfs.write('a.txt', new Uint8Array([1]))
    await vfs.write('dir/b.txt', new Uint8Array([2]))

    const entries = await vfs.list('/')
    const pathnames = entries.map((e) => e.pathname).sort()
    expect(pathnames).toEqual(['a.txt', 'dir'])
  })

  test('returns VirtualFile with kind=file and VirtualDir with kind=dir', async () => {
    await vfs.write('file.txt', new Uint8Array([1]))
    await vfs.write('subdir/nested.txt', new Uint8Array([2]))

    const entries = await vfs.list('/')
    const file = entries.find((e) => e.pathname === 'file.txt')
    const dir = entries.find((e) => e.pathname === 'subdir')

    expect(file?.kind).toBe('file')
    expect(dir?.kind).toBe('dir')
  })

  test('excludes .arxmeta files', async () => {
    await vfs.write('a.txt', new Uint8Array([1]))
    await vfs.write('a.txt.arxmeta', new Uint8Array([2]))

    const entries = await vfs.list('/')
    expect(entries.map((e) => e.pathname)).toEqual(['a.txt'])
  })

  test('empty directory returns empty array', async () => {
    const entries = await vfs.list('nonexistent')
    expect(entries).toEqual([])
  })
})
