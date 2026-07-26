import { apiBaseUrl } from '@arxhub/core'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { failOrRethrow, safePath } from '@arxhub/vfs-http/server'
import Elysia, { type AnyElysia } from 'elysia'
import { PUBLISH_NAMESPACE } from '../namespace'
import type { PublishManifest } from '../publish-manifest'
import { contentTypeFor } from './content-type'
import { PublishReader } from './publish-reader'

// Anonymous read surface, RELATIVE prefix `/public`; arxhub mounts it under the publish namespace →
// `/api/publish/public/*`. Every handler is GET so the auth guard's method-restricted allowlist covers
// it without opening any write surface.
export const PUBLIC_ROUTE_PREFIX = '/public'

// The full path the anonymous surface resolves to, for the protection guard's publicGetPrefixes. arxhub
// bakes `/api/<namespace>`; publish's namespace is `publish`, so instances allowlist this.
export const PUBLIC_READ_PATH = `${apiBaseUrl('', PUBLISH_NAMESPACE)}${PUBLIC_ROUTE_PREFIX}`

// A folder URL with no source file of its own tries these in order before returning 404.
const INDEX_CANDIDATES = ['index.md', 'index.arx', 'index.html']

// Public read routes for published content. The server reassembles each file from its chunks and
// serves the source bytes with a content type — it never converts anything to HTML, so a reader who
// opens a `.md` link gets markdown, not a page. Whoever wants the file list can read `~manifest`.
export function publicReadRoutes(vfs: VirtualFileSystem): AnyElysia {
  const reader = new PublishReader(vfs)

  return new Elysia({ prefix: PUBLIC_ROUTE_PREFIX }).get('/*', async ({ params, set }) => {
    try {
      const path = safePath(params['*'], { allowEmpty: true })

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
      // Source bytes as published, typed by extension — no rendering step anywhere in the path.
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
