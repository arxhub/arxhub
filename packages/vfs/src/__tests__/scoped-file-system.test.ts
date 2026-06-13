import { hasErrorCode } from '@arxhub/errors'
import { normalizePath } from '@arxhub/path'
import { describe, expect, test } from 'vitest'
import { fileNotFound } from '../errors'
import { GenericVirtualFileSystem } from '../generic-virtual-file-system'
import { matchesScope } from '../scope'
import { ScopedFileSystem } from '../scoped-file-system'
import type { VirtualEntry } from '../virtual-entry'
import type { FileHead } from '../virtual-file-system'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array) => new TextDecoder().decode(b)

// Minimal flat in-memory backend, just enough to exercise the decorator.
class MemoryFileSystem extends GenericVirtualFileSystem {
  readonly files = new Map<string, Uint8Array>()

  seed(path: string, content = 'x'): void {
    this.files.set(normalizePath(path), enc(content))
  }

  async list(prefix: string): Promise<VirtualEntry[]> {
    const base = normalizePath(prefix)
    const dirPrefix = base === '' ? '' : `${base}/`
    const dirs = new Set<string>()
    const out: VirtualEntry[] = []
    for (const key of this.files.keys()) {
      if (base !== '' && !key.startsWith(dirPrefix)) continue
      const rest = key.slice(dirPrefix.length)
      const slash = rest.indexOf('/')
      if (slash === -1) out.push({ kind: 'file', pathname: key })
      else dirs.add(`${dirPrefix}${rest.slice(0, slash)}`)
    }
    for (const d of dirs) out.push({ kind: 'dir', pathname: d })
    return out
  }

  async read(pathname: string): Promise<Uint8Array> {
    const v = this.files.get(normalizePath(pathname))
    if (v == null) throw fileNotFound(pathname)
    return v
  }

  async readable(pathname: string): Promise<ReadableStream<Uint8Array>> {
    const v = await this.read(pathname)
    return new ReadableStream({
      start(c) {
        c.enqueue(v)
        c.close()
      },
    })
  }

  async write(pathname: string, content: Uint8Array): Promise<void> {
    this.files.set(normalizePath(pathname), content)
  }

  async writable(pathname: string): Promise<WritableStream<Uint8Array>> {
    const key = normalizePath(pathname)
    const chunks: Uint8Array[] = []
    const files = this.files
    return new WritableStream({
      write(c) {
        chunks.push(c)
      },
      close() {
        files.set(key, chunks.length === 1 ? chunks[0] : enc(chunks.map(dec).join('')))
      },
    })
  }

  async delete(pathname: string): Promise<void> {
    this.files.delete(normalizePath(pathname))
  }

  async exists(pathname: string): Promise<boolean> {
    return this.files.has(normalizePath(pathname))
  }

  async head(pathname: string): Promise<FileHead> {
    const v = await this.read(pathname)
    return { size: v.byteLength, modifiedAt: 0, createdAt: 0 }
  }
}

async function expectDenied(p: Promise<unknown>): Promise<void> {
  await p.then(
    () => {
      throw new Error('expected ScopeAccessDenied, but the operation resolved')
    },
    (e) => {
      expect(hasErrorCode(e, 'ScopeAccessDenied')).toBe(true)
    },
  )
}

describe('ScopedFileSystem — prefix rooting', () => {
  test('reads/writes are rooted at the prefix and invisible to the caller', async () => {
    const mem = new MemoryFileSystem()
    const fs = new ScopedFileSystem(mem, 'storage/sync')

    await fs.write('config.toml', enc('hello'))

    expect(dec(await mem.read('storage/sync/config.toml'))).toBe('hello')
    expect(dec(await fs.read('config.toml'))).toBe('hello')
    expect(await fs.exists('config.toml')).toBe(true)
    expect(await fs.exists('missing.toml')).toBe(false)
  })

  test('list strips the prefix from returned entries', async () => {
    const mem = new MemoryFileSystem()
    mem.seed('storage/sync/a.txt')
    mem.seed('storage/sync/sub/b.txt')
    mem.seed('storage/other/c.txt') // outside the scope — must not appear
    const fs = new ScopedFileSystem(mem, 'storage/sync')

    const entries = await fs.list('')
    expect(entries.map((e) => `${e.kind}:${e.pathname}`).sort()).toEqual(['dir:sub', 'file:a.txt'])
  })

  test('walk yields prefix-relative pathnames', async () => {
    const mem = new MemoryFileSystem()
    mem.seed('storage/sync/a.txt')
    mem.seed('storage/sync/sub/b.txt')
    const fs = new ScopedFileSystem(mem, 'storage/sync')

    const names: string[] = []
    for await (const file of fs.walk('')) names.push(file.pathname)
    expect(names.sort()).toEqual(['a.txt', 'sub/b.txt'])
  })

  test('rejects `..` traversal that would escape the prefix', async () => {
    const mem = new MemoryFileSystem()
    mem.seed('storage/other/secret.txt')
    const fs = new ScopedFileSystem(mem, 'storage/sync')

    await expectDenied(fs.read('../other/secret.txt'))
  })
})

describe('ScopedFileSystem — scope enforcement', () => {
  const build = () => {
    const mem = new MemoryFileSystem()
    mem.seed('vault/note.md')
    mem.seed('storage/sync/config.toml')
    mem.seed('state/sync/repo.json')
    mem.seed('temp/sync/cache.bin')
    const fs = new ScopedFileSystem(mem, '', { allow: [{ path: 'vault/**' }, { path: 'storage/**' }] })
    return { mem, fs }
  }

  test('allows reads inside the granted scope', async () => {
    const { fs } = build()
    expect(dec(await fs.read('vault/note.md'))).toBe('x')
    expect(dec(await fs.read('storage/sync/config.toml'))).toBe('x')
  })

  test('denies reads and writes outside the granted scope', async () => {
    const { fs } = build()
    await expectDenied(fs.read('state/sync/repo.json'))
    await expectDenied(fs.write('temp/sync/cache.bin', enc('y')))
  })

  test('list filters out entries outside the scope', async () => {
    const { fs } = build()
    const top = await fs.list('')
    expect(top.map((e) => e.pathname).sort()).toEqual(['storage', 'vault'])
  })

  test('walk only visits granted subtrees', async () => {
    const { fs } = build()
    const names: string[] = []
    for await (const file of fs.walk('')) names.push(file.pathname)
    expect(names.sort()).toEqual(['storage/sync/config.toml', 'vault/note.md'])
  })

  test('deny wins over allow', async () => {
    const mem = new MemoryFileSystem()
    mem.seed('vault/public.md')
    mem.seed('vault/.secret/key')
    const fs = new ScopedFileSystem(mem, '', { allow: [{ path: '**' }], deny: [{ path: 'vault/.secret/**' }] })

    expect(dec(await fs.read('vault/public.md'))).toBe('x')
    await expectDenied(fs.read('vault/.secret/key'))
  })
})

describe('ScopedFileSystem — lock delegation', () => {
  test('runs the critical section and returns its value', async () => {
    const mem = new MemoryFileSystem()
    const fs = new ScopedFileSystem(mem, 'storage/sync')
    const result = await fs.lock('config.toml', async () => 42)
    expect(result).toBe(42)
  })

  test('serializes overlapping critical sections on the same path', async () => {
    const mem = new MemoryFileSystem()
    const fs = new ScopedFileSystem(mem, 'storage/sync')
    const order: string[] = []
    const first = fs.lock('config.toml', async () => {
      order.push('a-start')
      await new Promise((r) => setTimeout(r, 10))
      order.push('a-end')
    })
    const second = fs.lock('config.toml', async () => {
      order.push('b')
    })
    await Promise.all([first, second])
    expect(order).toEqual(['a-start', 'a-end', 'b'])
  })
})

describe('matchesScope', () => {
  test('allow-list semantics with /** and exact rules', () => {
    const scope = { allow: [{ path: 'vault/**' }, { path: 'a/b.toml' }] }
    expect(matchesScope('vault', scope)).toBe(true)
    expect(matchesScope('vault/x/y', scope)).toBe(true)
    expect(matchesScope('a/b.toml', scope)).toBe(true)
    expect(matchesScope('a/b.tomlx', scope)).toBe(false)
    expect(matchesScope('other', scope)).toBe(false)
  })

  test('empty allow-list allows everything', () => {
    expect(matchesScope('anything/here', {})).toBe(true)
  })

  test('/* matches only direct children', () => {
    const scope = { allow: [{ path: 'x/*' }] }
    expect(matchesScope('x/a', scope)).toBe(true)
    expect(matchesScope('x/a/b', scope)).toBe(false)
  })

  test('deny overrides allow', () => {
    const scope = { allow: [{ path: '**' }], deny: [{ path: 'secret/**' }] }
    expect(matchesScope('ok', scope)).toBe(true)
    expect(matchesScope('secret/x', scope)).toBe(false)
  })
})
