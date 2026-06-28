import { normalizePath } from '@arxhub/path'
import { describe, expect, test, vi } from 'vitest'
import type { AppendCapable } from '../capabilities/append'
import { fileNotFound } from '../errors'
import { GenericVirtualFileSystem } from '../generic-virtual-file-system'
import { appendEntry } from '../ops/append'
import { ScopedFileSystem } from '../scoped-file-system'
import type { VirtualEntry } from '../virtual-entry'
import type { FileHead } from '../virtual-file-system'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array) => new TextDecoder().decode(b)

// Minimal flat in-memory backend (write/read/exists only — enough for appendEntry).
class MemoryFileSystem extends GenericVirtualFileSystem {
  readonly files = new Map<string, Uint8Array>()

  async list(): Promise<VirtualEntry[]> {
    return []
  }
  async read(pathname: string): Promise<Uint8Array> {
    const v = this.files.get(normalizePath(pathname))
    if (v == null) throw fileNotFound(pathname)
    return v
  }
  async readable(): Promise<ReadableStream<Uint8Array>> {
    throw new Error('unused')
  }
  async write(pathname: string, content: Uint8Array): Promise<void> {
    this.files.set(normalizePath(pathname), content)
  }
  async writable(): Promise<WritableStream<Uint8Array>> {
    throw new Error('unused')
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

class AppendableMemoryFileSystem extends MemoryFileSystem implements AppendCapable {
  async append(pathname: string, content: Uint8Array): Promise<void> {
    const key = normalizePath(pathname)
    const prev = this.files.get(key) ?? new Uint8Array(0)
    const combined = new Uint8Array(prev.length + content.length)
    combined.set(prev, 0)
    combined.set(content, prev.length)
    this.files.set(key, combined)
  }
}

describe('appendEntry', () => {
  test('delegates to a native append-capable backend', async () => {
    const mem = new AppendableMemoryFileSystem()
    const spy = vi.spyOn(mem, 'append')
    const writeSpy = vi.spyOn(mem, 'write')

    await appendEntry(mem, 'log.ndjson', enc('a\n'))
    await appendEntry(mem, 'log.ndjson', enc('b\n'))

    expect(spy).toHaveBeenCalledTimes(2)
    expect(writeSpy).not.toHaveBeenCalled()
    expect(dec(mem.files.get('log.ndjson') as Uint8Array)).toBe('a\nb\n')
  })

  test('falls back to read+write, creating the file when absent', async () => {
    const mem = new MemoryFileSystem()

    await appendEntry(mem, 'log.ndjson', enc('a\n'))
    expect(dec(mem.files.get('log.ndjson') as Uint8Array)).toBe('a\n')

    await appendEntry(mem, 'log.ndjson', enc('b\n'))
    expect(dec(mem.files.get('log.ndjson') as Uint8Array)).toBe('a\nb\n')
  })

  test('works through a ScopedFileSystem, appending at the resolved path', async () => {
    const mem = new AppendableMemoryFileSystem()
    const scoped = new ScopedFileSystem(mem, 'state/logger')

    await appendEntry(scoped, 'logs/session.ndjson', enc('x\n'))
    await appendEntry(scoped, 'logs/session.ndjson', enc('y\n'))

    expect(dec(mem.files.get('state/logger/logs/session.ndjson') as Uint8Array)).toBe('x\ny\n')
  })
})
