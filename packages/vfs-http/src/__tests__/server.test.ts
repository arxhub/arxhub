import type { VirtualFileSystem } from '@arxhub/vfs'
import { fileNotFound } from '@arxhub/vfs'
import { describe, expect, test } from 'vitest'
import { vfsRoutes } from '../server'

// A 10-byte payload with distinct bytes at every offset, so a range test can assert exactly which
// slice came back rather than just its length.
const RANGE_PAYLOAD = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])

// Records the path each VFS method was invoked with so tests can assert what reached the backend
// (and, critically, that traversal/empty paths never do). Returns benign values for the rest.
function makeVfs() {
  const calls: { method: string; path: string }[] = []
  const record = (method: string, path: string) => {
    calls.push({ method, path })
  }
  const vfs = {
    list: async (prefix: string) => {
      record('list', prefix)
      return []
    },
    read: async (path: string) => {
      record('read', path)
      if (path === 'a.bin') return RANGE_PAYLOAD
      return new Uint8Array()
    },
    write: async (path: string, _content: Uint8Array) => {
      record('write', path)
    },
    delete: async (path: string) => {
      record('delete', path)
    },
    exists: async (path: string) => {
      record('exists', path)
      return true
    },
    head: async (path: string) => {
      record('head', path)
      return { size: 0, modifiedAt: 0, createdAt: 0 }
    },
  } as unknown as VirtualFileSystem
  return { vfs, calls }
}

// Same as makeVfs, but the fake VFS also declares readRange — so a test can prove the route calls
// the OP (which prefers a native readRange) rather than always falling back to read()+slice.
function makeRangeCapableVfs() {
  const calls: { method: string; path: string }[] = []
  const record = (method: string, path: string) => {
    calls.push({ method, path })
  }
  const vfs = {
    read: async (path: string) => {
      record('read', path)
      return RANGE_PAYLOAD
    },
    readRange: async (path: string, offset: number, length?: number) => {
      record('readRange', path)
      const start = offset < 0 ? RANGE_PAYLOAD.length + offset : offset
      const end = length === undefined ? RANGE_PAYLOAD.length : start + length
      return RANGE_PAYLOAD.slice(start, end)
    },
  } as unknown as VirtualFileSystem
  return { vfs, calls }
}

const req = (method: string, path: string) => new Request(`http://localhost${path}`, { method })

// A PUT carrying a valid body, so the request passes Elysia's t.ArrayBuffer() body validation and
// actually reaches the path guard (a bodyless PUT is rejected earlier with 422 by the validator).
const putReq = (path: string) =>
  new Request(`http://localhost${path}`, {
    method: 'PUT',
    body: new Uint8Array([1, 2, 3]),
    headers: { 'content-type': 'application/octet-stream' },
  })

describe('vfsRoutes path safety', () => {
  test('DELETE with no path is rejected (must never resolve to the VFS root)', async () => {
    const { vfs, calls } = makeVfs()
    const res = await vfsRoutes(vfs).handle(req('DELETE', '/delete?recursive=1'))
    expect(res.status).toBe(400)
    expect(calls.find((c) => c.method === 'delete')).toBeUndefined()
  })

  test.each(['read', 'head', 'exists'])('%s with no path is rejected', async (route) => {
    const { vfs, calls } = makeVfs()
    const res = await vfsRoutes(vfs).handle(req('GET', `/${route}`))
    expect(res.status).toBe(400)
    expect(calls.find((c) => c.method === route)).toBeUndefined()
  })

  test('write with no path is rejected (with a valid body, so the path guard is what fires)', async () => {
    const { vfs, calls } = makeVfs()
    const res = await vfsRoutes(vfs).handle(putReq('/write'))
    expect(res.status).toBe(400)
    expect(calls.find((c) => c.method === 'write')).toBeUndefined()
  })

  test('forward-slash traversal is rejected', async () => {
    const { vfs, calls } = makeVfs()
    const res = await vfsRoutes(vfs).handle(req('GET', '/read?path=a/../../etc/passwd'))
    expect(res.status).toBe(400)
    expect(calls.find((c) => c.method === 'read')).toBeUndefined()
  })

  test('backslash traversal is rejected (platform-independent)', async () => {
    const { vfs, calls } = makeVfs()
    const res = await vfsRoutes(vfs).handle(req('GET', `/read?path=${encodeURIComponent('..\\..\\secret')}`))
    expect(res.status).toBe(400)
    expect(calls.find((c) => c.method === 'read')).toBeUndefined()
  })

  test('a valid nested path is normalized and forwarded', async () => {
    const { vfs, calls } = makeVfs()
    const res = await vfsRoutes(vfs).handle(req('GET', '/read?path=a/b/../c/note.txt'))
    expect(res.status).toBe(200)
    expect(calls).toContainEqual({ method: 'read', path: 'a/c/note.txt' })
  })

  test('list accepts an empty prefix (the whole tree)', async () => {
    const { vfs, calls } = makeVfs()
    const res = await vfsRoutes(vfs).handle(req('GET', '/list'))
    expect(res.status).toBe(200)
    expect(calls).toContainEqual({ method: 'list', path: '' })
  })

  test('a missing file maps to 404, not 400 or 500', async () => {
    const vfs = {
      read: async (path: string) => {
        throw fileNotFound(path)
      },
    } as unknown as VirtualFileSystem
    const res = await vfsRoutes(vfs).handle(req('GET', '/read?path=does/not/exist.txt'))
    expect(res.status).toBe(404)
  })
})

describe('vfsRoutes /read-range', () => {
  test('a bounded range returns the requested slice with the octet-stream content-type', async () => {
    const { vfs } = makeVfs()
    const res = await vfsRoutes(vfs).handle(req('GET', '/read-range?path=a.bin&offset=2&length=3'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/octet-stream')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(RANGE_PAYLOAD.slice(2, 5))
  })

  test('no length reads to the end of the file', async () => {
    const { vfs } = makeVfs()
    const res = await vfsRoutes(vfs).handle(req('GET', '/read-range?path=a.bin&offset=7'))
    expect(res.status).toBe(200)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(RANGE_PAYLOAD.slice(7))
  })

  test('a negative offset is a suffix range: the last |offset| bytes', async () => {
    const { vfs } = makeVfs()
    const res = await vfsRoutes(vfs).handle(req('GET', '/read-range?path=a.bin&offset=-3'))
    expect(res.status).toBe(200)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(RANGE_PAYLOAD.slice(-3))
  })

  test('an offset past the end of the file is clamped to an empty slice, not an error', async () => {
    const { vfs } = makeVfs()
    const res = await vfsRoutes(vfs).handle(req('GET', '/read-range?path=a.bin&offset=50'))
    expect(res.status).toBe(200)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array())
  })

  test('a non-numeric offset is a 400 (Number(...) is NaN, resolveRange rejects it)', async () => {
    const { vfs } = makeVfs()
    const res = await vfsRoutes(vfs).handle(req('GET', '/read-range?path=a.bin&offset=abc'))
    expect(res.status).toBe(400)
  })

  test('a traversal path is a 400', async () => {
    const { vfs } = makeVfs()
    const res = await vfsRoutes(vfs).handle(req('GET', '/read-range?path=..%2F..%2Fetc&offset=0'))
    expect(res.status).toBe(400)
  })

  test('a missing file maps to 404', async () => {
    const vfs = {
      read: async (path: string) => {
        throw fileNotFound(path)
      },
    } as unknown as VirtualFileSystem
    const res = await vfsRoutes(vfs).handle(req('GET', '/read-range?path=does/not/exist.bin&offset=0'))
    expect(res.status).toBe(404)
  })

  test('the route calls the readRange OP, which prefers a native readRange over read()+slice', async () => {
    const { vfs, calls } = makeRangeCapableVfs()
    const res = await vfsRoutes(vfs).handle(req('GET', '/read-range?path=a.bin&offset=2&length=3'))
    expect(res.status).toBe(200)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(RANGE_PAYLOAD.slice(2, 5))
    expect(calls).toContainEqual({ method: 'readRange', path: 'a.bin' })
    expect(calls.find((c) => c.method === 'read')).toBeUndefined()
  })
})
