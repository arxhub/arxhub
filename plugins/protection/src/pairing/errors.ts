import { AppError, defineAppError, type GenericAppError, isAppError } from '@arxhub/errors'
import { type Static, Type } from '@sinclair/typebox'

// Unknown, expired and finished answer the same on purpose: telling them apart would let a stranger
// learn which codes were ever issued.
export const pairingNotFoundSchema = defineAppError('PairingNotFoundError', 404)
export const pairingNotFound = (message = 'This invitation does not exist or is no longer valid.') =>
  new AppError<Static<typeof pairingNotFoundSchema>>({ code: 'PairingNotFoundError', statusCode: 404, title: 'Invitation not found', message })

export const pairingClaimedSchema = defineAppError('PairingClaimedError', 409)
export const pairingClaimed = (message = 'Another device has already used this invitation.') =>
  new AppError<Static<typeof pairingClaimedSchema>>({ code: 'PairingClaimedError', statusCode: 409, title: 'Invitation already used', message })

export const pairingStateSchema = defineAppError('PairingStateError', 409)
export const pairingState = (message = 'This step does not fit where the invitation is.') =>
  new AppError<Static<typeof pairingStateSchema>>({ code: 'PairingStateError', statusCode: 409, title: 'Pairing step out of order', message })

export const pairingForbiddenSchema = defineAppError('PairingForbiddenError', 403)
export const pairingForbidden = (message = 'This device did not claim the invitation.') =>
  new AppError<Static<typeof pairingForbiddenSchema>>({
    code: 'PairingForbiddenError',
    statusCode: 403,
    title: 'Not the claiming device',
    message,
  })

export const pairingRateLimitedSchema = Type.Composite([
  defineAppError('PairingRateLimitedError', 429),
  Type.Object({ retryAfterSeconds: Type.Number() }),
])
export const pairingRateLimited = (retryAfterSeconds: number, message = 'Too many requests for this invitation — wait a moment.') =>
  new AppError<Static<typeof pairingRateLimitedSchema>>({
    code: 'PairingRateLimitedError',
    statusCode: 429,
    title: 'Too many requests',
    message,
    retryAfterSeconds,
  })

export const pairingLimitSchema = defineAppError('PairingLimitError', 429)
export const pairingLimit = (message = 'Too many open invitations — cancel one or wait for it to expire.') =>
  new AppError<Static<typeof pairingLimitSchema>>({ code: 'PairingLimitError', statusCode: 429, title: 'Too many invitations', message })

// Client side: the joiner revealed a nonce that is not the one it committed to before seeing ours —
// the one thing that would let a relay steer the digits both screens show.
export const pairingCommitMismatchSchema = defineAppError('PairingCommitMismatchError', 400)
export const pairingCommitMismatch = (message = 'The invitation was tampered with.') =>
  new AppError<Static<typeof pairingCommitMismatchSchema>>({
    code: 'PairingCommitMismatchError',
    statusCode: 400,
    title: 'Invitation tampered with',
    message,
  })

// Client side: the owner said the two screens show different digits. Whatever the relay delivers
// after that is not opened.
export const pairingSasMismatchSchema = defineAppError('PairingSasMismatchError', 400)
export const pairingSasMismatch = (message = "The digits didn't match, so nothing was taken. Start again on the first device.") =>
  new AppError<Static<typeof pairingSasMismatchSchema>>({
    code: 'PairingSasMismatchError',
    statusCode: 400,
    title: 'Digits did not match',
    message,
  })

export const pairingExpiredSchema = defineAppError('PairingExpiredError', 410)
export const pairingExpired = (message = 'The invitation expired.') =>
  new AppError<Static<typeof pairingExpiredSchema>>({ code: 'PairingExpiredError', statusCode: 410, title: 'Invitation expired', message })

export const pairingCancelledSchema = defineAppError('PairingCancelledError', 409)
export const pairingCancelled = (message = 'The other device cancelled the connection.') =>
  new AppError<Static<typeof pairingCancelledSchema>>({
    code: 'PairingCancelledError',
    statusCode: 409,
    title: 'Connection cancelled',
    message,
  })

export function retryAfterOf(error: unknown): number | null {
  if (!isAppError(error) || error.body.code !== 'PairingRateLimitedError') return null
  const value = (error.body as GenericAppError & { retryAfterSeconds?: unknown }).retryAfterSeconds
  return typeof value === 'number' ? value : null
}

const rebuild: Record<string, (body: GenericAppError & { retryAfterSeconds?: unknown }) => AppError> = {
  PairingNotFoundError: (b) => pairingNotFound(b.message),
  PairingClaimedError: (b) => pairingClaimed(b.message),
  PairingStateError: (b) => pairingState(b.message),
  PairingForbiddenError: (b) => pairingForbidden(b.message),
  PairingRateLimitedError: (b) => pairingRateLimited(typeof b.retryAfterSeconds === 'number' ? b.retryAfterSeconds : 1, b.message),
  PairingLimitError: (b) => pairingLimit(b.message),
}

// The relay's refusal as the same AppError the server raised, so a client branches on one code
// whichever side of the wire it came from. Null for anything that is not a relay error body.
export function pairingErrorFromBody(body: unknown): AppError | null {
  if (typeof body !== 'object' || body == null) return null
  const { code, message } = body as { code?: unknown; message?: unknown }
  if (typeof code !== 'string' || typeof message !== 'string') return null
  return rebuild[code]?.(body as GenericAppError) ?? null
}
