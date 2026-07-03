import { illegalState } from '@arxhub/errors'
import { sha256 } from '@noble/hashes/sha2.js'
import { HDKey } from '@scure/bip32'
import { mnemonicToSeed } from './mnemonic'
import { AUTH_PATH, ENCRYPTION_PATH } from './paths'

// A device's derived key material. The seed/mnemonic never leaves the client; the server only ever
// receives `authPublicKey` (an xpub, no private material) when the device is paired.
export interface Keyring {
  // 32-byte AES-256 key for content encryption (the encryption node's private key bytes).
  readonly encryptionKey: Uint8Array
  // Extended PUBLIC key (xpub) of the auth node — safe to share; the server pins it at pairing and
  // uses it to verify request signatures (see ./auth verifyAuth).
  readonly authPublicKey: string
  // Sign a message with the auth private key (ECDSA over secp256k1, on sha256(message)).
  sign(message: Uint8Array): Uint8Array
}

export function keyringFromSeed(seed: Uint8Array): Keyring {
  const root = HDKey.fromMasterSeed(seed)
  const authNode = root.derive(AUTH_PATH)
  const encryptionKey = root.derive(ENCRYPTION_PATH).privateKey
  if (encryptionKey == null) {
    // Unreachable for a seed-derived (private) node; the guard keeps the type honest under strict mode.
    throw illegalState('Derived encryption node has no private key')
  }
  return {
    encryptionKey,
    authPublicKey: authNode.publicExtendedKey,
    sign: (message) => authNode.sign(sha256(message)),
  }
}

export function keyringFromMnemonic(mnemonic: string): Keyring {
  return keyringFromSeed(mnemonicToSeed(mnemonic))
}
