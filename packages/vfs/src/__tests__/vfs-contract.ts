import { hasErrorCode } from '@arxhub/errors'
import { describe, expect, test } from 'vitest'
import { appendEntry } from '../ops/append'
import { renameEntry } from '../ops/rename'
import type { VirtualFileSystem } from '../virtual-file-system'
import { dec, enc, type MemoryFileSystem } from './memory-file-system'

export interface ContractSubject {
  // The file system under test — either a backend or a decorator over one.
  fs: VirtualFileSystem
  // The backend behind it, so a check can read what actually landed in storage.
  backend: MemoryFileSystem
}

// The behaviour every VirtualFileSystem owes its callers. Run against a backend and against a decorator
// over the same backend: a decorator that changes any of these is not transparent, whatever else it adds.
export function describeFileSystemContract(label: string, create: () => ContractSubject): void {
  describe(`VirtualFileSystem contract — ${label}`, () => {
    test('write then read round-trips', async () => {
      const { fs, backend } = create()
      await fs.write('notes/a.md', enc('hello'))

      expect(dec(await fs.read('notes/a.md'))).toBe('hello')
      expect(dec(backend.files.get('notes/a.md') as Uint8Array)).toBe('hello')
    })

    test('reading a missing path rejects with FileNotFound', async () => {
      const { fs } = create()
      await expect(fs.read('missing.md')).rejects.toSatisfy((error: unknown) => hasErrorCode(error, 'FileNotFound'))
    })

    test('exists and head report the stored file', async () => {
      const { fs } = create()
      await fs.write('notes/a.md', enc('hello'))

      expect(await fs.exists('notes/a.md')).toBe(true)
      expect(await fs.exists('notes/b.md')).toBe(false)
      expect(await fs.head('notes/a.md')).toMatchObject({ size: 5 })
    })

    test('a write stream round-trips its chunks', async () => {
      const { fs } = create()
      const stream = await fs.writable('notes/stream.md')
      const writer = stream.getWriter()
      await writer.write(enc('one '))
      await writer.write(enc('two'))
      await writer.close()

      expect(dec(await fs.read('notes/stream.md'))).toBe('one two')
    })

    test('list reports files and dirs', async () => {
      const { fs, backend } = create()
      backend.seed('notes/a.md')
      backend.seed('notes/sub/b.md')

      const entries = await fs.list('notes')
      expect(entries.map((entry) => `${entry.kind}:${entry.pathname}`).sort()).toEqual(['dir:notes/sub', 'file:notes/a.md'])
    })

    test('walk yields every file under the prefix', async () => {
      const { fs, backend } = create()
      backend.seed('notes/a.md')
      backend.seed('notes/sub/b.md')

      const seen: string[] = []
      for await (const file of fs.walk('notes')) seen.push(file.pathname)
      expect(seen.sort()).toEqual(['notes/a.md', 'notes/sub/b.md'])
    })

    test('file() helpers read and write text and JSON', async () => {
      const { fs } = create()
      const file = fs.file('notes/a.md')
      await file.writeText('hello')
      expect(await fs.file('notes/a.md').readText()).toBe('hello')

      const config = fs.file('config.json')
      await config.writeJSON({ title: 'Hello' })
      expect(await fs.file('config.json').readJSON()).toEqual({ title: 'Hello' })
      expect(await fs.file('missing.json').readJSON({ title: 'Default' })).toEqual({ title: 'Default' })
    })

    test('file().delete removes the content', async () => {
      const { fs } = create()
      await fs.file('notes/a.md').write(enc('hello'))

      await fs.file('notes/a.md').delete()

      expect(await fs.exists('notes/a.md')).toBe(false)
    })

    test('deleting a missing path passes only with force', async () => {
      const { fs } = create()
      await expect(fs.delete('missing.md', { force: true })).resolves.toBeUndefined()
      await expect(fs.delete('missing.md')).rejects.toSatisfy((error: unknown) => hasErrorCode(error, 'FileNotFound'))
    })

    test('lock serializes overlapping critical sections on the same path', async () => {
      const { fs } = create()
      const order: string[] = []
      const first = fs.lock('notes/a.md', async () => {
        order.push('a-start')
        await new Promise((resolve) => setTimeout(resolve, 10))
        order.push('a-end')
      })
      const second = fs.lock('notes/a.md', async () => {
        order.push('b')
      })
      await Promise.all([first, second])

      expect(order).toEqual(['a-start', 'a-end', 'b'])
    })

    test('acquireLock holds the path until the release is called', async () => {
      const { fs } = create()
      const release = await fs.acquireLock('notes/a.md')
      let entered = false
      const waiting = fs.lock('notes/a.md', async () => {
        entered = true
      })

      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(entered).toBe(false)

      release()
      await waiting
      expect(entered).toBe(true)
    })

    test('appendEntry appends, creating the file when absent', async () => {
      const { fs } = create()
      await appendEntry(fs, 'log.ndjson', enc('a\n'))
      await appendEntry(fs, 'log.ndjson', enc('b\n'))

      expect(dec(await fs.read('log.ndjson'))).toBe('a\nb\n')
    })

    test('renameEntry moves the content to the new path', async () => {
      const { fs } = create()
      await fs.write('notes/a.md', enc('hello'))

      await renameEntry(fs, 'notes/a.md', 'notes/b.md')

      expect(dec(await fs.read('notes/b.md'))).toBe('hello')
      expect(await fs.exists('notes/a.md')).toBe(false)
    })
  })
}
