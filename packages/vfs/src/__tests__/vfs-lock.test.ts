import { NodeFileSystem } from '@arxhub/vfs-node'
import { beforeEach, describe, expect, test } from 'vitest'
import type { VirtualFileSystem } from '../virtual-file-system'

describe('VFS locking', () => {
  let vfs: VirtualFileSystem

  beforeEach(async () => {
    vfs = new NodeFileSystem(`${__dirname}/testdata/vfs-lock`)
    await vfs.delete('/', { force: true, recursive: true })
  })

  test('vfs.lock() — second acquire waits for first to release', async () => {
    const order: number[] = []

    const p1 = vfs.lock('file.txt', async () => {
      await new Promise((r) => setTimeout(r, 20))
      order.push(1)
    })

    const p2 = vfs.lock('file.txt', async () => {
      order.push(2)
    })

    await Promise.all([p1, p2])
    expect(order).toEqual([1, 2])
  })

  test('vfs.lock() — different pathnames run concurrently', async () => {
    const order: string[] = []

    const p1 = vfs.lock('a.txt', async () => {
      await new Promise((r) => setTimeout(r, 30))
      order.push('a')
    })

    const p2 = vfs.lock('b.txt', async () => {
      await new Promise((r) => setTimeout(r, 10))
      order.push('b')
    })

    await Promise.all([p1, p2])
    // b finishes first because it has shorter timeout and locks are independent
    expect(order).toEqual(['b', 'a'])
  })

  test('vfs.acquireLock() — lock held until release() called', async () => {
    const order: number[] = []

    const release = await vfs.acquireLock('shared.txt')

    const p2 = vfs.lock('shared.txt', async () => {
      order.push(2)
    })

    order.push(1)
    await new Promise((r) => setTimeout(r, 10))
    release()

    await p2
    expect(order).toEqual([1, 2])
  })

  test('concurrent writes to same path are serialized', async () => {
    await vfs.write('counter.txt', new TextEncoder().encode('0'))

    const writes = Array.from({ length: 5 }, (_, i) =>
      vfs.lock('counter.txt', async () => {
        const current = Number(new TextDecoder().decode(await vfs.read('counter.txt')))
        await new Promise((r) => setTimeout(r, 5))
        await vfs.write('counter.txt', new TextEncoder().encode(String(current + 1)))
      }),
    )

    await Promise.all(writes)
    const result = new TextDecoder().decode(await vfs.read('counter.txt'))
    expect(Number(result)).toBe(5)
  })
})
