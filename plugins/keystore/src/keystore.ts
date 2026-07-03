import { illegalState } from '@arxhub/errors'

// Client-local storage for secret key material (the device mnemonic today; server tokens, device keys
// later). Deliberately NOT the VFS: these secrets must never reach the zero-knowledge sync server, and
// must be readable before any /vfs request is signed. The API is async so a keychain / IndexedDB
// backend can replace the synchronous localStorage one without touching callers.
export interface KeyStore {
  get(name: string): Promise<string | null>
  set(name: string, value: string): Promise<void>
  has(name: string): Promise<boolean>
  delete(name: string): Promise<void>
  // Names currently held (namespace prefix stripped), for a key-management UI.
  list(): Promise<string[]>
}

// The slice of the Web Storage API we rely on — lets tests inject a fake without a full DOM.
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  key(index: number): string | null
  readonly length: number
}

const PREFIX = 'arxhub.keystore.'

// Backed by Web Storage (browser + Tauri webview). Namespaced so it never collides with other
// localStorage users. Synchronous underneath, wrapped in promises to satisfy the async KeyStore.
export class LocalStorageKeyStore implements KeyStore {
  private readonly storage: StorageLike

  constructor(storage: StorageLike | undefined = globalThis.localStorage) {
    if (storage == null) throw illegalState('LocalStorageKeyStore: no Web Storage available in this environment')
    this.storage = storage
  }

  async get(name: string): Promise<string | null> {
    return this.storage.getItem(PREFIX + name)
  }

  async set(name: string, value: string): Promise<void> {
    this.storage.setItem(PREFIX + name, value)
  }

  async has(name: string): Promise<boolean> {
    return this.storage.getItem(PREFIX + name) != null
  }

  async delete(name: string): Promise<void> {
    this.storage.removeItem(PREFIX + name)
  }

  async list(): Promise<string[]> {
    const names: string[] = []
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i)
      if (key?.startsWith(PREFIX)) names.push(key.slice(PREFIX.length))
    }
    return names
  }
}

// In-memory backend for tests and non-browser hosts (headless/node). Not persistent.
export class MemoryKeyStore implements KeyStore {
  private readonly map = new Map<string, string>()

  async get(name: string): Promise<string | null> {
    return this.map.get(name) ?? null
  }

  async set(name: string, value: string): Promise<void> {
    this.map.set(name, value)
  }

  async has(name: string): Promise<boolean> {
    return this.map.has(name)
  }

  async delete(name: string): Promise<void> {
    this.map.delete(name)
  }

  async list(): Promise<string[]> {
    return [...this.map.keys()]
  }
}
