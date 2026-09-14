import { hasErrorCode } from '@arxhub/errors'
import { describe, expect, test, vi } from 'vitest'
import type { RangeCapable } from '../capabilities/range'
import { readRange, resolveRange } from '../ops/read-range'
import { ScopedFileSystem } from '../scoped-file-system'
import { dec, MemoryFileSystem } from './memory-file-system'

// A backend that can seek. Records what it was asked, so a test can tell native from fallback.
class SeekingMemoryFileSystem extends MemoryFileSystem implements RangeCapable {
  readonly asked: Array<[string, number, number | undefined]> = []

  async readRange(pathname: string, offset: number, length?: number): Promise<Uint8Array> {
    this.asked.push([pathname, offset, length])
    const bytes = await this.read(pathname)
    const { start, end } = resolveRange(bytes.byteLength, offset, length)
    return bytes.slice(start, end)
  }
}

describe('resolveRange', () => {
  test('a slice from the start, bounded by length', () => {
    expect(resolveRange(10, 2, 3)).toEqual({ start: 2, end: 5 })
  })

  test('no length reads to the end', () => {
    expect(resolveRange(10, 4)).toEqual({ start: 4, end: 10 })
  })

  test('clamps at the end of the file rather than failing', () => {
    expect(resolveRange(10, 8, 100)).toEqual({ start: 8, end: 10 })
    expect(resolveRange(10, 10)).toEqual({ start: 10, end: 10 })
    expect(resolveRange(10, 50, 5)).toEqual({ start: 10, end: 10 })
  })

  test('a negative offset is a suffix — the last |offset| bytes', () => {
    expect(resolveRange(10, -3)).toEqual({ start: 7, end: 10 })
    expect(resolveRange(2, -10)).toEqual({ start: 0, end: 2 })
  })

  test('rejects what is not a range', () => {
    const isValidation = (error: unknown) => hasErrorCode(error, 'ValidationError')
    expect(() => resolveRange(10, 1.5)).toThrow(expect.toSatisfy(isValidation))
    expect(() => resolveRange(10, Number.NaN)).toThrow(expect.toSatisfy(isValidation))
    expect(() => resolveRange(10, 0, -1)).toThrow(expect.toSatisfy(isValidation))
    expect(() => resolveRange(10, -3, 2)).toThrow(expect.toSatisfy(isValidation))
  })
})

describe('readRange op', () => {
  test('falls back to reading the whole file and cutting', async () => {
    const fs = new MemoryFileSystem()
    const read = vi.spyOn(fs, 'read')
    fs.seed('a.bin', '0123456789')

    expect(dec(await readRange(fs, 'a.bin', 3, 4))).toBe('3456')
    expect(dec(await readRange(fs, 'a.bin', -2))).toBe('89')
    expect(read).toHaveBeenCalledTimes(2)
  })

  test('the fallback returns a copy, not a view over the whole file', async () => {
    const fs = new MemoryFileSystem()
    fs.seed('a.bin', '0123456789')

    const slice = await readRange(fs, 'a.bin', 2, 2)
    expect(slice.byteLength).toBe(2)
    expect(slice.buffer.byteLength).toBe(2)
  })

  test('a missing file rejects with FileNotFound in both paths', async () => {
    const isNotFound = (error: unknown) => hasErrorCode(error, 'FileNotFound')
    await expect(readRange(new MemoryFileSystem(), 'missing', 0, 1)).rejects.toSatisfy(isNotFound)
    await expect(readRange(new SeekingMemoryFileSystem(), 'missing', 0, 1)).rejects.toSatisfy(isNotFound)
  })

  test('a range-capable backend is asked natively and never read whole', async () => {
    const fs = new SeekingMemoryFileSystem()
    const read = vi.spyOn(fs, 'read')
    fs.seed('a.bin', '0123456789')

    expect(dec(await readRange(fs, 'a.bin', 1, 2))).toBe('12')
    expect(fs.asked).toEqual([['a.bin', 1, 2]])
    // The seeking double reads inside readRange itself; what matters is that the OP did not.
    expect(read).toHaveBeenCalledTimes(1)
  })

  test('a scoped view over a seeking backend is range-capable at the backend, in backend coordinates', async () => {
    const backend = new SeekingMemoryFileSystem()
    backend.seed('vault/a.bin', 'abcdefgh')
    const vault = new ScopedFileSystem(backend, 'vault')

    expect(dec(await readRange(vault, 'a.bin', -3))).toBe('fgh')
    expect(backend.asked).toEqual([['vault/a.bin', -3, undefined]])
  })

  test('VirtualFile.readRange goes through the same op', async () => {
    const fs = new SeekingMemoryFileSystem()
    fs.seed('a.bin', 'abcdefgh')

    expect(dec(await fs.file('a.bin').readRange(2, 3))).toBe('cde')
    expect(fs.asked).toEqual([['a.bin', 2, 3]])
  })
})
