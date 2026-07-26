import { AppError, defineAppError } from '@arxhub/errors'
import type { Static } from '@sinclair/typebox'

// Raised when a plugin asks the index a question while there is no index — it failed to open, or the
// plugin was stopped. It throws rather than answering with no rows: an empty result reads as "nothing
// matches", and a caller acting on that would draw the wrong conclusion (FR-238).
export const searchIndexUnavailableErrorSchema = defineAppError('SearchIndexUnavailableError', 503)

export const searchIndexUnavailable = (reason?: string | null) =>
  new AppError<Static<typeof searchIndexUnavailableErrorSchema>>({
    code: 'SearchIndexUnavailableError',
    statusCode: 503,
    title: 'Search index unavailable',
    message: reason == null || reason.length === 0 ? 'The search index is not open.' : `The search index is not open: ${reason}`,
  })
