import { createHttpClient, type HttpClient, type HttpClientOptions } from './index'

// A typed HTTP facade over wretch (createHttpClient), shaped like `http.post(url, body)` but with the
// url, body and response types INFERRED from an Elysia server's type. It reads Elysia's internal route
// tree at `App['~Routes']` — the same source Eden Treaty consumes — so the server route definitions are
// the single source of truth: no hand-written route consts, no parallel request/response interfaces.
//
// `App` is constrained structurally, so this package takes NO dependency on elysia; the concrete app
// type flows in from the caller, e.g. `createTypedHttp<SyncApp>(...)` where
// `export type SyncApp = ReturnType<typeof syncRoutes>` (the route builder must NOT be annotated
// `: AnyElysia`, or the route tree is erased).

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch'

// biome-ignore lint/complexity/noBannedTypes: `{}` is the canonical "no required members" probe in conditional-type position — no clean equivalent.
type EmptyObject = {}

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never

// Elysia nests routes by path segment (`/objects/stat` → `{ objects: { stat: { post: Leaf } } }`) with
// method-keyed leaves. Flatten back to `{ '/objects/stat': { post: Leaf } }` so we can index by path.
// A leaf is detected by SHAPE (it carries `response`), never by whether its key looks like an HTTP
// method — a path segment can legitimately be named `get` (e.g. `/objects/get`, which is a POST).
type FlattenRoutes<T, Prefix extends string = ''> = UnionToIntersection<
  {
    [K in keyof T & string]: T[K] extends { response: unknown }
      ? { [Path in Prefix]: { [M in K]: T[K] } }
      : FlattenRoutes<T[K], `${Prefix}/${K}`>
  }[keyof T & string]
>

type RouteTreeOf<App> = App extends { '~Routes': infer Routes } ? Routes : never

export type Endpoints<App> = FlattenRoutes<RouteTreeOf<App>>

// A leaf is `{ body, query, params, headers, response: { [status]: T } }`. Take the union of declared
// 2xx responses. Always index with a COMPUTED key (`keyof Res & …`); a bare literal index like
// `Res[200]` resolves to `never` against the still-generic leaf, while the computed form resolves.
type SuccessStatus = 200 | 201 | 202 | 203 | 204 | 205 | 206
type SuccessResponse<Leaf> = Leaf extends { response: infer Res }
  ? [keyof Res & SuccessStatus] extends [never]
    ? Res[keyof Res & number]
    : Res[keyof Res & SuccessStatus]
  : unknown

type BodyOf<Leaf> = Leaf extends { body: infer B } ? B : undefined
type QueryOf<Leaf> = Leaf extends { query: infer Q } ? Q : undefined

// Path params: Elysia puts `/read/:name` and wildcard `/*` params under the leaf's `params`. An empty
// `{}` (no params) collapses to `never` so the opts key disappears rather than demanding `{}`.
type ParamsOf<Leaf> = Leaf extends { params: infer P } ? ([keyof P] extends [never] ? never : P) : never

// A raw-bytes body (Elysia `t.ArrayBuffer()`) also accepts a Uint8Array from the caller.
type BodyArg<Leaf> = BodyOf<Leaf> extends ArrayBuffer ? ArrayBufferView | ArrayBuffer : BodyOf<Leaf>

type PathsFor<EP, M extends HttpMethod> = { [P in keyof EP]: M extends keyof EP[P] ? P : never }[keyof EP] & string
type LeafFor<EP, M extends HttpMethod, P extends keyof EP> = M extends keyof EP[P] ? EP[P][M] : never

// Per-call options: typed `query`, and `params` for path/wildcard interpolation. Each key is present
// only when the endpoint declares a non-empty query/params shape (an unset Elysia schema is `unknown`).
type RequestOpts<Leaf> = (unknown extends QueryOf<Leaf> ? { query?: Record<string, string> } : { query: QueryOf<Leaf> }) &
  ([ParamsOf<Leaf>] extends [never] ? EmptyObject : { params: ParamsOf<Leaf> })

// When every opts key is optional the argument itself is optional; when any is required (typed query,
// path params) the caller must pass it.
type OptsArg<Leaf> = EmptyObject extends RequestOpts<Leaf> ? [opts?: RequestOpts<Leaf>] : [opts: RequestOpts<Leaf>]

export interface TypedHttp<EP> {
  get<P extends PathsFor<EP, 'get'>>(url: P, ...opts: OptsArg<LeafFor<EP, 'get', P>>): Promise<SuccessResponse<LeafFor<EP, 'get', P>>>
  delete<P extends PathsFor<EP, 'delete'>>(
    url: P,
    ...opts: OptsArg<LeafFor<EP, 'delete', P>>
  ): Promise<SuccessResponse<LeafFor<EP, 'delete', P>>>
  post<P extends PathsFor<EP, 'post'>>(
    url: P,
    body: BodyArg<LeafFor<EP, 'post', P>>,
    ...opts: OptsArg<LeafFor<EP, 'post', P>>
  ): Promise<SuccessResponse<LeafFor<EP, 'post', P>>>
  put<P extends PathsFor<EP, 'put'>>(
    url: P,
    body: BodyArg<LeafFor<EP, 'put', P>>,
    ...opts: OptsArg<LeafFor<EP, 'put', P>>
  ): Promise<SuccessResponse<LeafFor<EP, 'put', P>>>
}

function isBinaryBody(body: unknown): body is ArrayBufferView | ArrayBuffer {
  return body instanceof ArrayBuffer || ArrayBuffer.isView(body)
}

// Parse by what the server actually sent: 204/empty → undefined, json → parsed, octet-stream → bytes,
// anything else → text. The declared response type (from the app) tells the CALLER what to expect;
// this keeps the runtime honest against it. Non-2xx responses reject before reaching here (wretch),
// carrying `.status` — see isHttpError.
async function parseResponse(res: Response): Promise<unknown> {
  if (res.status === 204 || res.status === 205) return undefined
  const type = res.headers.get('content-type') ?? ''
  if (type.includes('application/json')) return res.json()
  if (type.includes('application/octet-stream')) return new Uint8Array(await res.arrayBuffer())
  const text = await res.text()
  return text === '' ? undefined : text
}

// Substitute `:name` and a trailing `*` wildcard from params. `:name` segments are encoded; the `*`
// remainder is inserted raw (it is itself a slash-separated path, e.g. the publish reader's `/p/*`).
function interpolatePath(url: string, params: Record<string, string> | undefined): string {
  if (params == null) return url
  let out = url
  for (const [name, value] of Object.entries(params)) {
    out = name === '*' ? out.replace(/\*$/, value) : out.replace(`:${name}`, encodeURIComponent(value))
  }
  return out
}

interface SendOpts {
  query?: Record<string, unknown>
  params?: Record<string, string>
}

function send(client: HttpClient, method: HttpMethod, url: string, body: unknown, opts: SendOpts | undefined): Promise<unknown> {
  let req = client.url(interpolatePath(url, opts?.params))
  if (opts?.query != null) req = req.query(opts.query)
  if (method === 'get') return req.get().res().then(parseResponse)
  if (method === 'delete') return req.delete().res().then(parseResponse)
  if (isBinaryBody(body)) {
    // Fresh ArrayBuffer-backed view (TS 6 / node 25 typed-array generics), matching HttpFileSystem.write.
    const raw = req.content('application/octet-stream').body(new Uint8Array(body as ArrayBufferView & ArrayBuffer))
    return (method === 'post' ? raw.post() : method === 'put' ? raw.put() : raw.patch()).res().then(parseResponse)
  }
  const verb = method === 'post' ? req.post(body) : method === 'put' ? req.put(body) : req.patch(body)
  return verb.res().then(parseResponse)
}

export interface TypedHttpOptions extends HttpClientOptions {
  // Base URL the server mounts the routes under. A trailing slash is trimmed.
  baseUrl?: string
}

// Build a typed client for an Elysia app. `fetch`/`middlewares` are forwarded to createHttpClient, so
// request signing (a middleware) works exactly as it does for the raw client — same wretch underneath.
export function createTypedHttp<App>(options: TypedHttpOptions = {}): TypedHttp<Endpoints<App>> {
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '')
  const client = createHttpClient(baseUrl, { fetch: options.fetch, middlewares: options.middlewares })
  const withoutBody = (method: HttpMethod) => (url: string, opts?: SendOpts) => send(client, method, url, undefined, opts)
  const withBody = (method: HttpMethod) => (url: string, body: unknown, opts?: SendOpts) => send(client, method, url, body, opts)
  // The runtime object is untyped (routes are erased at runtime); assert it against the inferred facade.
  return {
    get: withoutBody('get'),
    delete: withoutBody('delete'),
    post: withBody('post'),
    put: withBody('put'),
  } as unknown as TypedHttp<Endpoints<App>>
}

// True when a rejected request carries the given HTTP status (wretch rejects non-2xx with `.status`).
// Lets callers branch on expected statuses (409 head conflict, 404 not found) without .error() chains.
export function isHttpError(error: unknown, status: number): boolean {
  return typeof error === 'object' && error != null && 'status' in error && (error as { status: unknown }).status === status
}
