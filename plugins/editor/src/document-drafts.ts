import { decrypt, encrypt } from '@arxhub/crypto'
import { validation } from '@arxhub/errors'
import { isRecord } from './document-migrations'

export interface ArxDraft {
  id: string
  path: string
  base: string
  content: string
  updatedAt: number
}
export interface ArxDraftStore {
  list(path: string): ArxDraft[]
  write(draft: ArxDraft): void
  remove(id: string): void
}

export function createDraftStore(key: Uint8Array, owner: string, storage: Storage = localStorage): ArxDraftStore {
  const prefix = `arxhub.editor.drafts.${owner}.`
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const entryKey = (id: string) => {
    if (!/^[\w-]+$/.test(id)) throw validation('Invalid draft identity')
    return prefix + id
  }
  return {
    list(path) {
      const drafts: ArxDraft[] = []
      for (let i = 0; i < storage.length; i++) {
        const name = storage.key(i)
        if (!name?.startsWith(prefix)) continue
        const value = storage.getItem(name)
        if (!value) continue
        const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
        const draft: unknown = JSON.parse(decoder.decode(decrypt(key, bytes)))
        if (
          !isRecord(draft) ||
          typeof draft.id !== 'string' ||
          typeof draft.path !== 'string' ||
          typeof draft.base !== 'string' ||
          typeof draft.content !== 'string' ||
          typeof draft.updatedAt !== 'number'
        )
          throw validation('A recovery draft is damaged. It has been kept for recovery.')
        if (entryKey(draft.id) !== name) throw validation('Invalid recovery draft identity')
        if (draft.path === path) drafts.push(draft as unknown as ArxDraft)
      }
      return drafts.sort((a, b) => b.updatedAt - a.updatedAt)
    },
    write(draft) {
      const bytes = encrypt(key, encoder.encode(JSON.stringify(draft)))
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      storage.setItem(entryKey(draft.id), btoa(binary))
    },
    remove(id) {
      storage.removeItem(entryKey(id))
    },
  }
}
