import { hasErrorCode } from '@arxhub/errors'
import { describe, expect, test, vi } from 'vitest'
import type { RangeCapable } from '../capabilities/range'
import { openRangeReader } from '../range-reader'
import { dec, enc, MemoryFileSystem } from './memory-file-system'

class StableHeadMemoryFileSystem extends MemoryFileSystem {
  override async head(pathname: string) {
    const bytes = this.files.get(pathname)
    if (bytes == null) throw new Error(`Missing ${pathname}`)
    return { size: bytes.byteLength, modifiedAt: bytes.byteLength, createdAt: bytes.byteLength }
  }
}

class NativeMemoryFileSystem extends StableHeadMemoryFileSystem implements RangeCapable {
  readonly ranges: Array<[string, number, number | undefined]> = []
  shortRead = false

  async readRange(pathname: string, offset: number, length?: number): Promise<Uint8Array> {
    this.ranges.push([pathname, offset, length])
    const bytes = this.files.get(pathname)
    if (bytes == null) throw new Error(`Missing ${pathname}`)
    const start = offset < 0 ? Math.max(0, bytes.byteLength + offset) : offset
    const end = length == null ? bytes.byteLength : Math.min(start + length, bytes.byteLength)
    const result = bytes.slice(start, end)
    return this.shortRead ? result.slice(0, Math.max(0, result.byteLength - 1)) : result
  }
}

class MutatingReadFileSystem extends StableHeadMemoryFileSystem {
  mutateDuringRead = false

  override async read(pathname: string): Promise<Uint8Array> {
    const bytes = await super.read(pathname)
    if (this.mutateDuringRead) {
      this.mutateDuringRead = false
      await super.write(pathname, enc('changed while reading'))
    }
    return bytes
  }
}

describe('openRangeReader', () => {
  test('uses the exact native range without a whole-file read', async () => {
    const fs = new NativeMemoryFileSystem()
    fs.seed('a.bin', '0123456789')
    const read = vi.spyOn(fs, 'read')
    const reader = await openRangeReader(fs, 'a.bin')
    read.mockClear()

    expect(dec(await reader.readRange(2, 3))).toBe('234')
    expect(fs.ranges).toEqual([['a.bin', 2, 3]])
    expect(read).not.toHaveBeenCalled()
  })

  test('keeps the whole-read fallback compatible', async () => {
    const fs = new StableHeadMemoryFileSystem()
    fs.seed('a.bin', '0123456789')
    const reader = await openRangeReader(fs, 'a.bin')
    const read = vi.spyOn(fs, 'read')

    expect(dec(await reader.readRange(3, 4))).toBe('3456')
    expect(read).toHaveBeenCalledOnce()
  })

  test('rejects a file changed before the range read', async () => {
    const fs = new NativeMemoryFileSystem()
    fs.seed('a.bin', '0123456789')
    const reader = await openRangeReader(fs, 'a.bin')
    fs.seed('a.bin', 'changed-size')

    await expect(reader.readRange(0, 2)).rejects.toThrow('file changed while it was being read')
    expect(fs.ranges).toEqual([])
  })

  test('rejects a file changed while the range is being read', async () => {
    const fs = new MutatingReadFileSystem()
    fs.seed('a.bin', '0123456789')
    const reader = await openRangeReader(fs, 'a.bin')
    fs.mutateDuringRead = true

    await expect(reader.readRange(0, 2)).rejects.toThrow('file changed while it was being read')
  })

  test('rejects a short native range', async () => {
    const fs = new NativeMemoryFileSystem()
    fs.seed('a.bin', '0123456789')
    fs.shortRead = true
    const reader = await openRangeReader(fs, 'a.bin')

    await expect(reader.readRange(2, 3)).rejects.toThrow('Short range read')
  })

  test('rejects invalid arguments before doing more I/O', async () => {
    const fs = new NativeMemoryFileSystem()
    fs.seed('a.bin', '0123456789')
    const reader = await openRangeReader(fs, 'a.bin')
    const head = vi.spyOn(fs, 'head')
    const read = vi.spyOn(fs, 'read')

    await expect(reader.readRange(Number.NaN, 1)).rejects.toSatisfy((error: unknown) => hasErrorCode(error, 'ValidationError'))
    await expect(reader.readRange(-2, 1)).rejects.toSatisfy((error: unknown) => hasErrorCode(error, 'ValidationError'))
    expect(head).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
    expect(fs.ranges).toEqual([])
  })
})
