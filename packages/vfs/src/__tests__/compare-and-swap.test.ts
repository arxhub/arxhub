import { describe, expect, test, vi } from 'vitest'
import { type CompareAndSwapCapable, isCompareAndSwapCapable } from '../capabilities/compare-and-swap'
import { ObservedFileSystem } from '../observed-file-system'
import { compareAndSwap, sameBytes } from '../ops/compare-and-swap'
import { ScopedFileSystem } from '../scoped-file-system'
import { VfsWatcher } from '../vfs-watcher'
import { dec, enc, MemoryFileSystem } from './memory-file-system'

// A backend with a compare-and-swap of its own. Records what it was asked, so a test can tell native
// from fallback.
class SwappingMemoryFileSystem extends MemoryFileSystem implements CompareAndSwapCapable {
  readonly asked: Array<[string, Uint8Array | null, Uint8Array]> = []

  async compareAndSwap(pathname: string, expected: Uint8Array | null, next: Uint8Array): Promise<boolean> {
    this.asked.push([pathname, expected, next])
    const current = (await this.exists(pathname)) ? await this.read(pathname) : null
    if (!sameBytes(current, expected)) return false
    await this.write(pathname, next)
    return true
  }
}

describe('sameBytes', () => {
  test('compares content, not identity, and treats null as "absent" on both sides', () => {
    expect(sameBytes(enc('abc'), enc('abc'))).toBe(true)
    expect(sameBytes(enc('abc'), enc('abd'))).toBe(false)
    expect(sameBytes(enc('abc'), enc('ab'))).toBe(false)
    expect(sameBytes(null, null)).toBe(true)
    expect(sameBytes(null, enc(''))).toBe(false)
    expect(sameBytes(enc(''), null)).toBe(false)
  })
})

describe('compareAndSwap op, fallback', () => {
  test('seeds an absent file when nothing is expected there', async () => {
    const fs = new MemoryFileSystem()
    expect(await compareAndSwap(fs, 'head', null, enc('one'))).toBe(true)
    expect(dec(fs.files.get('head') as Uint8Array)).toBe('one')
  })

  test('refuses to seed over a file that exists, and leaves it alone', async () => {
    const fs = new MemoryFileSystem()
    fs.seed('head', 'one')
    expect(await compareAndSwap(fs, 'head', null, enc('two'))).toBe(false)
    expect(dec(fs.files.get('head') as Uint8Array)).toBe('one')
  })

  test('swaps when the current bytes are what the caller expected', async () => {
    const fs = new MemoryFileSystem()
    fs.seed('head', 'one')
    expect(await compareAndSwap(fs, 'head', enc('one'), enc('two'))).toBe(true)
    expect(dec(fs.files.get('head') as Uint8Array)).toBe('two')
  })

  test('a mismatch is an answer, not an error, and writes nothing', async () => {
    const fs = new MemoryFileSystem()
    fs.seed('head', 'one')
    const write = vi.spyOn(fs, 'write')
    expect(await compareAndSwap(fs, 'head', enc('stale'), enc('two'))).toBe(false)
    expect(write).not.toHaveBeenCalled()
    expect(dec(fs.files.get('head') as Uint8Array)).toBe('one')
  })

  test('an expected value against a missing file is a mismatch', async () => {
    const fs = new MemoryFileSystem()
    expect(await compareAndSwap(fs, 'head', enc('one'), enc('two'))).toBe(false)
    expect(fs.files.has('head')).toBe(false)
  })

  test('holds the path lock around read-compare-write, so contenders on ONE instance see one winner', async () => {
    const fs = new MemoryFileSystem()
    fs.seed('head', 'base')
    const lock = vi.spyOn(fs, 'lock')
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => compareAndSwap(fs, 'head', enc('base'), enc(`w${i}`))))
    expect(results.filter(Boolean)).toHaveLength(1)
    const winner = results.indexOf(true)
    expect(dec(fs.files.get('head') as Uint8Array)).toBe(`w${winner}`)
    expect(lock).toHaveBeenCalledWith('head', expect.any(Function))
  })
})

describe('compareAndSwap op, native', () => {
  test('a capable backend is asked natively and the op itself never reads or writes', async () => {
    const fs = new SwappingMemoryFileSystem()
    fs.seed('head', 'one')
    const read = vi.spyOn(fs, 'read')
    const write = vi.spyOn(fs, 'write')
    expect(await compareAndSwap(fs, 'head', enc('one'), enc('two'))).toBe(true)
    expect(fs.asked).toHaveLength(1)
    // The double reads and writes inside its own compareAndSwap; what matters is that the op did not.
    expect(read).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledTimes(1)
  })

  test('isCompareAndSwapCapable is structural', () => {
    expect(isCompareAndSwapCapable(new SwappingMemoryFileSystem())).toBe(true)
    expect(isCompareAndSwapCapable(new MemoryFileSystem())).toBe(false)
    expect(isCompareAndSwapCapable(null)).toBe(false)
  })
})

describe('compareAndSwap through decorators', () => {
  test('a scoped view over a capable backend is capable at the backend, in backend coordinates', async () => {
    const backend = new SwappingMemoryFileSystem()
    backend.seed('state/Repository/repo/head', 'one')
    const store = new ScopedFileSystem(backend, 'state/Repository')

    expect(isCompareAndSwapCapable(store)).toBe(true)
    expect(await compareAndSwap(store, '/repo/head', enc('one'), enc('two'))).toBe(true)
    expect(backend.asked.map(([pathname]) => pathname)).toEqual(['state/Repository/repo/head'])
    expect(dec(backend.files.get('state/Repository/repo/head') as Uint8Array)).toBe('two')
  })

  test('a scoped view over a plain backend reaches the fallback at the translated path', async () => {
    const backend = new MemoryFileSystem()
    const store = new ScopedFileSystem(backend, 'state/Repository')

    expect(await compareAndSwap(store, '/repo/head', null, enc('one'))).toBe(true)
    expect(await compareAndSwap(store, '/repo/head', enc('stale'), enc('two'))).toBe(false)
    expect(dec(backend.files.get('state/Repository/repo/head') as Uint8Array)).toBe('one')
  })

  test('an observed view reports a swap that landed and says nothing about one that was refused', async () => {
    const backend = new MemoryFileSystem()
    backend.seed('head', 'one')
    const watcher = new VfsWatcher()
    const changes: string[] = []
    watcher.subscribe((change) => changes.push(`${change.kind}:${change.pathname}`))
    const observed = ObservedFileSystem.wrap(backend, watcher)

    expect(await compareAndSwap(observed, 'head', enc('stale'), enc('two'))).toBe(false)
    expect(changes).toEqual([])
    expect(await compareAndSwap(observed, 'head', enc('one'), enc('two'))).toBe(true)
    expect(changes).toEqual(['written:head'])
  })
})
