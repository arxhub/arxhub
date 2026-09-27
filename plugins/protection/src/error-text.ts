import { describeError } from '@arxhub/i18n'

// What a person reads about a failure: the catalog's text for a code one of them knows, else what was
// thrown. AppError bodies stay English — they feed the log and the tests.
export function errorText(error: unknown): string {
  return describeError(error)?.message || (error instanceof Error ? error.message : String(error))
}
