import { describeError } from '@arxhub/i18n'
import { t } from './messages'

// A toast's second line: the translated text of a known code, else whatever the error says, and never
// an empty line — a failure with nothing under it reads as a button that did nothing.
export function errorReason(error: unknown): string {
  const described = describeError(error)?.message.trim()
  if (described) return described
  const message = error instanceof Error ? error.message : String(error ?? '')
  return message.trim() || t('common.unreported')
}
