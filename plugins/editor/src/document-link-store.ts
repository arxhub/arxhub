import { validation } from '@arxhub/errors'
import { basename } from '@arxhub/path'
import type { SearchExtension } from '@arxhub/plugin-search/ui'
import type { VirtualFileSystem } from '@arxhub/vfs'
import type { Schema } from 'prosemirror-model'
import { identifyBlocks } from './block-identity'
import { documentId, withDocumentId } from './document-history'
import { type ArxDocumentLinks, type DocumentDestination, documentBlocks, documentHref } from './document-links'
import type { ArxFormatConfig } from './document-migrations'
import { deserialize, emptyDoc, serialize } from './editor-format'

export function createDocumentLinkStore(
  vfs: VirtualFileSystem,
  schema: () => Schema,
  open: ArxDocumentLinks['open'],
  search?: SearchExtension,
  flush: (path: string) => Promise<boolean> = async () => true,
  format?: () => ArxFormatConfig,
): ArxDocumentLinks {
  async function read(path: string) {
    const raw = new TextDecoder().decode(await vfs.read(path))
    return { raw, doc: raw.length ? deserialize(schema(), raw, format?.()) : emptyDoc(schema()) }
  }
  async function prepare(path: string) {
    if (!(await flush(path))) throw validation('Save the destination document before creating its link.')
    const { raw, doc } = await read(path)
    const prepared = identifyBlocks(withDocumentId(doc, documentId(doc) ?? crypto.randomUUID()))
    if (!prepared.eq(doc)) {
      if (new TextDecoder().decode(await vfs.read(path)) !== raw) throw validation('The destination changed. Retry creating its link.')
      await vfs.write(path, new TextEncoder().encode(serialize(prepared, format?.())))
    }
    return prepared
  }
  return {
    revision: search?.revision,
    async href(path, anchor) {
      if (!path.toLowerCase().endsWith('.arx')) return documentHref(path, anchor)
      const doc = await prepare(path)
      return documentHref(path, { text: '', ...anchor, documentId: documentId(doc) ?? undefined })
    },
    async open(path, anchor) {
      if (!anchor?.documentId) return open(path, anchor)
      if (await vfs.exists(path)) {
        const current = await read(path)
        if (documentId(current.doc) === anchor.documentId) return open(path, anchor)
      }
      const matches: string[] = []
      for await (const file of vfs.walk('')) {
        if (!file.pathname.toLowerCase().endsWith('.arx')) continue
        const bytes = await vfs.read(file.pathname)
        let raw: unknown
        try {
          raw = JSON.parse(new TextDecoder().decode(bytes))
        } catch {
          continue
        }
        if (raw && typeof raw === 'object' && 'documentId' in raw && raw.documentId === anchor.documentId) matches.push(file.pathname)
      }
      const target = matches.includes(path) ? path : matches.length === 1 ? matches[0] : null
      if (!target)
        throw validation(
          matches.length
            ? 'Several documents have this identity. Open the intended copy directly.'
            : 'The linked document is no longer available.',
        )
      await open(target, anchor)
    },
    async documents(query) {
      if (search) {
        const result = await search.query<DocumentDestination>(
          `SELECT path, title FROM document WHERE ext IN ('arx', 'md', 'markdown') AND (strpos(lower(path), lower($1)) > 0 OR strpos(lower(title), lower($1)) > 0) ORDER BY path LIMIT 100`,
          [query],
        )
        return result.rows
      }
      const result: DocumentDestination[] = []
      for await (const file of vfs.walk('')) {
        if (/\.(arx|md|markdown)$/i.test(file.pathname) && file.pathname.toLowerCase().includes(query.toLowerCase()))
          result.push({ path: file.pathname, title: basename(file.pathname) })
        if (result.length >= 100) break
      }
      return result
    },
    async blocks(path) {
      if (!path.toLowerCase().endsWith('.arx')) return []
      return documentBlocks(await prepare(path))
    },
    async backlinks(path) {
      if (!search) throw validation('Enable the Search plugin to see backlinks.')
      const id = path.toLowerCase().endsWith('.arx') ? documentId((await read(path)).doc) : null
      const result = await search.query<DocumentDestination>(
        `SELECT DISTINCT d.path, d.title FROM ref r JOIN document d ON d.path = r.src_path WHERE r.target_path = $1 OR ($2::text IS NOT NULL AND strpos(r.target_raw, 'document=' || $2) > 0) ORDER BY d.path LIMIT 100`,
        [path.replace(/^\//, ''), id],
      )
      return result.rows
    },
  }
}
