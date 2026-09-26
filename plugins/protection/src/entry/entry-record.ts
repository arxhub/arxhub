import type { StorageLike } from '@arxhub/plugin-keystore'

// Where a first run had got to, kept so a restart picks up there rather than at the chooser. It is
// device-local and readable before the unlock (it decides what the screen after the unlock is), so it
// never holds a secret — only a step name and a server address, which the synced config carries anyway.
export type NewVaultStep = 'phrase' | 'check' | 'server'

export type EntryRecord =
  // A new vault whose phrase has not been through its screens yet. Resumed after the unlock.
  | { v: 1; kind: 'new'; step: NewVaultStep }
  // A new vault that finished with a server. Sync writes the address into its config on its first
  // start — nothing remote exists yet, so there is nothing for that write to conflict with.
  | { v: 1; kind: 'connect'; serverUrl: string }
  // A device joining an existing vault, until its first download has landed.
  | { v: 1; kind: 'join'; serverUrl: string; since: string }

export const ENTRY_RECORD_KEY = 'arxhub.entry'

const NEW_VAULT_STEPS: readonly string[] = ['phrase', 'check', 'server'] satisfies NewVaultStep[]

// What the store reads back is a file anyone could have edited; a record that is not exactly one of the
// three shapes reads as none, so the worst a bad one does is send the device to the chooser.
export function parseEntryRecord(raw: string | null): EntryRecord | null {
  if (raw == null) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value == null) return null
  const record = value as Record<string, unknown>
  if (record.v !== 1) return null
  if (record.kind === 'new' && typeof record.step === 'string' && NEW_VAULT_STEPS.includes(record.step)) {
    return { v: 1, kind: 'new', step: record.step as NewVaultStep }
  }
  if (record.kind === 'connect' && isAddress(record.serverUrl)) return { v: 1, kind: 'connect', serverUrl: record.serverUrl }
  if (record.kind === 'join' && isAddress(record.serverUrl) && typeof record.since === 'string') {
    return { v: 1, kind: 'join', serverUrl: record.serverUrl, since: record.since }
  }
  return null
}

function isAddress(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

export class EntryRecordStore {
  private readonly storage: StorageLike | null

  // No Web Storage (a locked-down webview, a test without a DOM) means no resume, not no boot.
  constructor(storage: StorageLike | null | undefined = globalThis.localStorage) {
    this.storage = storage ?? null
  }

  read(): EntryRecord | null {
    try {
      return parseEntryRecord(this.storage?.getItem(ENTRY_RECORD_KEY) ?? null)
    } catch {
      return null
    }
  }

  write(record: EntryRecord): void {
    this.storage?.setItem(ENTRY_RECORD_KEY, JSON.stringify(record))
  }

  clear(): void {
    this.storage?.removeItem(ENTRY_RECORD_KEY)
  }
}
