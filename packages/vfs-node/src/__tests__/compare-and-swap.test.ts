import { ConsoleLogger } from '@arxhub/core'
import { compareAndSwap, isCompareAndSwapCapable, ScopedFileSystem } from '@arxhub/vfs'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { NodeFileSystem } from '../index'

const enc = (text: string) => new TextEncoder().encode(text)
const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

// Two instances over ONE directory is the shape of the race this exists for: the dev stand's server
// and a test harness each open their own NodeFileSystem, and nothing but the disk is shared between
// them — an instance lock would let both pass the compare.
describe('NodeFileSystem.compareAndSwap', () => {
  const dir = `${__dirname}/testdata/compare-and-swap`
  let a: NodeFileSystem
  let b: NodeFileSystem

  beforeEach(async () => {
    a = new NodeFileSystem(dir, new ConsoleLogger())
    b = new NodeFileSystem(dir, new ConsoleLogger())
    await a.delete('/', { force: true, recursive: true })
  })

  test('declares the capability', () => {
    expect(isCompareAndSwapCapable(a)).toBe(true)
  })

  test('swaps on a match, refuses on a mismatch without throwing, and never writes on a refusal', async () => {
    await a.write('head', enc('one'))
    expect(await b.compareAndSwap('head', enc('stale'), enc('two'))).toBe(false)
    expect(dec(await a.read('head'))).toBe('one')
    expect(await b.compareAndSwap('head', enc('one'), enc('two'))).toBe(true)
    expect(dec(await a.read('head'))).toBe('two')
  })

  test('null expects the file to be absent, and creates the parent directories on a seed', async () => {
    expect(await a.compareAndSwap('repo/head', enc('one'), enc('two'))).toBe(false)
    expect(await a.exists('repo/head')).toBe(false)
    expect(await a.compareAndSwap('repo/head', null, enc('one'))).toBe(true)
    expect(dec(await b.read('repo/head'))).toBe('one')
    expect(await b.compareAndSwap('repo/head', null, enc('two'))).toBe(false)
    expect(dec(await a.read('repo/head'))).toBe('one')
  })

  test('N contenders across two instances with the same expected: exactly one wins, and the file holds its value', async () => {
    await a.write('head', enc('base'))
    const results = await Promise.all(
      Array.from({ length: 16 }, (_, i) => (i % 2 === 0 ? a : b).compareAndSwap('head', enc('base'), enc(`writer-${i}`))),
    )
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(dec(await a.read('head'))).toBe(`writer-${results.indexOf(true)}`)
  })

  test('N contenders seeding an absent file: exactly one wins', async () => {
    const results = await Promise.all(
      Array.from({ length: 16 }, (_, i) => (i % 2 === 0 ? a : b).compareAndSwap('head', null, enc(`seed-${i}`))),
    )
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(dec(await b.read('head'))).toBe(`seed-${results.indexOf(true)}`)
  })

  test('a scoped store over the backend reaches the native swap, at the translated path', async () => {
    const native = vi.spyOn(a, 'compareAndSwap')
    const store = new ScopedFileSystem(a, 'state/Repository')
    expect(await compareAndSwap(store, '/repo/head', null, enc('one'))).toBe(true)
    expect(native).toHaveBeenCalledWith('state/Repository/repo/head', null, expect.any(Uint8Array))
    expect(dec(await b.read('state/Repository/repo/head'))).toBe('one')
  })

  test('a path escaping the root is refused before anything is read', async () => {
    await expect(a.compareAndSwap('../outside', null, enc('x'))).rejects.toThrow()
  })
})
