import { AppError, defineAppError } from '@arxhub/errors'
import type { Static } from '@sinclair/typebox'

// Raised when AES-GCM authentication fails: the wrong key (e.g. wrong mnemonic) or tampered/
// corrupted ciphertext. 400 because it signals bad input to decrypt, not a server fault. Callers
// distinguish it via hasErrorCode(e, 'DecryptionError') to prompt for the correct key.
export const decryptionErrorSchema = defineAppError('DecryptionError', 400)

export const decryptionFailed = (originalError?: unknown, message = 'Failed to decrypt: wrong key or corrupted data') =>
  new AppError<Static<typeof decryptionErrorSchema>>(
    { code: 'DecryptionError', statusCode: 400, title: 'Decryption failed', message },
    originalError,
  )

// Raised when a pairing key agreement cannot produce a key: a peer public key of the wrong length, or
// one of X25519's low-order points, which force the shared secret to zero whatever our own key is. A
// relay that swapped in such a point would otherwise decide the "secret" itself.
export const pairingKeyInvalidSchema = defineAppError('PairingKeyInvalidError', 400)

export const pairingKeyInvalid = (originalError?: unknown, message = 'The other device sent an unusable pairing key.') =>
  new AppError<Static<typeof pairingKeyInvalidSchema>>(
    { code: 'PairingKeyInvalidError', statusCode: 400, title: 'Pairing key invalid', message },
    originalError,
  )

// Raised when a pairing payload decrypted cleanly but is not one this version can use: an unknown
// version, a malformed body or a phrase that fails its checksum. Installing it would leave the device
// with an identity that opens nothing.
export const pairingPayloadInvalidSchema = defineAppError('PairingPayloadInvalidError', 400)

export const pairingPayloadInvalid = (originalError?: unknown, message = 'The key sent by the other device could not be used.') =>
  new AppError<Static<typeof pairingPayloadInvalidSchema>>(
    { code: 'PairingPayloadInvalidError', statusCode: 400, title: 'Pairing payload invalid', message },
    originalError,
  )
