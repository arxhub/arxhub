import { AppError, defineAppError } from '@arxhub/errors'
import type { Static } from '@sinclair/typebox'

// Raised when an unlock code fails to open the device lock. Deliberately does not distinguish "wrong
// code" from "corrupted ciphertext": both mean the store cannot be opened with what was supplied, and
// telling them apart would only help someone probing a stolen copy. Callers match on the code to keep
// the unlock prompt open instead of treating it as a crash.
export const unlockFailedSchema = defineAppError('UnlockFailedError', 400)

export const unlockFailed = (originalError?: unknown, message = 'That code did not unlock this device.') =>
  new AppError<Static<typeof unlockFailedSchema>>(
    { code: 'UnlockFailedError', statusCode: 400, title: 'Unlock failed', message },
    originalError,
  )

// Raised when enabling or changing the lock is asked for a code that is too short to be worth the
// ceremony. The minimum is enforced at the edge as well; this guards the programmatic path.
export const unlockCodeTooShortSchema = defineAppError('UnlockCodeTooShortError', 400)

export const unlockCodeTooShort = (minLength: number) =>
  new AppError<Static<typeof unlockCodeTooShortSchema>>({
    code: 'UnlockCodeTooShortError',
    statusCode: 400,
    title: 'Unlock code too short',
    message: `An unlock code must be at least ${minLength} digits.`,
  })

// Raised when a code that is not digits is offered to the lock. The keypad cannot produce one, so
// reaching this means something other than the keypad is calling — and a code that cannot be typed
// back in on the one input that exists would lock the device against its owner.
export const unlockCodeNotNumericSchema = defineAppError('UnlockCodeNotNumericError', 400)

export const unlockCodeNotNumeric = () =>
  new AppError<Static<typeof unlockCodeNotNumericSchema>>({
    code: 'UnlockCodeNotNumericError',
    statusCode: 400,
    title: 'Unlock code must be digits',
    message: 'An unlock code is digits only — it is entered on the keypad.',
  })
