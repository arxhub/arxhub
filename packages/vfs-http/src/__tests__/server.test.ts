import type { VirtualFileSystem } from '@arxhub/vfs'
import { fileNotFound } from '@arxhub/vfs'
import { describe, expect, test } from 'vitest'
import { vfsRoutes } from '../server'

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
    const res = await vfsRoutes(vfs).handle(req('DELETE', '/vfs/delete?recursive=1'))
    expect(res.status).toBe(400)
    expect(calls.find((c) => c.method === 'delete')).toBeUndefined()
  })

  test.each(['read', 'head', 'exists'])('%s with no path is rejected', async (route) => {
    const { vfs, calls } = makeVfs()
    const res = await vfsRoutes(vfs).handle(req('GET', `/vfs/${route}`))
    expect(res.status).toBe(400)
    expect(calls.find((c) => c.method === route)).toBeUndefined()
  })

  test('write with no path is rejected (with a valid body, so the path guard is what fires)', async () => {
    const { vfs, calls } = makeVfs()
    const res = await vfsRoutes(vfs).handle(putReq('/vfs/write'))
    expect(res.status).toBe(400)
    expect(calls.find((c) => c.method === 'write')).toBeUndefined()
  })

  test('forward-slash traversal is rejected', async () => {
    const { vfs, calls } = makeVfs()
    const res = await vfsRoutes(vfs).handle(req('GET', '/vfs/read?path=a/../../etc/passwd'))
    expect(res.status).toBe(400)
    expect(calls.find((c) => c.method === 'read')).toBeUndefined()
  })

  test('backslash traversal is rejected (platform-independent)', async () => {
    const { vfs, calls } = makeVfs()
    const res = await vfsRoutes(vfs).handle(req('GET', `/vfs/read?path=${encodeURIComponent('..\\..\\secret')}`))
    expect(res.status).toBe(400)
    expect(calls.find((c) => c.method === 'read')).toBeUndefined()
  })

  test('a valid nested path is normalized and forwarded', async () => {
    const { vfs, calls } = makeVfs()
    const res = await vfsRoutes(vfs).handle(req('GET', '/vfs/read?path=a/b/../c/note.txt'))
    expect(res.status).toBe(200)
    expect(calls).toContainEqual({ method: 'read', path: 'a/c/note.txt' })
  })

  test('list accepts an empty prefix (the whole tree)', async () => {
    const { vfs, calls } = makeVfs()
    const res = await vfsRoutes(vfs).handle(req('GET', '/vfs/list'))
    expect(res.status).toBe(200)
    expect(calls).toContainEqual({ method: 'list', path: '' })
  })

  test('a missing file maps to 404, not 400 or 500', async () => {
    const vfs = {
      read: async (path: string) => {
        throw fileNotFound(path)
      },
    } as unknown as VirtualFileSystem
    const res = await vfsRoutes(vfs).handle(req('GET', '/vfs/read?path=does/not/exist.txt'))
    expect(res.status).toBe(404)
  })
})
