import { hasErrorCode } from '@arxhub/errors'
import { type FileHead, fileNotFound, GenericVirtualFileSystem, type VirtualEntry } from '@arxhub/vfs'
import { describe, expect, test } from 'vitest'
import { ArxHub } from '../arxhub'
import { definePluginManifest, Plugin, type PluginArgs } from '../plugin'
import { PluginHome, RootVfs } from '../plugin-home'

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
    throw new Error('not used')
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

let captured: PluginHome | undefined

class TesterPlugin extends Plugin<ArxHub> {
  constructor(args: PluginArgs) {
    super(
      args,
      definePluginManifest({
        name: 'tester',
        version: '0.0.0',
        author: 'test',
      }),
    )
  }
  override async start(): Promise<void> {
    captured = this.container.get(PluginHome)
  }
}

describe('Core DI scope + PluginHome (integration)', () => {
  test('Core hands each plugin a home scoped to its manifest id', async () => {
    const mem = new MemoryFileSystem()
    const arxhub = new ArxHub()
    arxhub.services.register(RootVfs, () => [mem])
    arxhub.plugins.register(TesterPlugin)

    await arxhub.start()

    const home = captured
    expect(home).toBeInstanceOf(PluginHome)
    if (home == null) throw new Error('no home')

    // Buckets are prefix-scoped to <bucket>/<manifest.name>/
    await home.storage.write('config.toml', enc('a = 1'))
    await home.state.write('cursor', enc('c'))
    await home.temp.write('blob', enc('t'))
    expect(await mem.exists('storage/tester/config.toml')).toBe(true)
    expect(await mem.exists('state/tester/cursor')).toBe(true)
    expect(await mem.exists('temp/tester/blob')).toBe(true)

    // The home buckets reject `..` escape past their prefix (hygiene, not a sandbox).
    await expectDenied(home.storage.write('../other/x', enc('no')))
  })

  test('each plugin gets an isolated child scope', () => {
    const arxhub = new ArxHub()
    arxhub.services.register(RootVfs, () => [new MemoryFileSystem()])

    // Two child scopes minted from services resolve RootVfs from the shared parent, but bind their
    // own PluginHome — proving local isolation with parent fallback.
    const a = arxhub.services.child()
    const b = arxhub.services.child()
    expect(a.get(RootVfs)).toBe(b.get(RootVfs)) // shared parent singleton
    a.register(PluginHome, () => [a.get(RootVfs).fs, { name: 'a', version: '0', author: 't' }])
    b.register(PluginHome, () => [b.get(RootVfs).fs, { name: 'b', version: '0', author: 't' }])
    expect(a.get(PluginHome)).not.toBe(b.get(PluginHome))
  })
})
