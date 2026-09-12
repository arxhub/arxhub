import { validation } from '@arxhub/errors'
import { describe, expect, it } from 'vitest'
import { createHistoryStore, documentId, withDocumentId } from '../document-history'
import { deserialize, serialize } from '../editor-format'
import { schema } from '../editor-schema'

const id = '12345678-1234-1234-1234-123456789abc'
function memory() {
  const files = new Map<string, Uint8Array>()
  let fail = false
  return {
    files,
    fail: () => {
      fail = true
    },
    store: createHistoryStore(
      {
        exists: async (path) => [...files.keys()].some((name) => name.startsWith(`${path}/`)),
        list: async (path) =>
          [...files.keys()].filter((name) => name.startsWith(`${path}/`)).map((pathname) => ({ kind: 'file' as const, pathname })),
        read: async (path) => {
          const bytes = files.get(path)
          if (!bytes) throw validation('Missing version')
          return bytes
        },
        write: async (path, bytes) => {
          if (fail) {
            fail = false
            throw validation('Storage offline')
          }
          files.set(path, bytes)
        },
        delete: async (path) => {
          files.delete(path)
        },
      },
      3,
    ),
  }
}

describe('saved document versions', () => {
  it('serializes concurrent saves, deduplicates identical content and retains a bounded history', async () => {
    const { store } = memory()
    await Promise.all([store.record(id, 'first', 'note.arx'), store.record(id, 'second', 'note.arx'), store.record(id, 'second', 'note.arx')])
    expect(await store.list(id)).toHaveLength(2)
    await store.record(id, 'third', 'note.arx')
    await store.record(id, 'fourth', 'note.arx')
    const versions = await store.list(id)
    expect(versions).toHaveLength(3)
    expect((await store.read(id, versions[0])).content).toBe('fourth')
    expect((await store.read(id, versions[2])).content).toBe('second')
  })

  it('preserves older versions on a failed write and detects corrupted content', async () => {
    const { store, files, fail } = memory()
    await store.record(id, 'first', 'note.arx')
    fail()
    await expect(store.record(id, 'second', 'note.arx')).rejects.toThrow('offline')
    const versions = await store.list(id)
    expect(versions).toHaveLength(1)
    expect((await store.read(id, versions[0])).content).toBe('first')
    const path = [...files.keys()][0]
    files.set(path, new TextEncoder().encode(JSON.stringify({ version: 1, documentId: id, path: 'note.arx', content: 'tampered' })))
    await expect(store.read(id, versions[0])).rejects.toThrow('damaged')
    await store.record(id, 'first', 'note.arx')
    const recovered = await store.list(id)
    expect(recovered).toHaveLength(2)
    expect((await store.read(id, recovered[0])).content).toBe('first')
    await expect(store.list('../../escape')).rejects.toThrow('identity')
  })

  it('keeps the document identity through serialization and records a renamed path without dropping history', async () => {
    const doc = withDocumentId(schema.node('doc', null, schema.node('paragraph')), id)
    expect(documentId(deserialize(schema, serialize(doc)))).toBe(id)
    const { store } = memory()
    await store.record(id, serialize(doc), 'old.arx')
    await store.record(id, serialize(doc), 'renamed.arx')
    const versions = await store.list(id)
    expect(versions).toHaveLength(2)
    expect((await store.read(id, versions[0])).path).toBe('renamed.arx')
  })
})
