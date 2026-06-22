import type { Plugin } from '@arxhub/core'
import { LazyContainer } from '@arxhub/di'
import { hasErrorCode } from '@arxhub/errors'
import { describe, expect, test } from 'vitest'
import { fileNotFound } from '../errors'
import { GenericVirtualFileSystem } from '../generic-virtual-file-system'
import { bindPluginVfs, PluginVfs, RootVfs } from '../vfs-scope'
import type { VirtualEntry } from '../virtual-entry'
import type { FileHead } from '../virtual-file-system'

const enc = (s: string) => new TextEncoder().encode(s)
const np = (p: string) => p.replace(/^\/+/, '')

class MemoryFileSystem extends GenericVirtualFileSystem {
  readonly files = new Map<string, Uint8Array>()
  async list(prefix: string): Promise<VirtualEntry[]> {
    const base = np(prefix)
    const dirPrefix = base === '' ? '' : `${base}/`
    const out: VirtualEntry[] = []
    for (const key of this.files.keys()) if (base === '' || key.startsWith(dirPrefix)) out.push({ kind: 'file', pathname: key })
    return out
  }
  async read(p: string): Promise<Uint8Array> {
    const v = this.files.get(np(p))
    if (v == null) throw fileNotFound(p)
    return v
  }
  async readable(p: string): Promise<ReadableStream<Uint8Array>> {
    const v = await this.read(p)
    return new ReadableStream({
      start(c) {
        c.enqueue(v)
        c.close()
      },
    })
  }
  async write(p: string, c: Uint8Array): Promise<void> {
    this.files.set(np(p), c)
  }
  async writable(): Promise<WritableStream<Uint8Array>> {
    throw fileNotFound('not used')
  }
  async delete(p: string): Promise<void> {
    this.files.delete(np(p))
  }
  async exists(p: string): Promise<boolean> {
    return this.files.has(np(p))
  }
  async head(p: string): Promise<FileHead> {
    return { size: (await this.read(p)).byteLength, modifiedAt: 0, createdAt: 0 }
  }
}

async function expectDenied(p: Promise<unknown>): Promise<void> {
  await p.then(
    () => {
      throw new Error('expected ScopeAccessDenied, but the operation resolved')
    },
    (e) => expect(hasErrorCode(e, 'ScopeAccessDenied')).toBe(true),
  )
}

const pluginNamed = (name: string): Plugin => ({ manifest: { name, version: '0.0.0', author: 't' } }) as unknown as Plugin

describe('PluginVfs', () => {
  test('scopes storage/state/temp to <bucket>/<id>/', async () => {
    const mem = new MemoryFileSystem()
    const vfs = new PluginVfs(mem, 'tester')

    await vfs.storage.write('config.toml', enc('a = 1'))
    await vfs.state.write('cursor', enc('c'))
    await vfs.temp.write('blob', enc('t'))
    expect(await mem.exists('storage/tester/config.toml')).toBe(true)
    expect(await mem.exists('state/tester/cursor')).toBe(true)
    expect(await mem.exists('temp/tester/blob')).toBe(true)
  })

  test('buckets reject `..` escape past the prefix (hygiene, not a sandbox)', async () => {
    const vfs = new PluginVfs(new MemoryFileSystem(), 'tester')
    await expectDenied(vfs.storage.write('../other/x', enc('no')))
  })
})

describe('bindPluginVfs', () => {
  test('binds a per-plugin PluginVfs into a scope, deriving from the parent-bound RootVfs', () => {
    const mem = new MemoryFileSystem()
    const services = new LazyContainer<object>('Service')
    services.bind(RootVfs, () => mem)

    // The RootVfs key resolves directly to the bound fs — no wrapper, no construction.
    expect(services.get(RootVfs)).toBe(mem)

    const scopeA = services.child('PluginScope')
    bindPluginVfs(scopeA, pluginNamed('a'))
    const scopeB = services.child('PluginScope')
    bindPluginVfs(scopeB, pluginNamed('b'))

    const a = scopeA.get(PluginVfs)
    const b = scopeB.get(PluginVfs)
    expect(a).not.toBe(b) // each plugin scope resolves its own PluginVfs
    expect(a.storage).not.toBe(b.storage) // scoped to different ids
  })
})
