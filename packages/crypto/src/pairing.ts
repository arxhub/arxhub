import { x25519 } from '@noble/curves/ed25519.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { decrypt, encrypt } from './cipher'
import { pairingKeyInvalid, pairingPayloadInvalid } from './errors'
import { validateMnemonic } from './mnemonic'
import { PAIRING_KEY_BYTES, PAIRING_NONCE_BYTES } from './pairing-code'

// Pairing moves the vault's recovery phrase from one device to another through a relay neither device
// trusts. Both sides make an ephemeral X25519 key; the relay could swap either public key for its own,
// so the owner compares a 6-digit SAS derived from both keys on the two screens. Six digits alone could
// be matched by a relay grinding keys offline (~1e6 tries), so the joiner first commits to its nonce
// and reveals it only once the host's nonce is fixed — the Bluetooth numeric-comparison round. By the
// time either nonce is known, both keys are pinned, and a forged SAS is a 1-in-1e6 guess made once.

export interface PairingKeyPair {
  secretKey: Uint8Array
  publicKey: Uint8Array
}

export function generatePairingKeyPair(): PairingKeyPair {
  const { secretKey, publicKey } = x25519.keygen()
  return { secretKey, publicKey }
}

function requireLength(bytes: Uint8Array, length: number, what: string): void {
  if (bytes.length !== length) throw pairingKeyInvalid(undefined, `${what} must be ${length} bytes`)
}

export function pairingCommit(joinerNonce: Uint8Array, joinerKey: Uint8Array): Uint8Array {
  requireLength(joinerNonce, PAIRING_NONCE_BYTES, 'Joiner nonce')
  requireLength(joinerKey, PAIRING_KEY_BYTES, 'Joiner key')
  return sha256(concatBytes(joinerNonce, joinerKey))
}

// Length is not a secret here (every caller compares fixed-size values), so only the contents are
// compared in constant time.
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export function pairingCommitMatches(commit: Uint8Array, joinerNonce: Uint8Array, joinerKey: Uint8Array): boolean {
  return constantTimeEqual(commit, pairingCommit(joinerNonce, joinerKey))
}

const SAS_INFO = utf8ToBytes('arxhub/pair/sas/v1')
const KEY_INFO = utf8ToBytes('arxhub/pair/key/v1')

export interface PairingSasInput {
  id: string
  hostKey: Uint8Array
  joinerKey: Uint8Array
  hostNonce: Uint8Array
  joinerNonce: Uint8Array
}

// Six digits, zero-padded. u32 mod 1e6 is biased by under 0.03% — irrelevant against a single guess.
export function derivePairingSas({ id, hostKey, joinerKey, hostNonce, joinerNonce }: PairingSasInput): string {
  requireLength(hostKey, PAIRING_KEY_BYTES, 'Host key')
  requireLength(joinerKey, PAIRING_KEY_BYTES, 'Joiner key')
  requireLength(hostNonce, PAIRING_NONCE_BYTES, 'Host nonce')
  requireLength(joinerNonce, PAIRING_NONCE_BYTES, 'Joiner nonce')
  const okm = hkdf(sha256, concatBytes(hostKey, joinerKey), sha256(utf8ToBytes(id)), concatBytes(SAS_INFO, hostNonce, joinerNonce), 4)
  const value = new DataView(okm.buffer, okm.byteOffset, okm.byteLength).getUint32(0, false)
  return String(value % 1_000_000).padStart(6, '0')
}

export function formatPairingSas(sas: string): string {
  return `${sas.slice(0, 3)} ${sas.slice(3)}`
}

export interface PairingKeyInput {
  id: string
  ownSecretKey: Uint8Array
  peerPublicKey: Uint8Array
  hostKey: Uint8Array
  joinerKey: Uint8Array
}

export function derivePairingKey({ id, ownSecretKey, peerPublicKey, hostKey, joinerKey }: PairingKeyInput): Uint8Array {
  requireLength(peerPublicKey, PAIRING_KEY_BYTES, 'Peer key')
  requireLength(hostKey, PAIRING_KEY_BYTES, 'Host key')
  requireLength(joinerKey, PAIRING_KEY_BYTES, 'Joiner key')
  let shared: Uint8Array
  try {
    shared = x25519.getSharedSecret(ownSecretKey, peerPublicKey)
  } catch (error) {
    throw pairingKeyInvalid(error)
  }
  // Checked here as well as by the library: this is the property the protocol relies on, not a detail
  // of one version of it.
  if (shared.every((byte) => byte === 0)) throw pairingKeyInvalid()
  return hkdf(sha256, shared, sha256(utf8ToBytes(id)), concatBytes(KEY_INFO, hostKey, joinerKey), 32)
}

export interface PairingPayload {
  v: 1
  mnemonic: string
  serverUrl: string
}

// No AAD: the key is derived for one invitation and used for exactly one message.
export function sealPairingPayload(key: Uint8Array, payload: PairingPayload): Uint8Array {
  return encrypt(key, utf8ToBytes(JSON.stringify(payload)))
}

export function openPairingPayload(key: Uint8Array, blob: Uint8Array): PairingPayload {
  const plaintext = decrypt(key, blob)
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext))
  } catch (error) {
    throw pairingPayloadInvalid(error)
  }
  if (typeof value !== 'object' || value == null) throw pairingPayloadInvalid()
  const { v, mnemonic, serverUrl } = value as Record<string, unknown>
  if (v !== 1 || typeof mnemonic !== 'string' || typeof serverUrl !== 'string' || !validateMnemonic(mnemonic)) {
    throw pairingPayloadInvalid()
  }
  return { v, mnemonic, serverUrl }
}
