import type { Text } from '@arxhub/i18n'
import type { BlockAnchor } from '@arxhub/plugin-documents'
import type { SearchExtension } from '@arxhub/plugin-search'
import type { Ref } from 'vue'
import { t } from './i18n/messages'

const DATA_LAYOUTS = ['list', 'board', 'calendar'] as const
export type DataLayout = (typeof DATA_LAYOUTS)[number]

export function isLayout(value: unknown): value is DataLayout {
  return DATA_LAYOUTS.some((layout) => layout === value)
}
export interface ArxDataItem {
  id: string
  title: string
  path: string
  anchor?: BlockAnchor
  group?: string
  date?: string
}
export interface ArxDataSource {
  // Contributed once, in configure(); read when the settings draw.
  label: Text
  layouts: readonly DataLayout[]
  revision?: Ref<number>
  load(query: string): Promise<{ items: ArxDataItem[]; truncated?: boolean }>
}

export function searchDataSources(search: SearchExtension): Record<string, ArxDataSource> {
  return {
    tasks: {
      label: () => t('data.sources.tasks'),
      layouts: ['list', 'board'],
      revision: search.revision,
      async load(query) {
        const result = await search.query<{ id: string; content: string; doc_path: string; checked: boolean; skip: number }>(
          `SELECT b.id, b.content, b.doc_path, b.checked, (SELECT count(*)::int FROM block p WHERE p.doc_path = b.doc_path AND p.ordinal < b.ordinal AND p.content = b.content) AS skip FROM block b JOIN document d ON d.path = b.doc_path WHERE d.kind = 'arx' AND b.type = 'task' AND (strpos(lower(b.content), lower($1)) > 0 OR strpos(lower(b.doc_path), lower($1)) > 0) ORDER BY b.doc_path, b.ordinal LIMIT 201`,
          [query],
        )
        return {
          truncated: result.rows.length > 200,
          items: result.rows.slice(0, 200).map((row) => ({
            id: row.id,
            title: row.content,
            path: row.doc_path,
            anchor: { text: row.content, skip: row.skip },
            group: row.checked ? t('data.groups.completed') : t('data.groups.incomplete'),
          })),
        }
      },
    },
    documents: {
      label: () => t('data.sources.documents'),
      layouts: ['list', 'board', 'calendar'],
      revision: search.revision,
      async load(query) {
        const result = await search.query<{ path: string; title: string; dir: string; mtime: number }>(
          `SELECT path, title, dir, mtime FROM document WHERE kind = 'arx' AND (strpos(lower(title), lower($1)) > 0 OR strpos(lower(path), lower($1)) > 0) ORDER BY mtime DESC, path LIMIT 201`,
          [query],
        )
        return {
          truncated: result.rows.length > 200,
          items: result.rows.slice(0, 200).map((row) => ({
            id: row.path,
            path: row.path,
            title: row.title,
            group: row.dir || t('data.groups.vault'),
            date: localDay(Number(row.mtime)),
          })),
        }
      },
    },
  }
}

// The calendar day on this device's clock: a note saved at 01:00 belongs to that day, not to the UTC one
// before it.
export function localDay(ms: number): string {
  const date = new Date(ms)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
