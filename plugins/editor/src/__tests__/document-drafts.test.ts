import { describe, expect, it } from 'vitest'
import { createDraftStore } from '../document-drafts'

function memory(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value)
    },
    removeItem: (key) => {
      entries.delete(key)
    },
    clear: () => entries.clear(),
  }
}

describe('encrypted local drafts', () => {
  it('retains concurrent drafts, isolates owners and never stores plaintext', () => {
    const storage = memory()
    const key = crypto.getRandomValues(new Uint8Array(32))
    const store = createDraftStore(key, 'owner', storage)
    const draft = { id: 'one', path: 'note.arx', base: 'before', content: 'private words', updatedAt: 1 }
    store.write(draft)
    store.write({ ...draft, id: 'two', updatedAt: 2 })
    expect(store.list('note.arx').map((entry) => entry.id)).toEqual(['two', 'one'])
    expect(storage.getItem(storage.key(0)!)).not.toContain('private words')
    expect(createDraftStore(key, 'other', storage).list('note.arx')).toEqual([])
    store.remove('two')
    expect(store.list('note.arx')).toEqual([draft])
    expect(() => createDraftStore(crypto.getRandomValues(new Uint8Array(32)), 'owner', storage).list('note.arx')).toThrow()
    expect(storage.length).toBe(1)
  })
})
