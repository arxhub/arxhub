import { AppError, type GenericAppError } from '@arxhub/errors'
import { errorReason, interpolate } from '@arxhub/i18n'
import { en } from './i18n/en'
import { t } from './i18n/messages'

export type EditorErrorCode = keyof typeof en.errors

// A refusal the person reads, as opposed to a malformed file or a programming error (those stay
// `validation`/`illegalState`). The body keeps the catalog's English — logs and tests read it — and
// `reasonText` hands the reader the same entry in their language.
// `params` fill the entry's `{name}` placeholders in the English body and travel on it, so the reader's
// catalog fills its own copy of the sentence from the same values.
export function editorError(code: EditorErrorCode, params: Record<string, string | number> = {}): AppError<GenericAppError> {
  const { title, message } = en.errors[code]
  return new AppError({ ...params, code, statusCode: 409, title: interpolate(title, params), message: interpolate(message, params) })
}

export function reasonText(reason: unknown): string {
  if (typeof reason === 'string') return reason || t('unknownReason')
  return errorReason(reason, t('unknownReason'))
}
