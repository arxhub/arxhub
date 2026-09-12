import { validation } from '@arxhub/errors'
import { extname } from '@arxhub/path'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { failOrRethrow, safePath } from '@arxhub/vfs-http/server'
import Elysia, { type AnyElysia } from 'elysia'
import { PUBLIC_ROUTE_PREFIX } from '../public-url'
import type { PublishManifest } from '../publish-manifest'
import { arxReader } from './arx-reader'
import { contentTypeFor } from './content-type'
import { PublishReader } from './publish-reader'

// Anonymous read surface, RELATIVE prefix `/public`; arxhub mounts it under the publish namespace →
// `/api/publish/public/*`. Every handler is GET so the auth guard's method-restricted allowlist covers
// it without opening any write surface.
export { PUBLIC_READ_PATH, PUBLIC_ROUTE_PREFIX } from '../public-url'

// A folder URL with no source file of its own tries these in order before returning 404.
const INDEX_CANDIDATES = ['index.md', 'index.arx', 'index.html']

// Resolve through the current manifest on EVERY read, including source downloads; revocation must
// take effect even when a reader already knows a former file's URL.
export function publicReadRoutes(vfs: VirtualFileSystem): AnyElysia {
  const reader = new PublishReader(vfs)

  return new Elysia({ prefix: PUBLIC_ROUTE_PREFIX }).get('/*', async ({ params, query, set }) => {
    try {
      set.headers['cache-control'] = 'no-store'
      set.headers['x-content-type-options'] = 'nosniff'
      let decoded: string
      try {
        // Elysia's wildcard is still URL-encoded; decode once before validating the vault path.
        decoded = decodeURIComponent(params['*'])
      } catch {
        throw validation('Invalid URL encoding')
      }
      const path = safePath(decoded, { allowEmpty: true })

      const manifest = await reader.getManifest()
      if (manifest == null) {
        set.status = 404
        return 'Not Found'
      }

      // Machine-readable index of the published tree, for a reader that wants to enumerate it.
      if (path === '~manifest') return jsonResponse(manifest)

      const served = await resolve(reader, manifest, path)
      if (served == null) {
        set.status = 404
        return 'Not Found'
      }
      if (extname(served.pathname).toLowerCase() === '.arx') {
        if (query.source === '1') {
          return new Response(new Uint8Array(served.bytes), {
            headers: {
              'content-type': 'application/json',
              'content-disposition': `attachment; filename="document.arx"; filename*=UTF-8''${encodeURIComponent(served.pathname.split('/').at(-1) ?? 'document.arx')}`,
            },
          })
        }
        const rendered = manifest.rendered?.[served.pathname]
          ? await reader.readFile({ ...manifest, files: manifest.rendered }, served.pathname)
          : null
        const page = rendered
          ? { html: new TextDecoder().decode(rendered), status: manifest.rendered?.[served.pathname]?.status === 422 ? 422 : 200 }
          : arxReader(new TextDecoder().decode(served.bytes), served.pathname)
        return new Response(page.html, {
          status: page.status,
          headers: {
            'content-type': 'text/html; charset=utf-8',
            ...(query.html === '1' ? { 'content-disposition': `attachment; filename="document.html"` } : {}),
            'content-security-policy':
              "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: http:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
            'referrer-policy': 'no-referrer',
          },
        })
      }
      return new Response(new Uint8Array(served.bytes), { headers: { 'content-type': contentTypeFor(served.pathname) } })
    } catch (e) {
      return failOrRethrow(e, set)
    }
  })
}

// Resolve a URL path to a concrete published file: the path itself, else one of its index files.
async function resolve(
  reader: PublishReader,
  manifest: PublishManifest,
  path: string,
): Promise<{ pathname: string; bytes: Uint8Array } | null> {
  const direct = await reader.readFile(manifest, path)
  if (direct != null) return { pathname: path, bytes: direct }

  for (const candidate of INDEX_CANDIDATES) {
    const indexPath = path === '' ? candidate : `${path}/${candidate}`
    const bytes = await reader.readFile(manifest, indexPath)
    if (bytes != null) return { pathname: indexPath, bytes }
  }
  return null
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
}
