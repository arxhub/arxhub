import { ConsoleLogger } from '@arxhub/core'
import { beforeEach, describe, expect, test } from 'vitest'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '../index'

describe('VirtualFileImpl', () => {
  let vfs: VirtualFileSystem

  beforeEach(async () => {
    vfs = new NodeFileSystem(`${__dirname}/testdata/virtual-file-impl`, new ConsoleLogger())
    await vfs.delete('/', { force: true, recursive: true })
  })

  test('write → read round-trip', async () => {
    const file = vfs.file('hello.bin')
    const data = new Uint8Array([1, 2, 3, 4, 5])
    await file.write(data)
    const result = await file.read()
    expect(result).toEqual(data)
  })

  test('writeText → readText', async () => {
    const file = vfs.file('hello.txt')
    await file.writeText('hello world')
    expect(await file.readText()).toEqual('hello world')
  })

  test('writeJSON → readJSON', async () => {
    const file = vfs.file('data.json')
    await file.writeJSON({ foo: 'bar', n: 42 })
    expect(await file.readJSON()).toEqual({ foo: 'bar', n: 42 })
  })

  test('readJSON with defaultValue when file missing', async () => {
    const file = vfs.file('missing.json')
    expect(await file.readJSON(['default'])).toEqual(['default'])
  })

  test('readJSON without defaultValue throws when file missing', async () => {
    const file = vfs.file('missing.json')
    await expect(file.readJSON()).rejects.toThrow()
  })

  test('exists() false for missing file, true after write', async () => {
    const file = vfs.file('exists.txt')
    expect(await file.exists()).toBe(false)
    await file.writeText('x')
    expect(await file.exists()).toBe(true)
  })

  test('delete() removes content and .info sidecar', async () => {
    const file = vfs.file('sidecar.txt')
    await file.writeText('data')
    expect(await vfs.exists('sidecar.txt')).toBe(true)
    expect(await vfs.exists('sidecar.txt.info')).toBe(true)
    await file.delete()
    expect(await vfs.exists('sidecar.txt')).toBe(false)
    expect(await vfs.exists('sidecar.txt.info')).toBe(false)
  })

  test('write() stores sha256 hash in .info', async () => {
    const file = vfs.file('hashed.txt')
    await file.writeText('Lorem ipsum')
    const h = await file.info.get('hash')
    expect(typeof h).toBe('string')
    expect(h).toHaveLength(64)
  })

  test('writable() stream → hash populated on close', async () => {
    const file = vfs.file('stream.txt')
    const writable = await file.writable()
    const writer = writable.getWriter()
    await writer.write(new TextEncoder().encode('hello'))
    await writer.write(new TextEncoder().encode(' world'))
    await writer.close()
    const h = await file.info.get('hash')
    expect(typeof h).toBe('string')
    expect(h).toHaveLength(64)
    expect(await file.readText()).toEqual('hello world')
  })

  test('write() hash matches manual sha256', async () => {
    const { hash } = await import('@arxhub/crypto')
    const file = vfs.file('hash-match.txt')
    const content = new TextEncoder().encode('verify me')
    await file.write(content)
    expect(await file.info.get('hash')).toEqual(await hash(content, 'sha256'))
  })
})
