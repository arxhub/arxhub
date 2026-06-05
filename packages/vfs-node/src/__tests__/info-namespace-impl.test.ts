import { ConsoleLogger } from '@arxhub/core'
import { beforeEach, describe, expect, test } from 'vitest'
import { InfoNamespaceImpl } from '@arxhub/vfs'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '../index'

describe('InfoNamespaceImpl', () => {
  let vfs: VirtualFileSystem

  beforeEach(async () => {
    vfs = new NodeFileSystem(`${__dirname}/testdata/info-namespace-impl`, new ConsoleLogger())
    await vfs.delete('/', { force: true, recursive: true })
  })

  test('set → flush → new instance → getAll persistence round-trip', async () => {
    const file = vfs.file('article.txt')
    await file.writeText('content')

    await file.info.set('hash' as never, 'abc' as never)
    // Default flush:true means it's already written

    const file2 = vfs.file('article.txt')
    const all = await file2.info.getAll()
    expect((all as Record<string, unknown>).hash).toEqual('abc')
  })

  test('set({ flush: false }) batches, flush() writes once', async () => {
    interface Fields { a: string; b: string; hash?: string }
    const file = vfs.file<Fields>('batch.txt')
    await file.writeText('x')

    await file.info.set('a', 'one', { flush: false })
    await file.info.set('b', 'two', { flush: false })
    expect(file.info.isDirty()).toBe(true)
    await file.info.flush()
    expect(file.info.isDirty()).toBe(false)

    const file2 = vfs.file<Fields>('batch.txt')
    expect(await file2.info.get('a')).toEqual('one')
    expect(await file2.info.get('b')).toEqual('two')
  })

  test('isDirty() transitions: clean → dirty → clean', async () => {
    const file = vfs.file('dirty.txt')
    await file.writeText('x')
    await file.info.getAll()
    expect(file.info.isDirty()).toBe(false)
    await file.info.set('hash' as never, 'x' as never, { flush: false })
    expect(file.info.isDirty()).toBe(true)
    await file.info.flush()
    expect(file.info.isDirty()).toBe(false)
  })

  test('concurrent auto-flush calls — no lost writes', async () => {
    interface Fields { a: string; b: string; c: string; hash?: string }
    const file = vfs.file<Fields>('concurrent.txt')
    await file.writeText('x')
    // Fire three concurrent auto-flush set() calls — vfs.lock serializes flush writes
    await Promise.all([
      file.info.set('a', 'alpha'),
      file.info.set('b', 'beta'),
      file.info.set('c', 'gamma'),
    ])
    const file2 = vfs.file<Fields>('concurrent.txt')
    const all = await file2.info.getAll()
    expect(all.a).toEqual('alpha')
    expect(all.b).toEqual('beta')
    expect(all.c).toEqual('gamma')
  })

  test('missing .arxmeta file → getAll() returns {}', async () => {
    const file = vfs.file('no-sidecar.txt')
    await vfs.write('no-sidecar.txt', new TextEncoder().encode('data'))
    // No .arxmeta written — should not throw
    const all = await file.info.getAll()
    expect(all).toEqual({})
  })

  test('type inference: get(key) returns typed value with generic T', async () => {
    interface ArticleInfo { title: string; count: number; hash?: string }
    const file = vfs.file<ArticleInfo>('typed.txt')
    await file.writeText('article')
    await file.info.set('title', 'Hello World')
    await file.info.set('count', 42)

    const title = await file.info.get('title')
    const count = await file.info.get('count')
    expect(title).toEqual('Hello World')
    expect(count).toEqual(42)
  })

  test('InfoNamespaceImpl standalone with custom vfs.file()', async () => {
    const raw = vfs.file('standalone.txt')
    await raw.writeText('test')
    // write() populates hash automatically — getAll() will include it
    const info = new InfoNamespaceImpl(raw)
    const initial = await info.getAll()
    expect((initial as Record<string, unknown>).hash).toHaveLength(64)
    await info.set('hash' as never, 'testval' as never)
    const info2 = new InfoNamespaceImpl(raw)
    expect(await info2.getAll()).toMatchObject({ hash: 'testval' })
  })
})
