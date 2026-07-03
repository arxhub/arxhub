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
