import { validation } from '@arxhub/errors'
import type { FileHistory } from '@arxhub/sync'
import type { VirtualFileSystem } from '@arxhub/vfs'
import type { Node } from 'prosemirror-model'
import { isRecord } from './document-migrations'

export interface ArxSavedVersion {
  id: string
  savedAt: number
  hash: string
}
export interface ArxVersionContent {
  content: string
  path: string
}
export interface ArxHistoryStore {
  save?(documentId: string, before: string, after: string, path: string, write: () => Promise<void>): Promise<void>
  limit?: number
  list(documentId: string): Promise<ArxSavedVersion[]>
  read(documentId: string, version: ArxSavedVersion): Promise<ArxVersionContent>
  record(documentId: string, content: string, path: string): Promise<void>
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VERSION = /^(\d{16})-([0-9a-f]{64})$/
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const digest = async (content: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(content)))].map((byte) => byte.toString(16).padStart(2, '0')).join('')

export function documentId(doc: Node): string | null {
  const metadata = doc.attrs.arxEnvelope
  if (!isRecord(metadata) || !isRecord(metadata.envelope) || metadata.envelope.documentId === undefined) return null
  const value = metadata.envelope.documentId
  if (typeof value !== 'string' || !ID.test(value)) throw validation('Invalid document identity')
  return value
}

export function withDocumentId(doc: Node, id: string): Node {
  if (!ID.test(id)) throw validation('Invalid document identity')
  const metadata = isRecord(doc.attrs.arxEnvelope) ? doc.attrs.arxEnvelope : {}
  return doc.type.create(
    { ...doc.attrs, arxEnvelope: { ...metadata, envelope: { ...(isRecord(metadata.envelope) ? metadata.envelope : {}), documentId: id } } },
    doc.content,
    doc.marks,
  )
}

export function createSnapshotHistory(
  resolve: () => Pick<FileHistory, 'list' | 'read' | 'record' | 'save'> | null,
  legacy: Pick<VirtualFileSystem, 'exists' | 'list' | 'read' | 'delete'>,
): ArxHistoryStore {
  const migrations = new Map<string, Promise<void>>()
  const history = () => {
    const value = resolve()
    if (!value) throw validation('File history is unavailable')
    return value
  }
  async function migrate(id: string): Promise<void> {
    if (!ID.test(id)) throw validation('Invalid document identity')
    const existing = migrations.get(id)
    if (existing) return existing
    const task = (async () => {
      const dir = `documents/${id}`
      if (!(await legacy.exists(dir))) return
      const entries = (await legacy.list(dir))
        .filter((entry) => entry.kind === 'file' && entry.pathname.endsWith('.json'))
        .sort((a, b) => a.pathname.localeCompare(b.pathname))
      const versions = []
      for (const entry of entries) {
        const match = VERSION.exec(entry.pathname.slice(dir.length + 1, -5))
        const raw: unknown = JSON.parse(decoder.decode(await legacy.read(entry.pathname)))
        if (
          !match ||
          !isRecord(raw) ||
          raw.version !== 1 ||
          raw.documentId !== id ||
          typeof raw.content !== 'string' ||
          typeof raw.path !== 'string' ||
          (await digest(raw.content)) !== match[2] ||
          !Number.isSafeInteger(Number(match[1])) ||
          Number(match[1]) > 8.64e15
        )
          throw validation('A legacy saved version is damaged. Original history has been retained.')
        versions.push({ file: entry.pathname, content: raw.content, path: raw.path, savedAt: Number(match[1]) })
      }
      for (const version of versions) {
        await history().record({
          identity: id,
          path: `vault/${version.path}`,
          content: encoder.encode(version.content),
          savedAt: version.savedAt,
          source: `ArxEditor/${version.file}`,
        })
      }
      for (const version of versions) await legacy.delete(version.file)
    })()
    migrations.set(id, task)
    try {
      await task
    } catch (error) {
      migrations.delete(id)
      throw error
    }
  }
  return {
    async save(id, before, after, path, write) {
      await migrate(id)
      await history().save(
        { identity: id, path: `vault/${path}`, content: encoder.encode(before) },
        { identity: id, path: `vault/${path}`, content: encoder.encode(after) },
        write,
      )
    },
    async list(id) {
      await migrate(id)
      return history().list({ identity: id })
    },
    async read(id, version) {
      await migrate(id)
      const entry = (await history().list({ identity: id })).find((item) => item.id === version.id && item.hash === version.hash)
      if (!entry) throw validation('This saved version is unavailable')
      return { content: decoder.decode(await history().read({ identity: id }, entry)), path: entry.path.slice('vault/'.length) }
    },
    async record(id, content, path) {
      await migrate(id)
      await history().record({ identity: id, content: encoder.encode(content), path: `vault/${path}` })
    },
  }
}

export function versionText(doc: Node): string {
  if (doc.isTextblock) return doc.textContent
  if (doc.isAtom && !doc.isText)
    return `[${doc.type.name}] ${JSON.stringify(Object.fromEntries(Object.entries(doc.attrs).filter(([key]) => key !== 'arxId')))}`
  const parts: string[] = []
  doc.descendants((node) => {
    if (node.type.name === 'task_item') parts.push(node.attrs.checked ? '[Completed]' : '[Incomplete]')
    if (node.type.name === 'section') parts.push(String(node.attrs.title))
    if (node.isTextblock) {
      parts.push(node.textContent)
      return false
    }
    if (node.isAtom && !node.isText) {
      parts.push(versionText(node))
      return false
    }
    return true
  })
  return parts.join('\n\n')
}
