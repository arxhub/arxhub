import { validation } from '@arxhub/errors'
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

export function createHistoryStore(
  storage: Pick<VirtualFileSystem, 'exists' | 'list' | 'read' | 'write' | 'delete'>,
  limit = 100,
): ArxHistoryStore {
  if (!Number.isInteger(limit) || limit < 2) throw validation('Version retention must keep at least two versions')
  const pending = new Map<string, Promise<void>>()
  const directory = (id: string) => {
    if (!ID.test(id)) throw validation('Invalid document identity')
    return `documents/${id}`
  }
  const pathOf = (id: string, version: ArxSavedVersion) => {
    if (!VERSION.test(version.id)) throw validation('Invalid saved version')
    return `${directory(id)}/${version.id}.json`
  }
  const store: ArxHistoryStore = {
    limit,
    async list(id) {
      const dir = directory(id)
      if (!(await storage.exists(dir))) return []
      const entries = await storage.list(dir)
      const result: ArxSavedVersion[] = []
      for (const entry of entries) {
        const name = entry.pathname.slice(dir.length + 1)
        if (entry.kind !== 'file' || !name.endsWith('.json')) continue
        const versionId = name.slice(0, -5)
        const match = VERSION.exec(versionId)
        if (match && Number.isSafeInteger(Number(match[1])) && Number(match[1]) <= 8.64e15)
          result.push({ id: versionId, savedAt: Number(match[1]), hash: match[2] })
      }
      return result.sort((a, b) => b.savedAt - a.savedAt || b.id.localeCompare(a.id))
    },
    async read(id, version) {
      const raw: unknown = JSON.parse(decoder.decode(await storage.read(pathOf(id, version))))
      if (
        !isRecord(raw) ||
        raw.version !== 1 ||
        raw.documentId !== id ||
        typeof raw.content !== 'string' ||
        typeof raw.path !== 'string' ||
        (await digest(raw.content)) !== version.hash
      )
        throw validation('This saved version is damaged or incomplete.')
      return { content: raw.content, path: raw.path }
    },
    async record(id, content, path) {
      directory(id)
      const work = (pending.get(id) ?? Promise.resolve())
        .catch(() => {})
        .then(async () => {
          const versions = await store.list(id)
          const hash = await digest(content)
          const latest = versions[0]
          if (latest?.hash === hash) {
            let samePath = false
            try {
              samePath = (await store.read(id, latest)).path === path
            } catch {
              // A damaged backup must not prevent a fresh, verified copy of the current document.
            }
            if (samePath) {
              for (const old of versions.slice(limit)) await storage.delete(pathOf(id, old))
              return
            }
          }
          const savedAt = Math.max(Date.now(), (latest?.savedAt ?? 0) + 1)
          const version = { id: `${String(savedAt).padStart(16, '0')}-${hash}`, savedAt, hash }
          await storage.write(pathOf(id, version), encoder.encode(JSON.stringify({ version: 1, documentId: id, path, content })))
          for (const old of versions.slice(limit - 1)) await storage.delete(pathOf(id, old))
        })
      pending.set(id, work)
      try {
        await work
      } finally {
        if (pending.get(id) === work) pending.delete(id)
      }
    },
  }
  return store
}

export function versionText(doc: Node): string {
  const parts: string[] = []
  doc.descendants((node) => {
    if (node.type.name === 'section') parts.push(String(node.attrs.title))
    if (node.isTextblock) {
      parts.push(node.textContent)
      return false
    }
    if (node.isAtom && !node.isText) {
      parts.push(`[${node.type.name}] ${node.attrs.caption ?? node.attrs.name ?? node.attrs.label ?? ''}`)
      return false
    }
    return true
  })
  return parts.join('\n\n')
}
