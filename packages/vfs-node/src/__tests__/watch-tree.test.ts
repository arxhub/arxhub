import { mkdir, rm, unlink, writeFile } from 'node:fs/promises'
import { ConsoleLogger } from '@arxhub/core'
import type { VfsChange } from '@arxhub/vfs'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { NodeFileSystem } from '../index'

const dir = `${__dirname}/testdata/watch-tree`

// A few seconds, not the default 1s: FSEvents/inotify delivery is not instant, and CI is slower than a
// dev machine.
const waitOptions = { timeout: 5000, interval: 50 }

describe('NodeFileSystem.watchTree', () => {
  let vfs: NodeFileSystem
  let unwatch: (() => void) | null = null

  beforeEach(async () => {
    await rm(dir, { force: true, recursive: true })
    await mkdir(dir, { recursive: true })
    vfs = new NodeFileSystem(dir, new ConsoleLogger())
  })

  afterEach(() => {
    unwatch?.()
    unwatch = null
  })

  test('a file written from outside the VFS is reported as written, in VFS-relative coordinates', async () => {
    const changes: VfsChange[] = []
    unwatch = await vfs.watchTree('', (change) => changes.push(change))

    await writeFile(`${dir}/a.txt`, 'hello')

    await vi.waitFor(() => expect(changes.some((c) => c.kind === 'written' && c.pathname === 'a.txt')).toBe(true), waitOptions)
  })

  test('a file deleted from outside the VFS is reported as deleted', async () => {
    await writeFile(`${dir}/b.txt`, 'x')
    const changes: VfsChange[] = []
    unwatch = await vfs.watchTree('', (change) => changes.push(change))

    await unlink(`${dir}/b.txt`)

    await vi.waitFor(() => expect(changes.some((c) => c.kind === 'deleted' && c.pathname === 'b.txt')).toBe(true), waitOptions)
  })

  test('a file created in a NEW subdirectory is seen — the watch is recursive', async () => {
    const changes: VfsChange[] = []
    unwatch = await vfs.watchTree('', (change) => changes.push(change))

    await mkdir(`${dir}/sub`, { recursive: true })
    await writeFile(`${dir}/sub/c.txt`, 'nested')

    await vi.waitFor(() => expect(changes.some((c) => c.kind === 'written' && c.pathname === 'sub/c.txt')).toBe(true), waitOptions)
  })
})
