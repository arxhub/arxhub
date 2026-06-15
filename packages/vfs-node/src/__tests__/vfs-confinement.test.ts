import { ConsoleLogger } from '@arxhub/core'
import { hasErrorCode } from '@arxhub/errors'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { beforeEach, describe, expect, test } from 'vitest'
import { NodeFileSystem } from '../index'

// The root VFS must never let any caller (HTTP clients, plugins, sync) read or write outside the
// chosen storage folder. Every operation that escapes via '..' or an absolute path must throw
// ScopeAccessDenied (403) rather than touching the host filesystem.
describe('NodeFileSystem confinement', () => {
  let vfs: VirtualFileSystem

  beforeEach(async () => {
    vfs = new NodeFileSystem(`${__dirname}/testdata/vfs-confinement`, new ConsoleLogger())
    await vfs.delete('/', { force: true, recursive: true })
  })

  // A leading '/' is VFS-root-relative (normalizePath strips it), so '/etc/passwd' stays contained
  // and is NOT an escape — see the "legitimate nested paths" case. Only a surviving '..' escapes.
  const escapes = ['../escape.txt', '../../etc/passwd', 'a/../../escape.txt', '/../escape.txt']

  test.each(escapes)('read(%s) is rejected as ScopeAccessDenied', async (path) => {
    await expect(vfs.read(path)).rejects.toSatisfy((e) => hasErrorCode(e, 'ScopeAccessDenied'))
  })

  test.each(escapes)('write(%s) is rejected as ScopeAccessDenied', async (path) => {
    await expect(vfs.write(path, new Uint8Array([1]))).rejects.toSatisfy((e) => hasErrorCode(e, 'ScopeAccessDenied'))
  })

  test('delete escaping path is rejected (cannot rm outside root)', async () => {
    await expect(vfs.delete('../../escape.txt', { force: true })).rejects.toSatisfy((e) => hasErrorCode(e, 'ScopeAccessDenied'))
  })

  test('exists escaping path is rejected, not silently false', async () => {
    await expect(vfs.exists('../../etc/passwd')).rejects.toSatisfy((e) => hasErrorCode(e, 'ScopeAccessDenied'))
  })

  test('rename escaping src or dest is rejected', async () => {
    await vfs.write('inside.txt', new TextEncoder().encode('x'))
    await expect(
      (vfs as unknown as { rename(a: string, b: string): Promise<void> }).rename('inside.txt', '../../escape.txt'),
    ).rejects.toSatisfy((e) => hasErrorCode(e, 'ScopeAccessDenied'))
  })

  test('legitimate nested paths still work', async () => {
    await vfs.write('vault/notes/a.txt', new TextEncoder().encode('hello'))
    expect(new TextDecoder().decode(await vfs.read('vault/notes/a.txt'))).toBe('hello')
    expect(await vfs.exists('vault/notes/a.txt')).toBe(true)
    // A leading slash is normalized to root-relative, not treated as an escape.
    expect(new TextDecoder().decode(await vfs.read('/vault/notes/a.txt'))).toBe('hello')
  })

  test('internal .. that stays within root is allowed', async () => {
    await vfs.write('vault/a/b.txt', new TextEncoder().encode('ok'))
    expect(new TextDecoder().decode(await vfs.read('vault/a/../a/b.txt'))).toBe('ok')
  })
})
