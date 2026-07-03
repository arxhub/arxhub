import { describe, expect, it } from 'vitest'
import { LocalStorageKeyStore, MemoryKeyStore, type StorageLike } from '../keystore'

// Minimal in-memory Web Storage fake for exercising LocalStorageKeyStore without a DOM.
function fakeStorage(): StorageLike {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  }
}

// One suite runs against both backends so they stay behaviourally identical.
for (const [name, make] of [
  ['MemoryKeyStore', () => new MemoryKeyStore()],
  ['LocalStorageKeyStore', () => new LocalStorageKeyStore(fakeStorage())],
] as const) {
  describe(name, () => {
    it('round-trips a value', async () => {
      const ks = make()
      expect(await ks.get('identity.mnemonic')).toBeNull()
      await ks.set('identity.mnemonic', 'abandon about')
      expect(await ks.get('identity.mnemonic')).toBe('abandon about')
      expect(await ks.has('identity.mnemonic')).toBe(true)
    })

    it('reports absence', async () => {
      const ks = make()
      expect(await ks.has('missing')).toBe(false)
      expect(await ks.get('missing')).toBeNull()
    })

    it('deletes', async () => {
      const ks = make()
      await ks.set('k', 'v')
      await ks.delete('k')
      expect(await ks.has('k')).toBe(false)
    })

    it('lists held names', async () => {
      const ks = make()
      await ks.set('a', '1')
      await ks.set('b', '2')
      expect((await ks.list()).sort()).toEqual(['a', 'b'])
    })
  })
}

describe('LocalStorageKeyStore namespacing', () => {
  it('prefixes keys and ignores foreign localStorage entries', async () => {
    const raw = fakeStorage()
    raw.setItem('unrelated', 'x')
    const ks = new LocalStorageKeyStore(raw)
    await ks.set('token', 'secret')
    expect(raw.getItem('arxhub.keystore.token')).toBe('secret')
    expect(await ks.list()).toEqual(['token'])
  })

  it('throws a proper AppError when no storage is available', () => {
    expect(() => new LocalStorageKeyStore(undefined)).toThrow()
  })
})
