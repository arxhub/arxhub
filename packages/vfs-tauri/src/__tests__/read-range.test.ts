import { ConsoleLogger } from '@arxhub/core'
import { hasErrorCode } from '@arxhub/errors'
import { readRange } from '@arxhub/vfs'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { TauriFileSystem } from '../tauri-file-system'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array) => new TextDecoder().decode(b)

// A real `read()` never fills the whole buffer in one call — the contract says so ("may use all of `p`
// as scratch space" but resolve to fewer bytes) — so the fake caps every call at 7 bytes to force the
// backend's own read loop to run more than once.
const MAX_CHUNK = 7

// Hoisted so both the mock factory (hoisted above imports) and the test bodies can reach the same state.
const state = vi.hoisted(() => {
  const files = new Map<string, Uint8Array>()
  const closeSpy = vi.fn()
  let nextReadError: Error | null = null
  return {
    files,
    closeSpy,
    throwOnNextRead: (e: Error) => {
      nextReadError = e
    },
    takeReadError: () => {
      const e = nextReadError
      nextReadError = null
      return e
    },
  }
})

vi.mock('@tauri-apps/plugin-fs', () => {
  class FakeFileHandle {
    private position = 0
    constructor(private readonly data: Uint8Array) {}

    async seek(offset: number): Promise<number> {
      this.position = offset
      return this.position
    }

    async read(buffer: Uint8Array): Promise<number | null> {
      const err = state.takeReadError()
      if (err) throw err
      if (this.position >= this.data.length) return null
      const n = Math.min(MAX_CHUNK, buffer.length, this.data.length - this.position)
      buffer.set(this.data.subarray(this.position, this.position + n))
      this.position += n
      return n
    }

    async close(): Promise<void> {
      state.closeSpy()
    }
  }

  return {
    BaseDirectory: { AppData: 'AppData' },
    SeekMode: { Start: 'Start', Current: 'Current', End: 'End' },
    mkdir: vi.fn(),
    exists: vi.fn(async (path: string) => state.files.has(path)),
    readDir: vi.fn(),
    readFile: vi.fn(async (path: string) => {
      const data = state.files.get(path)
      if (!data) throw new Error(`ENOENT: ${path}`)
      return data
    }),
    remove: vi.fn(),
    writeFile: vi.fn(),
    stat: vi.fn(async (path: string) => {
      const data = state.files.get(path)
      if (!data) throw new Error(`ENOENT: ${path}`)
      return { size: data.length, isFile: true, mtime: new Date(), birthtime: new Date() }
    }),
    open: vi.fn(async (path: string) => {
      const data = state.files.get(path)
      if (!data) throw new Error(`ENOENT: ${path}`)
      return new FakeFileHandle(data)
    }),
  }
})

describe('TauriFileSystem.readRange', () => {
  let vfs: TauriFileSystem

  beforeEach(() => {
    state.files.clear()
    vi.clearAllMocks()
    vfs = new TauriFileSystem('', undefined, new ConsoleLogger())
  })

  test('a slice from the middle', async () => {
    state.files.set('a.bin', enc('0123456789'))
    expect(dec(await vfs.readRange('a.bin', 3, 4))).toBe('3456')
  })

  test('no length reads to the end', async () => {
    state.files.set('a.bin', enc('0123456789'))
    expect(dec(await vfs.readRange('a.bin', 4))).toBe('456789')
  })

  test('clamps at the end of the file rather than failing', async () => {
    state.files.set('a.bin', enc('0123456789'))
    expect(dec(await vfs.readRange('a.bin', 8, 100))).toBe('89')
  })

  test('offset at or past the end is empty, and the file is never opened', async () => {
    const { open } = await import('@tauri-apps/plugin-fs')
    state.files.set('a.bin', enc('0123456789'))

    const result = await vfs.readRange('a.bin', 10)
    expect(result.byteLength).toBe(0)
    expect(open).not.toHaveBeenCalled()
  })

  test('a negative offset is a suffix — the last |offset| bytes', async () => {
    state.files.set('a.bin', enc('0123456789'))
    expect(dec(await vfs.readRange('a.bin', -3))).toBe('789')
  })

  test('a missing file rejects with FileNotFound', async () => {
    await expect(vfs.readRange('missing.bin', 0, 1)).rejects.toSatisfy((e) => hasErrorCode(e, 'FileNotFound'))
  })

  test('close() runs even when read() throws', async () => {
    state.files.set('a.bin', enc('0123456789'))
    state.throwOnNextRead(new Error('boom'))

    await expect(vfs.readRange('a.bin', 0, 5)).rejects.toThrow('boom')
    expect(state.closeSpy).toHaveBeenCalledTimes(1)
  })

  test('the readRange op picks the native path rather than reading the whole file', async () => {
    state.files.set('a.bin', enc('0123456789'))
    const read = vi.spyOn(vfs, 'read')

    expect(dec(await readRange(vfs, 'a.bin', 2, 3))).toBe('234')
    expect(read).not.toHaveBeenCalled()
  })
})
