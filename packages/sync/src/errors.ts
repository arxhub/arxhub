import { AppError, defineAppError } from '@arxhub/errors'
import type { Static } from '@sinclair/typebox'

// Raised when the remote head moved between this sync round's read and its own commit attempt —
// another device won the compare-and-swap race. Self-healing by construction: SyncEngine.sync()
// catches this specific code and retries the whole round a bounded number of times before giving up,
// so it should rarely escape to a caller. Its own code exists so a UI can tell "we'll converge on our
// own" apart from a genuine failure (a rollback, a corrupt object, a network fault) instead of both
// painting the same alarming "Sync failed" state — the two call for opposite reactions from a user.
export const syncHeadMovedSchema = defineAppError('SyncHeadMovedError', 409)

export const syncHeadMoved = () =>
  new AppError<Static<typeof syncHeadMovedSchema>>({
    code: 'SyncHeadMovedError',
    statusCode: 409,
    title: 'Remote head moved',
    message: 'Another device committed to the remote while this sync was in progress.',
  })
