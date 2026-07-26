import { AppError, defineAppError } from '@arxhub/errors'
import type { Static } from '@sinclair/typebox'

// The index could not be opened at all — a missing dataDir, storage the browser refused, a DBMS that
// would not start. The caller decides what that means: the search plugin logs it and carries on with
// a failed status rather than aborting the boot (FR-216).
export const sqlIndexOpenErrorSchema = defineAppError('SqlIndexOpenError', 500)

export const sqlIndexOpen = (dataDir: string, originalError?: unknown) =>
  new AppError<Static<typeof sqlIndexOpenErrorSchema>>(
    {
      code: 'SqlIndexOpenError',
      statusCode: 500,
      title: 'Search index unavailable',
      message: `Could not open the search index at ${dataDir}.`,
    },
    originalError,
  )

// A statement was handed to an index that has already been closed. A programming error rather than
// something a user can cause, so it throws instead of coming back as a rejected query.
export const sqlIndexClosedErrorSchema = defineAppError('SqlIndexClosedError', 500)

export const sqlIndexClosed = (dataDir: string) =>
  new AppError<Static<typeof sqlIndexClosedErrorSchema>>({
    code: 'SqlIndexClosedError',
    statusCode: 500,
    title: 'Search index closed',
    message: `The search index at ${dataDir} is closed.`,
  })

// The user asked for a regular-expression search and wrote an expression that does not parse. Thrown
// rather than answered with an empty result: an empty result reads as "nothing matches", and the
// interface has to keep the previous list and say the expression is wrong (FR-232).
export const searchRegexInvalidErrorSchema = defineAppError('SearchRegexInvalidError', 400)

export const searchRegexInvalid = (pattern: string, originalError?: unknown) =>
  new AppError<Static<typeof searchRegexInvalidErrorSchema>>(
    {
      code: 'SearchRegexInvalidError',
      statusCode: 400,
      title: 'Invalid regular expression',
      message: `${pattern} is not a valid regular expression${reasonOf(originalError)}`,
    },
    originalError,
  )

function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  return message === '' ? '.' : `: ${message}`
}
