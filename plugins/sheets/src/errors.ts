import { AppError, type GenericAppError } from '@arxhub/errors'
import { describeError, interpolate, type ParamsOf } from '@arxhub/i18n'
import { en } from './i18n/en'

type Entries = (typeof en)['errors']
export type SheetsErrorCode = keyof Entries

// The body is always English — it feeds logs, the merger's warnings and tests; what the person reads is
// looked up by `code` in the catalog (describeError). One code per message, so a translation never has to
// guess which English sentence it replaces.
export function sheetsError<C extends SheetsErrorCode>(code: C, ...params: ParamsOf<Entries[C]['message']>): AppError {
  const values = (params[0] ?? {}) as Record<string, string | number>
  const entry = en.errors[code]
  const body: GenericAppError = { ...values, code, statusCode: 400, title: entry.title, message: interpolate(entry.message, values) }
  return new AppError(body)
}

// A worker cannot post an AppError, only its body; describeError reads the body the same way.
export function errorBody(error: unknown, fallback: SheetsErrorCode): GenericAppError {
  if (error instanceof AppError) return error.body
  return sheetsError(fallback).body
}

export function errorText(error: unknown): string {
  const described = describeError(error)
  if (described && described.message !== '') return described.message
  return error instanceof Error ? error.message : String(error)
}
