export type { EntryServer } from './entry/entry-flow'
export type { EntryRecord } from './entry/entry-record'
export { IDENTITY_MNEMONIC_KEY, loadKeyring } from './identity'
export { KeyringExtension } from './keyring-extension'
export { decideIdentityChange, type IdentityDecision, type IdentitySituation } from './owner-decision'
export type { OwnerVerdict } from './owner-marker'
export {
  PairingHost,
  type PairingHostOptions,
  type PairingHostPhase,
  type PairingInvitation,
  PairingJoiner,
  type PairingJoinerOptions,
  type PairingJoinerPhase,
} from './pairing/pairing-client'
export { PAIRING_TTL_MS, type PairingState } from './pairing/wire'
export { PairingExtension, type QrScanPort } from './pairing-extension'
export { ProtectionPlugin } from './protection-plugin'
export { clearVaultWorkingTree, isVaultEmpty } from './vault-reset'
