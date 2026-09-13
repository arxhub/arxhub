import { validation } from '@arxhub/errors'
import type { FileCheckpoint } from '@arxhub/sync'
import { describe, expect, it, vi } from 'vitest'
import { createSnapshotHistory, documentId, withDocumentId } from '../document-history'
import { deserialize, serialize } from '../editor-format'
import { schema } from '../editor-schema'

const id = '12345678-1234-1234-1234-123456789abc'
const encoder = new TextEncoder()
async function legacyFile(content: string, savedAt: number) {
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(content)))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return {
    path: `documents/${id}/${String(savedAt).padStart(16, '0')}-${hash}.json`,
    bytes: encoder.encode(JSON.stringify({ version: 1, documentId: id, path: 'note.arx', content })),
  }
}
function fixture(files: Map<string, Uint8Array>) {
  const checkpoints: FileCheckpoint[] = []
  const record = vi.fn(async (checkpoint: FileCheckpoint) => {
    checkpoints.push(checkpoint)
  })
  const snapshots = { list: async () => [], read: async () => new Uint8Array(), record, save: vi.fn() }
  const legacy = {
    exists: async () => files.size > 0,
    list: async () => [...files.keys()].map((pathname) => ({ kind: 'file' as const, pathname })),
    read: async (path: string) => files.get(path)!,
    delete: async (path: string) => {
      files.delete(path)
    },
  }
  return { store: createSnapshotHistory(() => snapshots, legacy), record, checkpoints }
}

describe('snapshot history adapter', () => {
  it('imports verified legacy versions oldest first before deleting the original files', async () => {
    const first = await legacyFile('first', 1000)
    const second = await legacyFile('second', 2000)
    const files = new Map([
      [second.path, second.bytes],
      [first.path, first.bytes],
    ])
    const { store, checkpoints } = fixture(files)
    await store.list(id)
    expect(checkpoints.map((item) => new TextDecoder().decode(item.content))).toEqual(['first', 'second'])
    expect(checkpoints.map((item) => item.savedAt)).toEqual([1000, 2000])
    expect(checkpoints[0]).toMatchObject({ path: 'vault/note.arx', identity: id, source: `ArxEditor/${first.path}` })
    expect(files.size).toBe(0)
    await store.record(id, 'current', 'renamed.arx')
    expect(checkpoints.at(-1)).toMatchObject({ path: 'vault/renamed.arx', identity: id })
    expect(checkpoints).toHaveLength(3)
  })

  it('retains every original when import fails and retries with the same source identity', async () => {
    const first = await legacyFile('first', 1000)
    const files = new Map([[first.path, first.bytes]])
    const { store, record } = fixture(files)
    record.mockRejectedValueOnce(validation('Storage offline'))
    await expect(store.list(id)).rejects.toThrow('offline')
    expect(files.size).toBe(1)
    await store.list(id)
    expect(record.mock.calls[0][0].source).toBe(record.mock.calls[1][0].source)
    expect(files.size).toBe(0)
  })

  it('refuses corrupted history before importing or deleting anything', async () => {
    const first = await legacyFile('first', 1000)
    const files = new Map([[first.path, encoder.encode(JSON.stringify({ version: 1, documentId: id, path: 'note.arx', content: 'tampered' }))]])
    const { store, record } = fixture(files)
    await expect(store.list(id)).rejects.toThrow('damaged')
    expect(record).not.toHaveBeenCalled()
    expect(files.size).toBe(1)
    await expect(store.list('../../escape')).rejects.toThrow('identity')
  })

  it('keeps the document identity through serialization', () => {
    const doc = withDocumentId(schema.node('doc', null, schema.node('paragraph')), id)
    expect(documentId(deserialize(schema, serialize(doc)))).toBe(id)
  })
})
