import { validation } from '@arxhub/errors'
import { basename } from '@arxhub/path'
import type { SearchExtension } from '@arxhub/plugin-search/ui'
import type { VirtualFileSystem } from '@arxhub/vfs'
import type { Schema } from 'prosemirror-model'
import { type ArxDocumentLinks, type DocumentDestination, documentBlocks } from './document-links'
import { deserialize } from './editor-format'

export function createDocumentLinkStore(
  vfs: VirtualFileSystem,
  schema: () => Schema,
  open: ArxDocumentLinks['open'],
  search?: SearchExtension,
): ArxDocumentLinks {
  return {
    revision: search?.revision,
    open,
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
      const raw = new TextDecoder().decode(await vfs.read(path))
      return documentBlocks(deserialize(schema(), raw))
    },
    async backlinks(path) {
      if (!search) throw validation('Enable the Search plugin to see backlinks.')
      const result = await search.query<DocumentDestination>(
        `SELECT DISTINCT d.path, d.title FROM ref r JOIN document d ON d.path = r.src_path WHERE r.target_path = $1 ORDER BY d.path LIMIT 100`,
        [path.replace(/^\//, '')],
      )
      return result.rows
    },
  }
}
