import { describe, expect, expectTypeOf, it } from 'vitest'
import { createTypedHttp, type Endpoints, isHttpError, type TypedHttp } from '../typed-client'

// Stand-in for `ReturnType<typeof syncRoutes>`: the shape Elysia produces at `App['~Routes']`. Method
// keys are lowercase; responses are keyed by status code. Includes a query endpoint (`/vfs/read`) and a
// wildcard path-param endpoint (`/p/*`) to exercise query + path-param typing.
interface MockApp {
  '~Routes': {
    sync: {
      head: {
        get: { body: undefined; query: unknown; params: Record<never, never>; headers: unknown; response: { 200: { head: string | null } } }
        put: {
          body: { expected: string | null; next: string }
          query: unknown
          params: Record<never, never>
          headers: unknown
          response: { 204: unknown }
        }
      }
      objects: {
        get: {
          post: { body: { hashes: string[] }; query: unknown; params: Record<never, never>; headers: unknown; response: { 200: ArrayBuffer } }
        }
      }
    }
    vfs: {
      read: {
        get: { body: undefined; query: { path: string }; params: Record<never, never>; headers: unknown; response: { 200: ArrayBuffer } }
      }
    }
    p: {
      '*': { get: { body: undefined; query: unknown; params: { '*': string }; headers: unknown; response: { 200: string } } }
    }
  }
}

type EP = Endpoints<MockApp>
type Http = TypedHttp<EP>

// A real client whose fetch never resolves — calls below are for TYPE inspection (never awaited), and a
// concrete call expression is the only faithful way to instantiate a generic method's return type.
const http = createTypedHttp<MockApp>({ fetch: (() => new Promise<Response>(() => undefined)) as unknown as typeof fetch })

describe('createTypedHttp inference', () => {
  it('flattens the route tree, keeping a `get` path segment as a path (not a method)', () => {
    expectTypeOf<keyof EP>().toEqualTypeOf<'/sync/head' | '/sync/objects/get' | '/vfs/read' | '/p/*'>()
  })

  it('constrains paths per HTTP method', () => {
    expectTypeOf<Parameters<Http['get']>[0]>().toEqualTypeOf<'/sync/head' | '/vfs/read' | '/p/*'>()
    expectTypeOf<Parameters<Http['put']>[0]>().toEqualTypeOf<'/sync/head'>()
    expectTypeOf<Parameters<Http['post']>[0]>().toEqualTypeOf<'/sync/objects/get'>()
  })

  it('infers response types from the leaf success status', () => {
    expectTypeOf(http.get('/sync/head')).resolves.toEqualTypeOf<{ head: string | null }>()
    expectTypeOf(http.post('/sync/objects/get', { hashes: [] })).resolves.toEqualTypeOf<ArrayBuffer>()
    expectTypeOf(http.put('/sync/head', { expected: null, next: 'x' })).resolves.toEqualTypeOf<unknown>()
  })

  it('enforces body types', () => {
    // @ts-expect-error — wrong body shape for PUT /sync/head
    http.put('/sync/head', { nope: true })
    // @ts-expect-error — POST /sync/objects/get requires a body
    http.post('/sync/objects/get')
  })

  it('requires and types query where the endpoint declares one', () => {
    expectTypeOf(http.get('/vfs/read', { query: { path: 'note.md' } })).resolves.toEqualTypeOf<ArrayBuffer>()
    // @ts-expect-error — /vfs/read requires a typed query
    http.get('/vfs/read')
    // @ts-expect-error — query.path must be a string
    http.get('/vfs/read', { query: { path: 5 } })
  })

  it('requires path params for wildcard / `:name` routes', () => {
    expectTypeOf(http.get('/p/*', { params: { '*': 'a/b' } })).resolves.toEqualTypeOf<string>()
    // @ts-expect-error — /p/* requires params
    http.get('/p/*')
  })

  it('exposes createTypedHttp returning the inferred facade', () => {
    expectTypeOf<ReturnType<typeof createTypedHttp<MockApp>>>().toEqualTypeOf<Http>()
  })
})

describe('isHttpError', () => {
  it('matches wretch-style rejections carrying a numeric status', () => {
    expect(isHttpError({ status: 404 }, 404)).toBe(true)
    expect(isHttpError({ status: 404 }, 409)).toBe(false)
    expect(isHttpError(new Error('nope'), 404)).toBe(false)
  })
})
