import { ConsoleLogger } from '@arxhub/core'
import { hasErrorCode } from '@arxhub/errors'
import { readRange } from '@arxhub/vfs'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { NodeFileSystem } from '../index'

const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

describe('NodeFileSystem.readRange', () => {
  let vfs: NodeFileSystem

  beforeEach(async () => {
    vfs = new NodeFileSystem(`${__dirname}/testdata/read-range`, new ConsoleLogger())
    await vfs.delete('/', { force: true, recursive: true })
  })

  test('a middle slice', async () => {
    await vfs.write('a.bin', new TextEncoder().encode('0123456789'))
    expect(dec(await vfs.readRange('a.bin', 3, 4))).toBe('3456')
  })

  test('no length reads to the end', async () => {
    await vfs.write('a.bin', new TextEncoder().encode('0123456789'))
    expect(dec(await vfs.readRange('a.bin', 4))).toBe('456789')
  })

  test('a length past the end clamps to a shorter slice', async () => {
    await vfs.write('a.bin', new TextEncoder().encode('0123456789'))
    expect(dec(await vfs.readRange('a.bin', 8, 100))).toBe('89')
  })

  test('an offset at or past the end is empty, not an error', async () => {
    await vfs.write('a.bin', new TextEncoder().encode('0123456789'))
    expect((await vfs.readRange('a.bin', 10)).byteLength).toBe(0)
    expect((await vfs.readRange('a.bin', 50, 5)).byteLength).toBe(0)
  })

  test('a suffix range reads the last |offset| bytes', async () => {
    await vfs.write('a.bin', new TextEncoder().encode('0123456789'))
    expect(dec(await vfs.readRange('a.bin', -3))).toBe('789')
  })

  test('a missing file rejects with FileNotFound', async () => {
    const isNotFound = (error: unknown) => hasErrorCode(error, 'FileNotFound')
    await expect(vfs.readRange('missing.bin', 0, 1)).rejects.toSatisfy(isNotFound)
  })

  test('a non-integer offset rejects with ValidationError', async () => {
    await vfs.write('a.bin', new TextEncoder().encode('0123456789'))
    const isValidation = (error: unknown) => hasErrorCode(error, 'ValidationError')
    await expect(vfs.readRange('a.bin', 1.5)).rejects.toSatisfy(isValidation)
  })

  test('the readRange op picks the native path and never reads the whole file', async () => {
    await vfs.write('a.bin', new TextEncoder().encode('0123456789'))
    const read = vi.spyOn(vfs, 'read')

    expect(dec(await readRange(vfs, 'a.bin', 2, 3))).toBe('234')
    expect(read).not.toHaveBeenCalled()
  })

  test('a slice across a 128 KiB boundary in a large file, read via a multi-read loop', async () => {
    const total = 200_000
    const content = new Uint8Array(total)
    for (let i = 0; i < total; i++) content[i] = i % 251
    await vfs.write('big.bin', content)

    const start = 128 * 1024 - 100
    const length = 500
    const slice = await vfs.readRange('big.bin', start, length)
    expect(slice.byteLength).toBe(length)
    expect(slice).toEqual(content.subarray(start, start + length))
  })
})
