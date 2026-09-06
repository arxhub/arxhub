// What entering a recovery phrase means for the data already on this device. Kept apart from the
// Security page so every branch — including the one that deletes the working tree — is decided by a
// pure function and can be tested without a DOM.

export interface IdentitySituation {
  // Auth public key derived from the phrase the user typed: `keyringFromMnemonic(phrase).authPublicKey`.
  // Pure, offline and instant — comparing keys is what turns "is this a phrase" into "is this YOUR
  // phrase", and it needs no network round trip.
  entered: string
  // This device's identity right now.
  current: string
  // Who the data on disk belongs to, as recorded before this boot; null when nothing is recorded.
  previousOwner: string | null
  // True only when the vault is known to hold nothing. An emptiness check that failed must report
  // false: the destructive question is the safe answer when we cannot see what is at stake.
  vaultEmpty: boolean
}

export type IdentityDecision =
  // Nothing on disk to lose — replace without asking anything.
  | { kind: 'nothing-to-lose' }
  // Already this device's phrase. Say so; change nothing.
  | { kind: 'already-this-device' }
  // The right phrase for the data on disk — a reinstall, or a cleared key store. Restore it and keep
  // every local file; there are no two branches here, because nothing is being taken from anyone.
  | { kind: 'restores-owner' }
  // Someone else's phrase while this device holds content. The only case that earns the destructive
  // question.
  | { kind: 'foreign-owner' }

export function decideIdentityChange(situation: IdentitySituation): IdentityDecision {
  if (situation.vaultEmpty) return { kind: 'nothing-to-lose' }
  if (situation.entered === situation.current) return { kind: 'already-this-device' }
  if (situation.previousOwner != null && situation.entered === situation.previousOwner) return { kind: 'restores-owner' }
  return { kind: 'foreign-owner' }
}
