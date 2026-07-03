import { keyringFromMnemonic } from '@arxhub/crypto'
import { normalizePath } from '@arxhub/path'
import { describe, expect, test } from 'vitest'
import { EncryptingFileSystem } from '../encrypting-file-system'
import { fileNotFound } from '../errors'
import { GenericVirtualFileSystem } from '../generic-virtual-file-system'
import type { VirtualEntry } from '../virtual-entry'
import type { FileHead } from '../virtual-file-system'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array) => new TextDecoder().decode(b)

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const OTHER = 'legal winner thank year wave sausage worth useful legal winner thank yellow'
const KEY = keyringFromMnemonic(MNEMONIC).encryptionKey

// Minimal flat in-memory backend, mirroring scoped-file-system.test.ts.
class MemoryFileSystem extends GenericVirtualFileSystem {
  readonly files = new Map<string, Uint8Array>()

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
        const total = chunks.reduce((n, c) => n + c.length, 0)
        const merged = new Uint8Array(total)
        let offset = 0
        for (const c of chunks) {
          merged.set(c, offset)
          offset += c.length
        }
        files.set(key, merged)
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

describe('EncryptingFileSystem', () => {
  test('round-trips content while storing only ciphertext in the backend', async () => {
    const mem = new MemoryFileSystem()
    const fs = new EncryptingFileSystem(mem, KEY)

    await fs.write('note.md', enc('the tool recedes, content leads'))

    // The caller sees plaintext…
    expect(dec(await fs.read('note.md'))).toBe('the tool recedes, content leads')
    // …but the backend holds ciphertext that does not contain the plaintext.
    const stored = await mem.read('note.md')
    expect(dec(stored)).not.toContain('content leads')
    expect(stored.byteLength).toBeGreaterThan('the tool recedes, content leads'.length)
  })

  test('pathnames and listings pass through unchanged', async () => {
    const mem = new MemoryFileSystem()
    const fs = new EncryptingFileSystem(mem, KEY)
    await fs.write('a.txt', enc('one'))
    await fs.write('sub/b.txt', enc('two'))

    const entries = await fs.list('')
    expect(entries.map((e) => `${e.kind}:${e.pathname}`).sort()).toEqual(['dir:sub', 'file:a.txt'])
  })

  test('stream (readable/writable) round-trips through encryption', async () => {
    const mem = new MemoryFileSystem()
    const fs = new EncryptingFileSystem(mem, KEY)

    const writable = await fs.writable('chunk')
    const writer = writable.getWriter()
    await writer.write(enc('hello '))
    await writer.write(enc('world'))
    await writer.close()

    const reader = (await fs.readable('chunk')).getReader()
    const parts: Uint8Array[] = []
    for (let r = await reader.read(); !r.done; r = await reader.read()) parts.push(r.value)
    expect(dec(parts[0])).toBe('hello world')
    expect(dec(await mem.read('chunk'))).not.toContain('hello')
  })

  test('higher-level helpers (writeJSON/readJSON) are encrypted too', async () => {
    const mem = new MemoryFileSystem()
    const fs = new EncryptingFileSystem(mem, KEY)

    await fs.file('data.json').writeJSON({ secret: 'value', n: 42 })
    expect(await fs.file<{ secret: string; n: number }>('data.json').readJSON()).toEqual({ secret: 'value', n: 42 })
    expect(dec(await mem.read('data.json'))).not.toContain('secret')
  })

  test('reading with the wrong key fails', async () => {
    const mem = new MemoryFileSystem()
    const writer = new EncryptingFileSystem(mem, KEY)
    await writer.write('note.md', enc('classified'))

    const wrong = new EncryptingFileSystem(mem, keyringFromMnemonic(OTHER).encryptionKey)
    await expect(wrong.read('note.md')).rejects.toThrow()
  })

  test('delete and exists pass through', async () => {
    const mem = new MemoryFileSystem()
    const fs = new EncryptingFileSystem(mem, KEY)
    await fs.write('gone.txt', enc('x'))
    expect(await fs.exists('gone.txt')).toBe(true)
    await fs.delete('gone.txt')
    expect(await fs.exists('gone.txt')).toBe(false)
  })
})
