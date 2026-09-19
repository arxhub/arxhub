import type { Logger } from '@arxhub/core'
import { describe, expect, test, vi } from 'vitest'
import { HttpFileSystem } from '../http-file-system'

const silent: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silent,
}

const responseFetch = (status: number, body: unknown) =>
  vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch

describe('HttpFileSystem.list', () => {
  test('a missing prefix remains the server route normal empty result', async () => {
    const fetch = responseFetch(200, { entries: [] })
    const vfs = new HttpFileSystem({ baseUrl: 'http://vfs.test', fetch }, silent)

    await expect(vfs.list('missing')).resolves.toEqual([])
    expect(fetch).toHaveBeenCalledOnce()
  })

  test.each([403, 404, 503])('an HTTP %s is propagated instead of becoming an empty list', async (status) => {
    const vfs = new HttpFileSystem({ baseUrl: 'http://vfs.test', fetch: responseFetch(status, { message: 'refused' }) }, silent)

    await expect(vfs.list('storage/budget')).rejects.toMatchObject({ status })
  })

  test('a transport failure is propagated instead of becoming an empty list', async () => {
    const cause = new TypeError('connection refused')
    const fetch = vi.fn(async () => {
      throw cause
    }) as unknown as typeof globalThis.fetch
    const vfs = new HttpFileSystem({ baseUrl: 'http://vfs.test', fetch }, silent)

    await expect(vfs.list('storage/budget')).rejects.toBe(cause)
  })
})
