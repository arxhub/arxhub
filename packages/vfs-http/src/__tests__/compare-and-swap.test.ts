import { ConsoleLogger } from '@arxhub/core'
import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import { type FileHead, fileNotFound, GenericVirtualFileSystem, isCompareAndSwapCapable, type VirtualEntry } from '@arxhub/vfs'
import { describe, expect, test } from 'vitest'
import { HttpFileSystem } from '../http-file-system'
import { vfsRoutes } from '../server'

const enc = (text: string) => new TextEncoder().encode(text)
const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

// The server's VFS, in memory. Records every lock taken so a test can prove the compare and the write
// happened under one, which is the whole point of doing the swap on the server.
class MemoryVfs extends GenericVirtualFileSystem {
  readonly files = new Map<string, Uint8Array>()
  readonly locked: string[] = []

  override lock<T>(pathname: string, fn: () => Promise<T>): Promise<T> {
    this.locked.push(pathname)
    return super.lock(pathname, fn)
  }
  async list(): Promise<VirtualEntry[]> {
    return []
  }
  async read(pathname: string): Promise<Uint8Array> {
    const found = this.files.get(pathname)
    if (found == null) throw fileNotFound(pathname)
    return found
  }
  async readable(): Promise<ReadableStream<Uint8Array>> {
    throw new Error('unused')
  }
  async write(pathname: string, content: Uint8Array): Promise<void> {
    this.files.set(pathname, content)
  }
  async writable(): Promise<WritableStream<Uint8Array>> {
    throw new Error('unused')
  }
  async delete(pathname: string): Promise<void> {
    this.files.delete(pathname)
  }
  async exists(pathname: string): Promise<boolean> {
    return this.files.has(pathname)
  }
  async head(pathname: string): Promise<FileHead> {
    return { size: (await this.read(pathname)).byteLength, modifiedAt: 0, createdAt: 0 }
  }
}

const put = (query: Record<string, string>, body: Uint8Array) =>
  new Request(`http://localhost/compare-and-swap?${new URLSearchParams(query)}`, {
    method: 'PUT',
    // Fresh ArrayBuffer-backed view: TS 6 does not take a Uint8Array<ArrayBufferLike> as a BodyInit.
    body: new Uint8Array(body),
    headers: { 'content-type': 'application/octet-stream' },
  })

describe('PUT /compare-and-swap', () => {
  test('204 and the write when the current content hashes to what was expected', async () => {
    const vfs = new MemoryVfs()
    vfs.files.set('repo/head', enc('one'))
    const res = await vfsRoutes(vfs).handle(put({ path: 'repo/head', expected: sha256(enc('one')) }, enc('two')))
    expect(res.status).toBe(204)
    expect(dec(vfs.files.get('repo/head') as Uint8Array)).toBe('two')
  })

  test('409 and no write when it does not', async () => {
    const vfs = new MemoryVfs()
    vfs.files.set('repo/head', enc('one'))
    const res = await vfsRoutes(vfs).handle(put({ path: 'repo/head', expected: sha256(enc('stale')) }, enc('two')))
    expect(res.status).toBe(409)
    expect(dec(vfs.files.get('repo/head') as Uint8Array)).toBe('one')
  })

  test('"absent" seeds a missing file and refuses an existing one', async () => {
    const vfs = new MemoryVfs()
    expect((await vfsRoutes(vfs).handle(put({ path: 'repo/head', expected: 'absent' }, enc('one')))).status).toBe(204)
    expect(dec(vfs.files.get('repo/head') as Uint8Array)).toBe('one')
    expect((await vfsRoutes(vfs).handle(put({ path: 'repo/head', expected: 'absent' }, enc('two')))).status).toBe(409)
    expect(dec(vfs.files.get('repo/head') as Uint8Array)).toBe('one')
  })

  test('a hash against a missing file is a mismatch, not a 404', async () => {
    const vfs = new MemoryVfs()
    const res = await vfsRoutes(vfs).handle(put({ path: 'repo/head', expected: sha256(enc('one')) }, enc('two')))
    expect(res.status).toBe(409)
    expect(vfs.files.has('repo/head')).toBe(false)
  })

  test('the compare and the write run under the server lock for that path', async () => {
    const vfs = new MemoryVfs()
    await vfsRoutes(vfs).handle(put({ path: 'a/../repo/head', expected: 'absent' }, enc('one')))
    expect(vfs.locked).toEqual(['repo/head'])
  })

  test('a token that is neither "absent" nor a sha256 is a 400, and so is no token at all', async () => {
    const vfs = new MemoryVfs()
    vfs.files.set('repo/head', enc('one'))
    expect((await vfsRoutes(vfs).handle(put({ path: 'repo/head', expected: 'nope' }, enc('two')))).status).toBe(400)
    expect((await vfsRoutes(vfs).handle(put({ path: 'repo/head' }, enc('two')))).status).toBe(400)
    expect(dec(vfs.files.get('repo/head') as Uint8Array)).toBe('one')
  })

  test('an empty or escaping path is a 400 and never reaches the VFS', async () => {
    const vfs = new MemoryVfs()
    expect((await vfsRoutes(vfs).handle(put({ expected: 'absent' }, enc('x')))).status).toBe(400)
    expect((await vfsRoutes(vfs).handle(put({ path: '../etc/passwd', expected: 'absent' }, enc('x')))).status).toBe(400)
    expect(vfs.locked).toEqual([])
    expect(vfs.files.size).toBe(0)
  })
})

describe('HttpFileSystem.compareAndSwap', () => {
  function connect(vfs: MemoryVfs): HttpFileSystem {
    const app = vfsRoutes(vfs)
    const fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      app.handle(new Request(typeof input === 'string' ? input : input.toString(), init))) as typeof globalThis.fetch
    return new HttpFileSystem({ baseUrl: 'http://vfs.test', fetch }, new ConsoleLogger())
  }

  test('declares the capability', () => {
    expect(isCompareAndSwapCapable(connect(new MemoryVfs()))).toBe(true)
  })

  test('204 is true and the bytes landed; 409 is false and nothing moved', async () => {
    const vfs = new MemoryVfs()
    vfs.files.set('repo/head', enc('one'))
    const client = connect(vfs)
    expect(await client.compareAndSwap('repo/head', enc('stale'), enc('two'))).toBe(false)
    expect(dec(vfs.files.get('repo/head') as Uint8Array)).toBe('one')
    expect(await client.compareAndSwap('repo/head', enc('one'), enc('two'))).toBe(true)
    expect(dec(vfs.files.get('repo/head') as Uint8Array)).toBe('two')
  })

  test('a null expectation crosses the wire as "absent"', async () => {
    const vfs = new MemoryVfs()
    const client = connect(vfs)
    expect(await client.compareAndSwap('repo/head', null, enc('one'))).toBe(true)
    expect(await client.compareAndSwap('repo/head', null, enc('two'))).toBe(false)
    expect(dec(vfs.files.get('repo/head') as Uint8Array)).toBe('one')
  })

  test('anything but a 409 is an error, not a false', async () => {
    const client = connect(new MemoryVfs())
    await expect(client.compareAndSwap('../outside', null, enc('x'))).rejects.toThrow()
  })
})
