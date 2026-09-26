import type { EntryRecord, NewVaultStep } from './entry-record'

// What a device looks like before anything is on screen. `hasIdentity` is only readable while the store
// is not locked — a locked store's entries are ciphertext until the code opens it.
export interface EntrySituation {
  locked: boolean
  hasIdentity: boolean
  record: EntryRecord | null
  // A shipped build never boots with its secrets in the clear (A-18).
  requireLock: boolean
}

export type EntryDecision =
  // The chooser: a new vault, or this device joining one.
  | { kind: 'first-run' }
  // A device from before the entry flow, holding an identity in the clear on a build that requires a
  // lock: the existing "create a code" gate, nothing more.
  | { kind: 'setup-lock' }
  | { kind: 'unlock' }
  // A new vault stopped before its phrase had been through its screens.
  | { kind: 'resume'; step: NewVaultStep }
  | { kind: 'boot' }

// Before the unlock. Every outcome but `unlock` is final; `unlock` is followed by decideAfterUnlock.
export function decideEntry(situation: EntrySituation): EntryDecision {
  if (situation.locked) return { kind: 'unlock' }
  if (!situation.hasIdentity) return { kind: 'first-run' }
  // Unreachable on a shipped build, where the code is set before the phrase exists; kept so the dev
  // stand, which never demands a lock, still shows a phrase it created rather than booting past it.
  if (situation.record?.kind === 'new') return { kind: 'resume', step: situation.record.step }
  if (situation.requireLock) return { kind: 'setup-lock' }
  return { kind: 'boot' }
}

export interface UnlockedSituation {
  hasIdentity: boolean
  record: EntryRecord | null
}

export type UnlockedDecision =
  | { kind: 'resume'; step: NewVaultStep }
  // The code exists but the identity does not — the app was closed between the two. The chooser again,
  // without its code step.
  | { kind: 'first-run' }
  | { kind: 'boot' }

export function decideAfterUnlock(situation: UnlockedSituation): UnlockedDecision {
  if (!situation.hasIdentity) return { kind: 'first-run' }
  if (situation.record?.kind === 'new') return { kind: 'resume', step: situation.record.step }
  return { kind: 'boot' }
}
